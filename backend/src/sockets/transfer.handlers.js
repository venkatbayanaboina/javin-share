import { config } from '../config.js';
import { logger } from '../logger.js';
import { store, pushRecentTransfer } from '../state/store.js';
import { checkAndReleaseStaleTransferLocks } from '../services/transfer-lock.service.js';
import {
  getPeerPage,
  isPeerOnSession,
  PeerPage,
  peersOnPage,
  setPeerPage,
} from '../services/peer-page.service.js';
import { scheduleAbandonedSenderCheck } from '../jobs/abandoned-sender.job.js';
import { emitNavigate } from './navigate.js';
import { clearGraceRedirect } from '../services/grace-redirect.service.js';
import { isSafeId } from '../utils/ids.js';
import { canActAs, emitToHostSocket, settleResponses } from './transfer.helpers.js';
import { scheduleSenderDisruption } from './sender-grace.js';
import { executeSenderDeparture } from './transfer.helpers.js';

/**
 * File transfer events: send lock, offers, accept/reject, progress and
 * cancellation.
 */
export function registerTransferHandlers(io, socket) {
  // 🎯 ENHANCED: Send lock system with automatic redirects
  socket.on('request-send-lock', ({ sessionId, senderId }, ack) => {
    const session = store.sessions.get(sessionId);
    if (!session)
      return typeof ack === 'function' && ack({ ok: false, reason: 'session_not_found' });
    if (!canActAs(socket, senderId)) {
      return typeof ack === 'function' && ack({ ok: false, reason: 'forbidden' });
    }

    // Check if host is in the main page
    const hostPeer = Array.from(session.peers.values()).find((p) => p.role === 'host');
    const hostInMainPage = hostPeer && isPeerOnSession(hostPeer);

    logger.info(
      `🔍 request-send-lock debug: senderId=${senderId}, hostPeerId=${hostPeer?.peerId}, senderId === hostPeerId: ${senderId === hostPeer?.peerId}, hostInMainPage=${hostInMainPage}`,
    );

    // If host is not in main page, but exists or grace window is active, proactively move host to main and proceed
    if (!hostInMainPage) {
      const hostPage = hostPeer ? getPeerPage(hostPeer) : null;
      if (
        hostPeer &&
        senderId !== hostPeer.peerId &&
        hostPage !== PeerPage.SEND &&
        hostPage !== PeerPage.RECEIVE
      ) {
        logger.info(`⚠️ Host not on main, proactively redirecting for sender ${senderId}`);
        try {
          // Update host's page state to main
          setPeerPage(hostPeer, PeerPage.SESSION);
          session.peers.set(hostPeer.peerId, hostPeer);
          const connectedPeers = Array.from(session.peers.values()).filter(
            (p) => !p.isDisconnected,
          );
          io.in(sessionId).emit('peers-updated', connectedPeers);
          setPeerPage(hostPeer, PeerPage.SESSION);
          emitNavigate(io, hostPeer.socketId, {
            page: PeerPage.SESSION,
            sessionId,
            role: 'host',
            peerId: hostPeer.peerId,
          });
          clearGraceRedirect(session, io, { notifyHost: true });
          // Release any stale locks
          checkAndReleaseStaleTransferLocks(sessionId, io);
        } catch (_) {}
      } else if (!hostPeer) {
        logger.info(`❌ No host present in session, rejecting send lock request from ${senderId}`);
        return (
          typeof ack === 'function' &&
          ack({
            ok: false,
            reason: 'host_not_ready',
            message: 'Please wait for the host to connect (30 seconds delay).',
          })
        );
      }
    }

    // 🎯 ENHANCED CHECK: If someone is in send page, lock send button for others AND redirect them to receive
    const peersInSendPage = peersOnPage(session, PeerPage.SEND);

    if (peersInSendPage.length > 0) {
      const senderInSendPage = peersInSendPage.find((p) => p.peerId === senderId);
      if (!senderInSendPage) {
        logger.info(
          `🚫 Blocking send lock for ${senderId} - ${peersInSendPage.length} peer(s) currently in send page`,
        );

        // 🆕 NEW: Automatically redirect this peer to receive page since sender is active
        const peer = session.peers.get(senderId);
        if (peer) {
          logger.info(
            `🔄 Automatically redirecting ${senderId} to receive page since sender is active`,
          );
          setPeerPage(peer, PeerPage.RECEIVE);
          session.peers.set(senderId, peer);
          emitNavigate(io, peer.socketId, {
            page: PeerPage.RECEIVE,
            reason: 'sender_already_active',
            message:
              'Someone is already sending files. You have been redirected to the receive page.',
            sessionId,
            role: peer.role,
            peerId: peer.peerId,
          });
        }

        return (
          typeof ack === 'function' &&
          ack({
            ok: false,
            reason: 'send_page_occupied',
            message:
              'Someone is currently sending files. You have been redirected to the receive page.',
            autoRedirect: true,
          })
        );
      }
    }

    // Check if there's an active transfer lock
    if (session.currentSenderPeerId && session.currentSenderPeerId !== senderId) {
      logger.info(
        `🚫 Send lock already held by ${session.currentSenderPeerId}, rejecting ${senderId}`,
      );
      return (
        typeof ack === 'function' &&
        ack({
          ok: false,
          reason: 'locked',
          message: 'Another file transfer is already in progress. Please wait.',
          currentSender: session.currentSenderPeerId,
        })
      );
    }

    // Grant send lock and mark sender on send page (avoids abandoned-sender race before enter-send-page)
    session.currentSenderPeerId = senderId;
    const senderPeer = session.peers.get(senderId);
    if (senderPeer) {
      setPeerPage(senderPeer, PeerPage.SEND);
      session.peers.set(senderId, senderPeer);
      session.recentEnterSendPageAt = Date.now();
    }
    logger.info(`✅ Granted send lock to ${senderId} - no peers currently in send page`);

    // 🆕 NEW: Notify all peers that send button is now locked
    io.in(sessionId).emit('send-button-locked', {
      lockedBy: senderId,
      message: 'Send button is now locked. File transfer in progress.',
      timestamp: Date.now(),
    });

    return typeof ack === 'function' && ack({ ok: true });
  });

  socket.on('release-send-lock', ({ sessionId, senderId }) => {
    const session = store.sessions.get(sessionId);
    if (!session) return;
    if (!canActAs(socket, senderId)) return;
    if (session.currentSenderPeerId === senderId) {
      session.currentSenderPeerId = null;
      logger.info(`🔓 Send lock released by ${senderId} in session ${sessionId}`);

      // 🆕 NEW: Check if there are still senders in send page before unlocking
      const sendersInSendPage = peersOnPage(session, PeerPage.SEND);

      if (sendersInSendPage.length === 0) {
        logger.info(`🔓 No senders in send page, unlocking send button`);

        // Notify all peers that send button is now unlocked
        io.in(sessionId).emit('send-button-unlocked', {
          unlockedBy: senderId,
          message: 'Send button is now unlocked. You can start a new file transfer.',
          timestamp: Date.now(),
        });

        io.in(sessionId).emit('transfer-unlocked');
      } else {
        logger.info(
          `🔒 Send button remains locked - ${sendersInSendPage.length} sender(s) still in send page`,
        );
      }
    }
  });

  // Replace the request-to-send handler in server.js with this corrected version:

  socket.on('request-to-send', ({ sessionId, file, senderId }) => {
    // file.id becomes session.activeTransfer.fileId, which the transfer strategies
    // interpolate into on-disk paths (upload target, spool file) — it must be a safe id.
    if (
      !isSafeId(sessionId) ||
      !isSafeId(senderId) ||
      !file ||
      typeof file.id !== 'string' ||
      !isSafeId(file.id)
    ) {
      logger.warn(
        `🚫 Rejected request-to-send with invalid session/sender/file id from ${socket.id}`,
      );
      return socket.emit('send-rejected', { reason: 'Invalid session, sender, or file id' });
    }

    // A joined socket may not send on behalf of another peer
    if (!canActAs(socket, senderId)) {
      logger.warn(`🚫 Rejected request-to-send from socket claiming foreign id ${senderId}`);
      return socket.emit('send-rejected', {
        fileId: file.id,
        reason: 'Sender identity mismatch',
      });
    }

    logger.info(`Send request from ${senderId} for file ${file.id}`);

    const session = store.sessions.get(sessionId);
    if (!session) {
      logger.info(`❌ Session ${sessionId} not found for send request`);
      return socket.emit('send-rejected', { fileId: file.id, reason: 'Session not found' });
    }

    if (session.activeTransfer) {
      logger.info(`❌ Active transfer in progress, rejecting ${file.id}`);
      return socket.emit('send-rejected', {
        fileId: file.id,
        reason: 'Another transfer is in progress.',
      });
    }

    // FIXED: Find all peers except the sender as potential receivers
    const receivers = Array.from(session.peers.values()).filter(
      (p) => p.peerId !== senderId && !p.isDisconnected,
    );
    logger.info(
      `Available receivers:`,
      receivers.map((r) => `${r.peerId}(${r.role})`),
    );

    if (receivers.length === 0) {
      logger.info(`❌ No receivers available for ${file.id}`);
      return socket.emit('send-rejected', { fileId: file.id, reason: 'No receivers available.' });
    }

    session.activeTransfer = {
      senderPeerId: senderId,
      fileId: file.id,
      file: file, // Store the offered file metadata
      acceptedReceivers: new Set(),
      rejectedReceivers: new Set(),
      receiversSnapshot: receivers.map((r) => r.peerId),
      // offerTimer removed - using only responseTimer now
      responseTimer: null,
      responseDeadlineMs: null,
      totalResponses: 0,
    };
    logger.info(`✅ Send approved for ${file.id}, notifying ${receivers.length} receivers`);

    socket.emit('send-approved', { fileId: file.id });

    // Add cooldown to prevent abandoned sender check from running immediately
    session.recentSendRequestAt = Date.now();

    // Redirect all other peers (receivers) to receive page
    receivers.forEach((receiver) => {
      logger.info(`Redirecting ${receiver.peerId} to receive page`);
      // Update receiver's page state immediately
      setPeerPage(receiver, PeerPage.RECEIVE);
      session.peers.set(receiver.peerId, receiver);
      emitNavigate(io, receiver.socketId, {
        page: PeerPage.RECEIVE,
        sessionId,
        role: receiver.role,
        peerId: receiver.peerId,
        forced: true,
      });
    });
    scheduleAbandonedSenderCheck(sessionId, io);

    const sender = session.peers.get(senderId);
    if (sender) {
      setPeerPage(sender, PeerPage.SEND);
      session.peers.set(senderId, sender);
      logger.info(`📤 Updated sender ${senderId} page state to send`);
    }

    // Also immediately offer file metadata to receivers
    const senderName = sender ? sender.deviceName : 'Unknown Device';
    receivers.forEach((receiver) => {
      io.to(receiver.socketId).emit('file-offer', { file, senderId, senderName });
    });

    // Start 30-second timer to check if all receivers have responded
    try {
      if (session.activeTransfer.responseTimer) clearTimeout(session.activeTransfer.responseTimer);
    } catch (_) {}

    // Emit the timer start event to all clients, including those on the index page
    io.in(sessionId).emit('response-timer-started', {
      fileId: file.id,
      duration: 30,
      totalReceivers: receivers.length,
    });

    // Also emit to any sockets in the session that might be on the index page
    logger.info(`Emitting response timer to host on index page`);
    emitToHostSocket(io, session, 'response-timer-started', {
      fileId: file.id,
      duration: 30,
      totalReceivers: receivers.length,
    });

    // Track response deadline and timer
    session.activeTransfer.responseDeadlineMs = Date.now() + 30000;
    session.activeTransfer.responseTimer = setTimeout(() => {
      const current = store.sessions.get(sessionId);
      if (!current || !current.activeTransfer) return;
      if (current.activeTransfer.fileId !== file.id) return;

      logger.info(`Response timer expired for file ${file.id}`);

      const totalReceivers = current.activeTransfer.receiversSnapshot.length;
      const acceptedCount = current.activeTransfer.acceptedReceivers.size;
      const totalResponses = current.activeTransfer.totalResponses;

      logger.info(
        `Timer expired - Responses: ${totalResponses}/${totalReceivers}, Accepted: ${acceptedCount}`,
      );

      // Timer expired - make decision based on current state
      settleResponses(current, file.id, io, { rejectedEvent: 'offer-timeout' });
    }, 30000);

    // Note: We removed the 2-minute offer timer as it was redundant
    // The 30-second response timer handles all cases: all responses received OR timer expiry
  });

  // Also update the file-uploaded-offer-to-peers handler:
  socket.on('file-uploaded-offer-to-peers', ({ sessionId, file, senderId }) => {
    logger.info(`File uploaded, offering ${file.name} to peers`);

    const session = store.sessions.get(sessionId);
    if (!session) return;

    const history = store.transferHistory.get(sessionId) || [];
    history.unshift({
      id: file.id,
      fileName: file.name,
      fileSize: file.size,
      sender: senderId,
      status: 'pending',
      timestamp: new Date().toISOString(),
    });
    store.transferHistory.set(sessionId, history);
    io.in(sessionId).emit('history-updated', history);

    // FIXED: Offer to all peers except sender (regardless of role)
    const receivers = Array.from(session.peers.values()).filter(
      (p) => p.peerId !== senderId && !p.isDisconnected,
    );
    logger.info(
      `Offering file to:`,
      receivers.map((r) => `${r.peerId}(${r.role})`),
    );

    const sender = session.peers.get(senderId);
    const senderName = sender ? sender.deviceName : 'Unknown Device';
    receivers.forEach((receiver) => {
      io.to(receiver.socketId).emit('file-offer', { file, senderId, senderName });
    });
  });

  socket.on('accept-file', ({ sessionId, fileId, receiverPeerId }) => {
    logger.info(`File ${fileId} accepted by ${receiverPeerId}`);
    const session = store.sessions.get(sessionId);
    if (!session) return;
    if (!canActAs(socket, receiverPeerId)) return;
    if (!session.activeTransfer || session.activeTransfer.fileId !== fileId) return;
    session.activeTransfer.acceptedReceivers.add(receiverPeerId);
    session.activeTransfer.totalResponses++;

    const totalReceivers = session.activeTransfer.receiversSnapshot.length;
    const totalResponses = session.activeTransfer.totalResponses;
    const acceptedCount = session.activeTransfer.acceptedReceivers.size;

    logger.info(
      `Accept response: ${totalResponses}/${totalReceivers} responses, ${acceptedCount} accepted`,
    );

    // Update all clients with the response count
    io.in(sessionId).emit('response-count-updated', {
      fileId,
      totalResponses,
      totalReceivers,
    });

    // Also emit to the host if they're on the index page
    logger.info(`Emitting response count update to host on index page`);
    emitToHostSocket(io, session, 'response-count-updated', {
      fileId,
      totalResponses,
      totalReceivers,
    });

    // Check if all receivers have responded
    if (totalResponses >= totalReceivers) {
      logger.info(`All responses received for ${fileId}: ${totalResponses}/${totalReceivers}`);
      settleResponses(session, fileId, io);
    } else {
      logger.info(`Waiting for more responses: ${totalResponses}/${totalReceivers} received`);
    }
    // Note: We don't start upload on first accept anymore - wait for all responses or timer
  });

  socket.on('reject-file', ({ sessionId, fileId, receiverPeerId }) => {
    logger.info(`File ${fileId} rejected by ${receiverPeerId}`);
    const session = store.sessions.get(sessionId);
    if (!session || !session.activeTransfer) return;
    if (!canActAs(socket, receiverPeerId)) return;
    if (session.activeTransfer.fileId !== fileId) return;
    session.activeTransfer.rejectedReceivers.add(receiverPeerId);
    session.activeTransfer.totalResponses++;

    const totalReceivers = session.activeTransfer.receiversSnapshot.length;
    const totalResponses = session.activeTransfer.totalResponses;
    const acceptedCount = session.activeTransfer.acceptedReceivers.size;

    logger.info(
      `Reject response: ${totalResponses}/${totalReceivers} responses, ${acceptedCount} accepted`,
    );

    // Update all clients with the response count
    io.in(sessionId).emit('response-count-updated', {
      fileId,
      totalResponses,
      totalReceivers,
    });

    // Also emit to the host if they're on the index page
    logger.info(`Emitting response count update to host on index page`);
    emitToHostSocket(io, session, 'response-count-updated', {
      fileId,
      totalResponses,
      totalReceivers,
    });

    const senderPeerId = session.activeTransfer.senderPeerId;
    const sender = session.peers.get(senderPeerId);
    // Notify sender of a single rejection
    if (sender) io.to(sender.socketId).emit('receiver-rejected', { fileId, receiverPeerId });

    // Check if all receivers have responded
    if (totalResponses >= totalReceivers) {
      logger.info(`All responses received for ${fileId}: ${totalResponses}/${totalReceivers}`);
      settleResponses(session, fileId, io);
    } else {
      logger.info(`Waiting for more responses: ${totalResponses}/${totalReceivers} received`);
    }
  });

  socket.on('transfer-complete', ({ sessionId }) => {
    logger.info(`Transfer complete for session ${sessionId}`);
    const session = store.sessions.get(sessionId);
    if (session) {
      session.activeTransfer = null;
      session.currentSenderPeerId = null; // Release the send lock
      io.in(sessionId).emit('transfer-unlocked');
    }
  });

  // Sender notifies server when upload completed so we can deliver download URLs
  socket.on('upload-complete', ({ sessionId, file }) => {
    const session = store.sessions.get(sessionId);
    if (!session || !session.activeTransfer) {
      // If there's no active transfer but we got an upload-complete event,
      // check and release any stale locks
      checkAndReleaseStaleTransferLocks(sessionId, io);
      return;
    }
    // Only the sender of the active transfer may complete it
    if (socket.data?.peerId && socket.data.peerId !== session.activeTransfer.senderPeerId) {
      logger.warn(`🚫 Rejected upload-complete from non-sender ${socket.data.peerId}`);
      return;
    }
    if (!file || typeof file.id !== 'string' || !isSafeId(file.id)) {
      logger.warn(`🚫 Rejected upload-complete with invalid file id from ${socket.id}`);
      return;
    }
    const { acceptedReceivers } = session.activeTransfer;
    const baseDownloadUrl = `/download/${sessionId}/${file.id}`;
    // Initialize/refresh pending counter for this file so we only delete after all receivers finish
    try {
      const meta = session.activeFiles.get(file.id);
      if (meta) {
        meta.pending = acceptedReceivers ? acceptedReceivers.size : 1;
        session.activeFiles.set(file.id, meta);
        logger.info(`📊 Pending downloads for ${file.name}: ${meta.pending}`);
      }
    } catch (e) {
      logger.error('Failed to set pending counter for file:', e);
    }

    // Check each receiver's download queue before sending
    for (const receiverPeerId of acceptedReceivers || []) {
      const receiver = session.peers.get(receiverPeerId);
      if (receiver) {
        // Record per-receiver recent transfer with names
        try {
          const senderPeer = session.peers.get(session.activeTransfer.senderPeerId) || {};
          pushRecentTransfer({
            senderId: session.activeTransfer.senderPeerId,
            senderName: senderPeer.deviceName || '',
            receiverId: receiverPeerId,
            receiverName: receiver.deviceName || '',
            fileName: file.name,
            size: file.size,
            timestamp: Date.now(),
          });
        } catch (_) {}

        // Check download flag for this receiver
        // Determine current active count
        let activeCount = 0;
        if (store.receiverActiveDownloads.has(sessionId)) {
          activeCount = store.receiverActiveDownloads.get(sessionId).get(receiverPeerId) || 0;
        }

        if (activeCount < config.maxConcurrentDownloadsPerReceiver) {
          // Download flag is 0 (ready), send file immediately
          const downloadUrl = `${baseDownloadUrl}?receiver=${encodeURIComponent(receiverPeerId)}`;
          logger.info(
            `🚀 SENDING FILE: ${file.name} to ${receiverPeerId} (download flag = 0, browser should start download now)`,
          );
          io.to(receiver.socketId).emit('download-ready', { file, downloadUrl });

          // Increment active downloads
          if (!store.receiverActiveDownloads.has(sessionId))
            store.receiverActiveDownloads.set(sessionId, new Map());
          const m = store.receiverActiveDownloads.get(sessionId);
          m.set(receiverPeerId, (m.get(receiverPeerId) || 0) + 1);
          logger.info(`📥 Active downloads for ${receiverPeerId}: ${m.get(receiverPeerId)}`);

          // Queue progression will now be driven by actual download completion in /download route
        } else {
          // Download flag is 1 (downloading), add to queue
          logger.info(`File ${file.name} waiting for ${receiverPeerId} to finish current download`);

          // Add to queue for later processing
          if (!store.receiverDownloadQueues.has(sessionId)) {
            store.receiverDownloadQueues.set(sessionId, new Map());
          }
          if (!store.receiverDownloadQueues.get(sessionId).has(receiverPeerId)) {
            store.receiverDownloadQueues.get(sessionId).set(receiverPeerId, []);
          }
          const queuedUrl = `${baseDownloadUrl}?receiver=${encodeURIComponent(receiverPeerId)}`;
          store.receiverDownloadQueues
            .get(sessionId)
            .get(receiverPeerId)
            .push({ file, downloadUrl: queuedUrl });

          // Debug: Show current queue state
          const currentQueue = store.receiverDownloadQueues.get(sessionId).get(receiverPeerId);
          logger.info(`Queue state for ${receiverPeerId}: ${currentQueue.length} files waiting`);
          currentQueue.forEach((item, index) => {
            logger.info(`  [${index}] ${item.file.name}`);
          });
        }
      }
    }

    // Update history entry: mark as completed and add recipients list
    try {
      const acceptedList = acceptedReceivers ? Array.from(acceptedReceivers) : [];
      const history = store.transferHistory.get(sessionId) || [];
      const entry = history.find((h) => h.id === file.id);
      if (entry) {
        entry.status = 'completed';
        entry.recipients = acceptedList;
        store.transferHistory.set(sessionId, history);
        io.in(sessionId).emit('history-updated', history);
      }
    } catch (e) {
      logger.error('Failed to update transfer history after upload-complete:', e);
    }

    // Notify clients that recent history changed
    try {
      io.in(sessionId).emit('recent-updated');
    } catch (_) {}

    // Clear active transfer and release sender lock so new sends can start
    session.activeTransfer = null;
    session.currentSenderPeerId = null;
    session.lastTransferCompletedAt = Date.now(); // Track when transfer completed
    io.in(sessionId).emit('transfer-unlocked');
  });

  // Relay sender upload progress to receivers for UI updates
  socket.on('sender-progress', ({ sessionId, fileId, loaded, total, speedBps, etaSeconds }) => {
    const session = store.sessions.get(sessionId);
    if (!session || !session.activeTransfer || session.activeTransfer.fileId !== fileId) return;

    // Only send progress to receivers who accepted the file
    const { acceptedReceivers } = session.activeTransfer;
    for (const receiverPeerId of acceptedReceivers || []) {
      const receiver = session.peers.get(receiverPeerId);
      if (receiver) {
        io.to(receiver.socketId).emit('sender-progress', {
          fileId,
          loaded,
          total,
          speedBps,
          etaSeconds,
        });
      }
    }
  });

  // Allow sender to extend the response window by 30 seconds (adds to remaining)
  socket.on('extend-response-timer', ({ sessionId, fileId, senderId }) => {
    const session = store.sessions.get(sessionId);
    if (!session || !session.activeTransfer) return;
    if (session.activeTransfer.fileId !== fileId) return;
    if (session.activeTransfer.senderPeerId !== senderId) return;
    if (!canActAs(socket, senderId)) return;

    // Compute remaining; add 30s; reset timer to new deadline
    const now = Date.now();
    const remainingMs = Math.max(0, (session.activeTransfer.responseDeadlineMs || now) - now);
    const newRemainingMs = remainingMs + 30000;
    session.activeTransfer.responseDeadlineMs = now + newRemainingMs;

    try {
      if (session.activeTransfer.responseTimer) clearTimeout(session.activeTransfer.responseTimer);
    } catch (_) {}
    const totalReceivers = session.activeTransfer.receiversSnapshot.length;
    io.in(sessionId).emit('response-timer-started', {
      fileId,
      duration: Math.ceil(newRemainingMs / 1000),
      totalReceivers,
    });

    session.activeTransfer.responseTimer = setTimeout(() => {
      const current = store.sessions.get(sessionId);
      if (!current || !current.activeTransfer) return;
      if (current.activeTransfer.fileId !== fileId) return;

      const acceptedCount = current.activeTransfer.acceptedReceivers.size;
      const sender = current.peers.get(senderId);

      if (acceptedCount > 0) {
        if (sender) io.to(sender.socketId).emit('start-upload', { fileId });
        // Inform only accepted receivers that the sender has started preparing upload
        for (const receiverPeerId of current.activeTransfer.acceptedReceivers || []) {
          const receiver = current.peers.get(receiverPeerId);
          if (receiver) {
            io.to(receiver.socketId).emit('upload-started', { fileId });
          }
        }
      } else {
        if (sender) io.to(sender.socketId).emit('offer-timeout', { fileId });
        current.activeTransfer = null;
        current.currentSenderPeerId = null; // Release the send lock
        io.in(sessionId).emit('transfer-unlocked');
      }
    }, newRemainingMs);
  });

  // Manual proceed: start upload immediately if >=1 accept, else treat as all rejected
  socket.on('manual-proceed', ({ sessionId, fileId, senderId }) => {
    const session = store.sessions.get(sessionId);
    if (!session || !session.activeTransfer) return;
    if (session.activeTransfer.fileId !== fileId) return;
    if (session.activeTransfer.senderPeerId !== senderId) return;
    if (!canActAs(socket, senderId)) return;
    try {
      if (session.activeTransfer.responseTimer) clearTimeout(session.activeTransfer.responseTimer);
    } catch (_) {}
    const acceptedCount = session.activeTransfer.acceptedReceivers.size;
    const sender = session.peers.get(senderId);
    if (acceptedCount > 0) {
      if (sender) io.to(sender.socketId).emit('start-upload', { fileId });
      // Inform only accepted receivers that the sender has started preparing upload
      for (const receiverPeerId of session.activeTransfer.acceptedReceivers || []) {
        const receiver = session.peers.get(receiverPeerId);
        if (receiver) {
          io.to(receiver.socketId).emit('upload-started', { fileId });
        }
      }
    } else {
      if (sender) io.to(sender.socketId).emit('all-rejected', { fileId });
      session.activeTransfer = null;
      session.currentSenderPeerId = null; // Release the send lock
      io.in(sessionId).emit('transfer-unlocked');
    }
  });

  // Cancel a pending offer (pre-upload) without redirecting pages
  socket.on('cancel-pending-offer', ({ sessionId, fileId, senderId }) => {
    const session = store.sessions.get(sessionId);
    if (!session || !session.activeTransfer) return;
    if (session.activeTransfer.fileId !== fileId) return;
    if (session.activeTransfer.senderPeerId !== senderId) return;
    if (!canActAs(socket, senderId)) return;
    // Clear timers and active transfer, keep the sender lock so they can immediately send next
    try {
      if (session.activeTransfer.responseTimer) clearTimeout(session.activeTransfer.responseTimer);
    } catch (_) {}
    session.activeTransfer = null;
    session.currentSenderPeerId = null; // Release the send lock
    io.in(sessionId).emit('transfer-unlocked');
  });

  // Sender cancels or goes back: unlock and return everyone to main page
  socket.on('cancel-transfer', ({ sessionId }) => {
    const session = store.sessions.get(sessionId);
    if (!session) return;
    // Only the current sender or the host may cancel — any peer must not be
    // able to kill someone else's transfer or bounce the room to main.
    const claimant = socket.data?.peerId;
    if (claimant) {
      const peer = session.peers.get(claimant);
      const isHost = peer?.role === 'host';
      const isSender =
        session.currentSenderPeerId === claimant ||
        session.activeTransfer?.senderPeerId === claimant;
      if (!isHost && !isSender) {
        logger.info(`🚫 Ignored cancel-transfer from non-sender ${claimant}`);
        return;
      }
    }
    // Refresh guard: beforeunload fires cancel-transfer even when the sender
    // is merely reloading. Defer the room-wide reset briefly — the disruption
    // is cancelled if the sender re-enters the send page within the window.
    scheduleSenderDisruption(sessionId, io, () =>
      executeSenderDeparture(sessionId, socket.data?.peerId, io),
    );
  });
}
