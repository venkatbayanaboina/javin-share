import { logger } from '../logger.js';
import { store } from '../state/store.js';
import { getDeviceName, setDeviceName } from '../services/device-names.service.js';
import { checkAndReleaseStaleTransferLocks } from '../services/transfer-lock.service.js';
import {
  getPeerPage,
  isPeerOnSession,
  PeerPage,
  setPeerPage,
} from '../services/peer-page.service.js';
import {
  clearGraceRedirect,
  startGraceRedirect,
  syncGraceToHost,
} from '../services/grace-redirect.service.js';
import { assertHostPeer } from '../services/peer-auth.service.js';
import { cancelSenderDisruption } from './sender-grace.js';
import { isSafeId } from '../utils/ids.js';
import { isLocalSocket } from '../utils/request.js';
import { canActAs, handleReceiverExit } from './transfer.helpers.js';

/**
 * Session lifecycle events: joining, verification, device naming, leaving and
 * disconnect handling.
 */
export function registerSessionLifecycle(io, socket) {
  socket.on('join-session', ({ sessionId, role, peerId, deviceName }) => {
    logger.info(`Join session request: ${peerId} as ${role} in ${sessionId}`);

    const session = store.sessions.get(sessionId);
    if (!session) {
      logger.info(`❌ Session ${sessionId} not found`);
      return socket.emit('error', { message: 'Session not found' });
    }

    // Check if peer already exists with different socket
    const existing = session.peers.get(peerId);

    // Host identity is bound server-side: only the machine running the
    // server may join as host (or claim an existing host's peer id). This
    // keeps /api/shutdown and other host-only controls out of reach for
    // other LAN clients, even if they learn a session id.
    if ((role === 'host' || existing?.role === 'host') && !isLocalSocket(socket)) {
      logger.warn(`🚫 Rejected host-role join for ${peerId} from non-local socket ${socket.id}`);
      return socket.emit('error', { message: 'Only the host machine may act as host' });
    }

    // Allow peers to rejoin sessions they previously exited
    // Clear the exited status when they rejoin
    if (session.exitedPeers && session.exitedPeers.has(peerId)) {
      logger.info(`✅ Peer ${peerId} rejoining after exit. Allowing reconnection.`);
      session.exitedPeers.delete(peerId);
    }

    if (existing && existing.socketId !== socket.id) {
      // Identity-takeover guard: a different remote address may not take
      // over a peer id that is still bound elsewhere. Both addresses are
      // known for real sockets; test mocks (no handshake) skip this.
      const newAddr = socket.handshake?.address || null;
      const oldAddr = existing.handshakeAddress || null;
      if (newAddr && oldAddr && newAddr !== oldAddr) {
        logger.warn(`🚫 Rejected identity takeover of ${peerId} from socket ${socket.id}`);
        return socket.emit('error', { message: 'Peer identity is already in use' });
      }

      logger.info(`🔄 Updating socket for existing peer ${peerId}`);
      // Leave old socket from session if it exists
      const oldSocket = io.sockets.sockets.get(existing.socketId);
      if (oldSocket) {
        oldSocket.leave(sessionId);
      }

      // If peer was marked as disconnected, clear the disconnect timeout
      if (existing.disconnectTimeout) {
        clearTimeout(existing.disconnectTimeout);
        logger.info(`Cleared disconnect timeout for reconnecting peer ${peerId}`);
      }
    }

    const queryPage = socket.handshake?.query?.page;
    const joiningSessionPage = queryPage === 'main' || queryPage === 'session';
    const joiningSendPage = queryPage === 'send';
    const joiningReceivePage = queryPage === 'receive';

    let finalDeviceName = deviceName || '';
    if (!finalDeviceName && existing?.deviceName) {
      finalDeviceName = existing.deviceName;
    }
    if (!finalDeviceName) {
      finalDeviceName = getDeviceName(peerId);
    }

    const peerData = {
      role,
      socketId: socket.id,
      peerId,
      deviceName: finalDeviceName,
      handshakeAddress: socket.handshake?.address || null,
      isDisconnected: false,
      disconnectedAt: null,
    };

    if (joiningSendPage) {
      // A send-page join right after a leave-send-page means the sender was
      // refreshing, not leaving — cancel any pending receiver disruption.
      cancelSenderDisruption(sessionId, 'sender rejoined on send page');
      setPeerPage(peerData, PeerPage.SEND);
    } else if (joiningReceivePage) {
      setPeerPage(peerData, PeerPage.RECEIVE);
    } else if (existing) {
      setPeerPage(peerData, getPeerPage(existing));
    } else if (joiningSessionPage) {
      setPeerPage(peerData, PeerPage.SESSION);
    }

    session.peers.set(peerId, peerData);
    socket.join(sessionId);
    socket.data = { peerId, sessionId, role, page: getPeerPage(peerData) };

    if (role === 'host' && isPeerOnSession(peerData)) {
      logger.info(`🌟 Host ${peerId} is now on the main page`);
      // Check and release any stale locks when host joins main page
      checkAndReleaseStaleTransferLocks(sessionId, io);
    }

    logger.info(`✅ Peer ${peerId} joined session ${sessionId} as ${role}`);
    if (role === 'client') {
      logger.info(
        `📱 Client ${peerId} scanned QR code - waiting for PIN verification before redirecting host`,
      );
    }
    logger.info(
      `Current peers in ${sessionId}:`,
      Array.from(session.peers.values()).map((p) => `${p.peerId}(${p.role})`),
    );

    // Emit updates (only include connected peers)
    const connectedPeers = Array.from(session.peers.values()).filter((p) => !p.isDisconnected);
    io.in(sessionId).emit('peers-updated', connectedPeers);
    socket.emit('session-joined', { sessionId, role });
    socket.emit('history-updated', store.transferHistory.get(sessionId) || []);

    if (role === 'host') {
      syncGraceToHost(io, session, socket.id);
    }

    // Note: Automatic host redirect moved to client-has-verified event to wait for PIN verification
  });

  socket.on('client-has-verified', ({ sessionId }) => {
    logger.info(`Client verified for session ${sessionId}`);
    const session = store.sessions.get(sessionId);
    if (!session) return;

    // Check if host is connected
    const hostPeer = Array.from(session.peers.values()).find((p) => p.role === 'host');
    logger.info(`Host peer found:`, hostPeer ? `Yes (${hostPeer.peerId})` : 'No');

    // Emit session-joined event to the client immediately
    socket.emit('session-joined', { sessionId: sessionId, role: 'client' });
    logger.info(`✅ Emitted session-joined event to client for session ${sessionId}`);

    // 🎯 HOST REDIRECT BEHAVIOR:
    // - NO automatic redirect when PIN auto-verifies
    // - Host redirects ONLY when:
    //   1. User clicks "Go to Main Immediately" button, OR
    //   2. Grace timer expires (30 seconds)
    // This respects user choice and maintains the grace period system
    logger.info(
      `📱 Client ${socket.id} verified PIN - host stays on index page until user choice or grace timer expires`,
    );

    startGraceRedirect(session, io);
  });

  // When a client scans QR and verifies PIN, they can request to clear exit status
  socket.on('client-reset-exit', ({ sessionId, peerId }) => {
    const session = store.sessions.get(sessionId);
    if (!session) return;
    try {
      if (session.exitedPeers) session.exitedPeers.delete(peerId);
    } catch (_) {}
  });

  // Handle device name updates
  socket.on('update-device-name', ({ sessionId, deviceName }) => {
    const session = store.sessions.get(sessionId);
    if (!session) return;

    const peer = Array.from(session.peers.values()).find((p) => p.socketId === socket.id);
    if (peer) {
      // Clamp length: this value is persisted to device_names.json
      const clampedName = typeof deviceName === 'string' ? deviceName.slice(0, 64) : '';
      // 🆕 NEW: Update both session and persistent storage
      peer.deviceName = clampedName;
      setDeviceName(peer.peerId, clampedName); // Save to persistent storage

      logger.info(`📱 Device name updated for ${peer.peerId}: ${deviceName}`);
      logger.info(`💾 Device name saved to persistent storage for ${peer.peerId}`);

      // Notify other peers about the name update
      io.in(sessionId).emit('peer-name-updated', {
        peerId: peer.peerId,
        deviceName: clampedName,
      });
    }
  });

  // Explicitly allow a peer to leave the session (used by receivers on Exit)
  socket.on('leave-session', ({ sessionId, peerId }, ack) => {
    const session = store.sessions.get(sessionId);
    if (!session)
      return typeof ack === 'function' && ack({ ok: false, reason: 'session_not_found' });
    if (!canActAs(socket, peerId)) {
      return typeof ack === 'function' && ack({ ok: false, reason: 'forbidden' });
    }

    handleReceiverExit(session, peerId, io);
    const peer = session.peers.get(peerId);
    if (!peer) {
      try {
        session.exitedPeers && session.exitedPeers.add(peerId);
      } catch (_) {}
      return typeof ack === 'function' && ack({ ok: true });
    }

    // Remove peer and update others
    try {
      session.peers.delete(peerId);
      const connectedPeers = Array.from(session.peers.values()).filter((p) => !p.isDisconnected);
      io.in(sessionId).emit('peers-updated', connectedPeers);

      // If no clients are left, clear the grace timer
      const remainingClients = connectedPeers.filter((p) => p.role !== 'host').length;
      if (remainingClients === 0 && session.graceRedirectEndMs) {
        logger.info(`🧹 Clearing grace timer - last client left session ${sessionId}`);
        clearGraceRedirect(session, io, { notifyHost: true });
      }
    } catch (_) {}

    // Allow peers to rejoin the same session
    // Don't mark as exited - they can reconnect freely

    // Release locks if this peer held any
    try {
      if (session.currentSenderPeerId === peerId) {
        session.currentSenderPeerId = null;
        session.activeTransfer = null;
        io.in(sessionId).emit('transfer-unlocked');
      }
    } catch (_) {}

    // Clear download queue and flags for this peer
    try {
      const sessionDownloadQueue = store.receiverDownloadQueues.get(sessionId);
      if (sessionDownloadQueue) {
        sessionDownloadQueue.delete(peerId);
        if (sessionDownloadQueue.size === 0) store.receiverDownloadQueues.delete(sessionId);
      }
      const sessionActive = store.receiverActiveDownloads.get(sessionId);
      if (sessionActive) {
        sessionActive.delete(peerId);
        if (sessionActive.size === 0) store.receiverActiveDownloads.delete(sessionId);
      }
    } catch (_) {}

    // Remove from room
    try {
      socket.leave(sessionId);
    } catch (_) {}

    if (typeof ack === 'function') ack({ ok: true });
  });

  socket.on('announce-shutdown', ({ sessionId, peerId } = {}) => {
    if (!isSafeId(sessionId) || !isSafeId(peerId)) {
      return socket.emit('error', { message: 'sessionId and peerId required' });
    }
    if (!assertHostPeer(sessionId, peerId)) {
      return socket.emit('error', { message: 'Only the host may announce shutdown' });
    }
    logger.info(`Host ${peerId} announcing server shutdown for session ${sessionId}`);
    io.emit('server-shutdown');
  });

  socket.on('disconnect', () => {
    const { peerId, sessionId } = socket.data || {};
    logger.info(`Socket ${socket.id} disconnected (peer: ${peerId}, session: ${sessionId})`);

    if (sessionId && peerId) {
      const session = store.sessions.get(sessionId);
      if (session) {
        const peer = session.peers.get(peerId);
        // Only remove if this socket was the active one for this peer
        if (peer && peer.socketId === socket.id) {
          // Mark peer as disconnected but don't remove immediately
          peer.disconnectedAt = Date.now();
          peer.isDisconnected = true;
          logger.info(`Peer ${peerId} marked as disconnected, waiting for reconnection...`);
          handleReceiverExit(session, peerId, io);

          // Set a timeout to remove the peer if they don't reconnect
          const disconnectTimeout = setTimeout(() => {
            const currentPeer = session.peers.get(peerId);
            if (
              currentPeer &&
              currentPeer.isDisconnected &&
              currentPeer.disconnectedAt === peer.disconnectedAt
            ) {
              // Peer still disconnected after timeout, remove them
              session.peers.delete(peerId);
              logger.info(`🗑️ Removed peer ${peerId} from session ${sessionId} after timeout`);
              const connectedPeers = Array.from(session.peers.values()).filter(
                (p) => !p.isDisconnected,
              );
              io.in(sessionId).emit('peers-updated', connectedPeers);

              // If this peer held the send lock or active transfer, release and unlock
              if (session.currentSenderPeerId === peerId) {
                session.currentSenderPeerId = null;
                session.activeTransfer = null;
                io.in(sessionId).emit('transfer-unlocked');
              }
              // Check for stale locks after a peer disconnects
              checkAndReleaseStaleTransferLocks(sessionId, io);

              // Clear download queue and flags for this peer when they disconnect
              const sessionDownloadQueue = store.receiverDownloadQueues.get(sessionId);
              if (sessionDownloadQueue) {
                sessionDownloadQueue.delete(peerId);
                if (sessionDownloadQueue.size === 0) {
                  store.receiverDownloadQueues.delete(sessionId);
                }
                logger.info(`Cleared download queue for disconnected peer ${peerId}`);
              }
            }
          }, 10000); // 10 second timeout

          // Store the timeout reference so we can clear it if peer reconnects
          peer.disconnectTimeout = disconnectTimeout;
        }
      }
    }
  });
}
