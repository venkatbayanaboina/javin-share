import { logger } from '../logger.js';
import { store } from '../state/store.js';
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
import { clearGraceRedirect, extendGraceRedirect } from '../services/grace-redirect.service.js';
import { handleReceiverExit } from './transfer.helpers.js';
import { cancelSenderDisruption, scheduleSenderDisruption } from './sender-grace.js';
import { executeSenderDeparture } from './transfer.helpers.js';

/**
 * Page navigation events: peers moving between the index, send, receive, PIN
 * and main pages.
 */
export function registerPageHandlers(io, socket) {
  // New: allow host/client to prepare other peers by redirecting them to receive page
  socket.on('prepare-receivers', ({ sessionId, senderId }, ack) => {
    logger.info(`Prepare receivers requested by ${senderId} in ${sessionId}`);
    const session = store.sessions.get(sessionId);
    if (!session) {
      logger.info(`❌ Session ${sessionId} not found for prepare-receivers`);
      if (typeof ack === 'function') ack({ ok: false, reason: 'session_not_found' });
      return;
    }
    const sender = session.peers.get(senderId);
    if (sender) {
      setPeerPage(sender, PeerPage.SEND);
      session.peers.set(senderId, sender);
      session.recentEnterSendPageAt = Date.now();
      logger.info(`📤 Marked sender ${senderId} as on send page (prepare-receivers)`);
    }

    const receivers = Array.from(session.peers.values()).filter(
      (p) => p.peerId !== senderId && !p.isDisconnected,
    );
    receivers.forEach((receiver) => {
      logger.info(`Preparing receiver ${receiver.peerId} → redirect to receive`);
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
    if (typeof ack === 'function') ack({ ok: true, receivers: receivers.length });
  });

  // Host can choose to go to main immediately (only if at least one non-host is connected)
  socket.on('host-go-now', ({ sessionId }, ack) => {
    const session = store.sessions.get(sessionId);
    if (!session)
      return typeof ack === 'function' && ack({ ok: false, reason: 'session_not_found' });
    const clientsConnected = Array.from(session.peers.values()).some((p) => p.role !== 'host');
    if (!clientsConnected) {
      logger.info(`Host requested go-now but no clients connected in session ${sessionId}`);
      return (
        typeof ack === 'function' &&
        ack({ ok: false, reason: 'no_clients', message: 'No clients connected yet.' })
      );
    }
    clearGraceRedirect(session, io, { notifyHost: true });
    const hostPeer = Array.from(session.peers.values()).find((p) => p.role === 'host');
    if (hostPeer) {
      logger.info(
        `🚀 Host ${hostPeer.peerId} clicked "Go to Main Immediately" - redirecting to main.`,
      );
      setPeerPage(hostPeer, PeerPage.SESSION);
      session.peers.set(hostPeer.peerId, hostPeer);
      if (typeof ack === 'function') ack({ ok: true });
      emitNavigate(io, hostPeer.socketId, {
        page: PeerPage.SESSION,
        sessionId,
        role: 'host',
        peerId: hostPeer.peerId,
      });
    } else {
      if (typeof ack === 'function') ack({ ok: false, reason: 'no_host' });
    }
  });

  socket.on('host-extend-redirect', ({ sessionId }, ack) => {
    const session = store.sessions.get(sessionId);
    if (!session) {
      if (typeof ack === 'function') ack({ ok: false, reason: 'session_not_found' });
      return;
    }
    const result = extendGraceRedirect(session, io);
    if (typeof ack === 'function') ack(result);
  });

  // Mark the host as being on the main page as soon as they intend to navigate there
  socket.on('host-going-to-main', ({ sessionId }) => {
    const session = store.sessions.get(sessionId);
    if (!session) return;
    const hostPeer = Array.from(session.peers.values()).find(
      (p) => p.role === 'host' && p.socketId === socket.id,
    );
    if (hostPeer) {
      setPeerPage(hostPeer, PeerPage.SESSION);
      session.peers.set(hostPeer.peerId, hostPeer);
      logger.info(`🌟 Host ${hostPeer.peerId} marked as on main page (pre-navigation)`);
      const connectedPeers = Array.from(session.peers.values()).filter((p) => !p.isDisconnected);
      io.in(sessionId).emit('peers-updated', connectedPeers);

      clearGraceRedirect(session, io, { notifyHost: true });
      logger.info(`🧹 Grace timer cleared for host going to main page`);

      // Also release any stale locks now that host is ready
      try {
        checkAndReleaseStaleTransferLocks(sessionId, io);
      } catch (_) {}
    }
  });

  // 📍 NEW: Track when users enter receive page
  socket.on('enter-receive-page', ({ sessionId, peerId }) => {
    const session = store.sessions.get(sessionId);
    if (!session) return;

    const peer = session.peers.get(peerId);
    if (peer) {
      // Check if peer was already in receive page (page refresh scenario)
      const wasAlreadyInReceivePage = getPeerPage(peer) === PeerPage.RECEIVE;

      setPeerPage(peer, PeerPage.RECEIVE);
      session.peers.set(peerId, peer);
      logger.info(
        `📥 Peer ${peerId} entered receive page in session ${sessionId} (was already in receive: ${wasAlreadyInReceivePage})`,
      );

      session.recentEnterReceivePageAt = Date.now();
      scheduleAbandonedSenderCheck(sessionId, io);
    }
  });

  // 📍 NEW: Track when users navigate to PIN page (browser back scenario)
  socket.on('enter-pin-page', ({ sessionId, peerId }) => {
    const session = store.sessions.get(sessionId);
    if (!session) return;

    const peer = session.peers.get(peerId);
    if (peer) {
      logger.info(`📱 Peer ${peerId} navigated to PIN page in session ${sessionId}`);

      // Update peer's page state to indicate they're on PIN page
      setPeerPage(peer, PeerPage.PIN);
      session.peers.set(peerId, peer);

      const connectedOnMain = peersOnPage(session, PeerPage.SESSION);
      io.in(sessionId).emit('peer-count-updated', { count: connectedOnMain.length });

      // 🆕 NEW: Emit peers-updated event to update peer count display
      const connectedPeers = Array.from(session.peers.values()).filter((p) => !p.isDisconnected);
      io.in(sessionId).emit('peers-updated', connectedPeers);
    }
  });

  // 📍 NEW: Track when users leave receive page
  socket.on('leave-receive-page', ({ sessionId, peerId }) => {
    logger.info(`📥 leave-receive-page event received from ${peerId} in session ${sessionId}`);
    const session = store.sessions.get(sessionId);
    if (!session) {
      logger.info(`❌ Session ${sessionId} not found for leave-receive-page`);
      return;
    }

    const peer = session.peers.get(peerId);
    if (peer) {
      setPeerPage(peer, PeerPage.SESSION);
      session.peers.set(peerId, peer);
      logger.info(`📥 Peer ${peerId} left receive page in session ${sessionId}`);
      handleReceiverExit(session, peerId, io);
    } else {
      logger.info(
        `⚠️ Peer ${peerId} not found in session ${sessionId} when trying to leave receive page`,
      );
    }
    scheduleAbandonedSenderCheck(sessionId, io);
  });

  // 📍 NEW: Track when users enter send page
  socket.on('enter-send-page', ({ sessionId, peerId }) => {
    const session = store.sessions.get(sessionId);
    if (!session) return;

    // The sender is on the send page again — any pending "sender left"
    // disruption (e.g. fired by a page refresh) must not touch receivers.
    cancelSenderDisruption(sessionId, 'sender entered send page');

    const peer = session.peers.get(peerId);
    if (peer) {
      // Check if peer was already in send page (page refresh scenario)
      const wasAlreadyInSendPage = getPeerPage(peer) === PeerPage.SEND;

      setPeerPage(peer, PeerPage.SEND);
      session.peers.set(peerId, peer);
      logger.info(
        `📤 Peer ${peerId} entered send page in session ${sessionId} (was already in send: ${wasAlreadyInSendPage})`,
      );

      session.recentEnterSendPageAt = Date.now();

      if (!wasAlreadyInSendPage) {
        const otherPeers = Array.from(session.peers.values()).filter(
          (p) => p.peerId !== peerId && getPeerPage(p) !== PeerPage.SEND && !p.isDisconnected,
        );

        otherPeers.forEach((otherPeer) => {
          logger.info(`🔄 Redirecting ${otherPeer.peerId} to receive (sender ${peerId} active)`);

          setPeerPage(otherPeer, PeerPage.RECEIVE);
          session.peers.set(otherPeer.peerId, otherPeer);

          emitNavigate(io, otherPeer.socketId, {
            page: PeerPage.RECEIVE,
            reason: 'sender_in_send_page',
            message: 'A sender is active. You have been redirected to the receive page.',
            sessionId,
            role: otherPeer.role,
            peerId: otherPeer.peerId,
            forced: true,
          });
        });
      } else {
        logger.info(`🔄 Send page refresh detected for ${peerId} - not redirecting other peers`);
      }
      scheduleAbandonedSenderCheck(sessionId, io);
    }
  });

  // 📍 NEW: Track when users leave send page
  socket.on('leave-send-page', ({ sessionId, peerId }) => {
    const session = store.sessions.get(sessionId);
    if (!session) return;

    const peer = session.peers.get(peerId);
    if (peer) {
      const wasActiveSender = session.currentSenderPeerId === peerId;
      setPeerPage(peer, PeerPage.SESSION);
      session.peers.set(peerId, peer);
      logger.info(`📤 Peer ${peerId} left send page in session ${sessionId}`);

      // Only the active sender's departure disrupts receivers — not when another
      // peer is redirected to receive (their navigate handler emits leave-send-page).
      if (wasActiveSender) {
        // Refresh guard: the browser fires beforeunload → leave-send-page even
        // when the sender is merely reloading. Defer the disruption briefly —
        // it is cancelled when the sender re-enters the send page.
        scheduleSenderDisruption(sessionId, io, () =>
          executeSenderDeparture(sessionId, peerId, io),
        );
      } else {
        scheduleAbandonedSenderCheck(sessionId, io);
      }
    }
  });

  // 🆕 NEW: Track when users enter main page
  socket.on('enter-main-page', ({ sessionId, peerId, role }) => {
    logger.info(`🔍 enter-main-page event received:`, { sessionId, peerId, role });

    const session = store.sessions.get(sessionId);
    if (!session) {
      logger.info(`❌ Session ${sessionId} not found for enter-main-page`);
      return;
    }

    const peer = session.peers.get(peerId);
    if (peer) {
      logger.info(`🔍 Peer before update:`, {
        peerId: peer.peerId,
        role: peer.role,
        page: getPeerPage(peer),
      });

      setPeerPage(peer, PeerPage.SESSION);
      session.peers.set(peerId, peer);

      logger.info(`✅ Updated peer ${peerId} to page=session`);
      logger.info(`🔍 Peer after update:`, {
        peerId: peer.peerId,
        role: peer.role,
        page: getPeerPage(peer),
      });
    } else {
      logger.info(`❌ Peer ${peerId} not found in session ${sessionId}`);
    }

    // 🆕 NEW: Check if this peer was previously in receive page and if sender is still in send page
    const senderInSendPage = peersOnPage(session, PeerPage.SEND)[0];

    if (senderInSendPage && peer && peer.role !== 'host') {
      logger.info(
        `🔄 Peer ${peerId} entered main page, but sender ${senderInSendPage.peerId} is still in send page - redirecting all non-senders to receive`,
      );

      // Redirect ALL non-sender peers to receive to keep session aligned with active sender
      const peersToRedirect = Array.from(session.peers.values()).filter(
        (p) => p.peerId !== senderInSendPage.peerId && !p.isDisconnected,
      );

      peersToRedirect.forEach((target) => {
        try {
          emitNavigate(io, target.socketId, {
            page: PeerPage.RECEIVE,
            reason: 'sender_in_send_page',
            message: 'A sender is active. You have been redirected to the receive page.',
            sessionId,
            role: target.role,
            peerId: target.peerId,
            forced: true,
          });
          setPeerPage(target, PeerPage.RECEIVE);
          session.peers.set(target.peerId, target);
        } catch (e) {
          logger.error('Failed to redirect peer to receive:', target.peerId, e);
        }
      });
    }

    // 🆕 NEW: Special handling for host entering main page - prepare navigation blocking
    if (peer.role === 'host') {
      logger.info(`🚫 Host ${peerId} entered main page - preparing navigation blocking`);

      // Mark host as on main page (but not permanently locked)
      setPeerPage(peer, PeerPage.SESSION);
      session.peers.set(peerId, peer);

      const otherConnectedPeers = Array.from(session.peers.values()).filter(
        (p) => p.peerId !== peerId && !p.isDisconnected,
      );

      if (otherConnectedPeers.length > 0) {
        logger.info(
          `🚫 Host ${peerId} has ${otherConnectedPeers.length} connected peers - navigation will be blocked if they try to leave`,
        );

        // Don't emit navigation blocked yet - only when they actually try to leave
        // The blocking will happen in the leave-main-page event handler
      } else {
        logger.info(`✅ Host ${peerId} entered main page with no other peers - navigation allowed`);
      }
    }

    // Count only verified clients in main
    const clientCount = peersOnPage(session, PeerPage.SESSION).filter(
      (p) => p.role === 'client',
    ).length;

    logger.info(`🔍 Enter main page - Client count in main: ${clientCount}`);
    logger.info(
      `🔍 All peers after enter:`,
      Array.from(session.peers.values()).map(
        (p) => `${p.peerId}(${p.role}, page:${getPeerPage(p)}, disconnected:${p.isDisconnected})`,
      ),
    );

    io.in(sessionId).emit('peer-count-updated', { count: clientCount });
  });

  // 🚫 NEW: Track when host leaves main page (navigation blocking)
  socket.on('leave-main-page', ({ sessionId, peerId, reason }) => {
    logger.info(`🔍 leave-main-page event received:`, { sessionId, peerId, reason });

    const session = store.sessions.get(sessionId);
    if (!session) {
      logger.info(`❌ Session ${sessionId} not found for leave-main-page`);
      return;
    }

    const peer = session.peers.get(peerId);
    if (!peer) {
      logger.info(`❌ Peer ${peerId} not found in session ${sessionId}`);
      return;
    }

    logger.info(`🔍 Peer details:`, {
      peerId: peer.peerId,
      role: peer.role,
      page: getPeerPage(peer),
      isDisconnected: peer.isDisconnected,
      socketId: peer.socketId,
    });

    if (peer.role === 'host') {
      logger.info(`🚫 Host ${peerId} attempting to leave main page`);

      // 🆕 NEW: Allow auto-redirects and exits (don't block when reason is provided)
      if (
        reason &&
        (reason === 'auto_redirect_to_send' ||
          reason === 'auto_redirect_to_receive' ||
          reason === 'host_exit_session')
      ) {
        logger.info(`✅ Host ${peerId} ${reason} - allowing navigation`);

        // Update host's page state based on redirect reason
        if (reason === 'auto_redirect_to_send') {
          setPeerPage(peer, PeerPage.SEND);
        } else if (reason === 'auto_redirect_to_receive') {
          setPeerPage(peer, PeerPage.RECEIVE);
        } else if (reason === 'host_exit_session') {
          setPeerPage(peer, PeerPage.HOST);
        }

        // Update peer state and return
        session.peers.set(peerId, peer);
        logger.info(`✅ Host ${peerId} page state updated to: ${getPeerPage(peer)}`);
        return;
      }

      // 🆕 NEW: Block host navigation from main page if they are currently on main page
      if (isPeerOnSession(peer)) {
        logger.info(
          `🚫 Host ${peerId} attempted to leave main page - checking if navigation should be blocked`,
        );

        // Check current connected peers count
        const otherConnectedPeers = Array.from(session.peers.values()).filter(
          (p) => p.peerId !== peerId && !p.isDisconnected,
        );

        logger.info(
          `🔍 Other connected peers:`,
          otherConnectedPeers.map((p) => ({
            peerId: p.peerId,
            role: p.role,
            page: getPeerPage(p),
          })),
        );

        if (otherConnectedPeers.length > 0) {
          logger.info(
            `🚫 Host ${peerId} attempted to leave main page while ${otherConnectedPeers.length} peers are connected - blocking navigation`,
          );

          // Block the navigation by keeping host on main page
          setPeerPage(peer, PeerPage.SESSION);
          session.peers.set(peerId, peer);

          // Emit warning to host with current peer count
          io.to(peer.socketId).emit('host-navigation-blocked', {
            reason: 'others_connected',
            message: `You cannot leave the main page while ${otherConnectedPeers.length} other user(s) are connected. Please use the Exit button to leave the session.`,
            connectedPeers: otherConnectedPeers.length,
          });

          logger.info(
            `🚫 Navigation blocked for host ${peerId} - kept on main page (${otherConnectedPeers.length} peers connected)`,
          );
          return;
        } else {
          // No other peers connected, allow host to leave
          logger.info(`✅ Host ${peerId} allowed to leave main page - no other peers connected`);

          // Update host's page state
          setPeerPage(peer, PeerPage.HOST);
          session.peers.set(peerId, peer);

          // Notify host that navigation is allowed
          io.to(peer.socketId).emit('host-navigation-allowed', {
            reason: 'no_peers_connected',
            message: 'No other users are connected. You can now leave the main page.',
            connectedPeers: 0,
          });
          return;
        }
      } else {
        logger.info(
          `⚠️ Host ${peerId} not on main page (page: ${getPeerPage(peer)}) - navigation blocking not applicable`,
        );
      }

      // The navigation blocking logic is now handled above in the isPeerOnSession check
    } else {
      logger.info(`ℹ️ Non-host peer ${peerId} leaving main page - no navigation blocking`);
    }
  });
}
