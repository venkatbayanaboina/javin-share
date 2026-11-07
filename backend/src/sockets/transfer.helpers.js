import { config } from '../config.js';
import { logger } from '../logger.js';
import { pushRecentTransfer } from '../state/store.js';
import { getTransferCoordinator } from '../services/transfer/coordinator.service.js';

export function canActAs(socket, claimedId) {
  if (!socket?.data?.peerId) return true;
  return socket.data.peerId === claimedId;
}

/**
 * Emit an event to the session host's socket (covers the host sitting on the
 * index page, outside the session room).
 */
export function emitToHostSocket(io, session, event, payload) {
  const hostPeer = Array.from(session.peers.values()).find((p) => p.role === 'host');
  const hostSocket = hostPeer ? io.sockets.sockets.get(hostPeer.socketId) : null;
  if (hostSocket) {
    hostSocket.emit(event, payload);
  }
}

/**
 * Shared end-of-offer logic: once every receiver has responded, either start
 * the transfer (at least one accept) or notify the sender and release the lock.
 */
export function settleResponses(session, fileId, io, { rejectedEvent = 'all-rejected' } = {}) {
  const activeTransfer = session.activeTransfer;
  if (!activeTransfer || activeTransfer.fileId !== fileId) return;

  try {
    if (activeTransfer.responseTimer) {
      clearTimeout(activeTransfer.responseTimer);
    }
  } catch (_) {}

  if (activeTransfer.acceptedReceivers.size > 0) {
    startTransfer(session, fileId, io);
  } else {
    const sender = session.peers.get(activeTransfer.senderPeerId);
    if (sender && rejectedEvent) {
      io.to(sender.socketId).emit(rejectedEvent, { fileId });
    }
    session.activeTransfer = null;
    session.currentSenderPeerId = null;
    io.in(session.id).emit('transfer-unlocked');
  }
}

export function startTransfer(session, fileId, io) {
  const activeTransfer = session.activeTransfer;
  if (!activeTransfer || activeTransfer.fileId !== fileId) return;

  const senderPeerId = activeTransfer.senderPeerId;
  const sender = session.peers.get(senderPeerId);
  if (!sender) return;

  const acceptedCount = activeTransfer.acceptedReceivers.size;
  if (acceptedCount === 0) return;

  const fileMetadata = activeTransfer.file;
  if (!fileMetadata) return;

  logger.info(
    `🔄 Initiating startTransfer helper for fileId: ${fileId}. Accepted count: ${acceptedCount}`,
  );

  // Track pending downloads
  try {
    const meta = {
      id: fileId,
      name: fileMetadata.name,
      size: fileMetadata.size,
      type: fileMetadata.type,
      path: 'relay',
      pending: acceptedCount,
    };
    session.activeFiles.set(fileId, meta);
  } catch (e) {
    logger.error('Failed to pre-register pending downloads in session:', e);
  }

  // Record recent transfers
  for (const receiverPeerId of activeTransfer.acceptedReceivers) {
    const receiver = session.peers.get(receiverPeerId);
    if (receiver) {
      try {
        pushRecentTransfer({
          senderId: senderPeerId,
          senderName: sender.deviceName || '',
          receiverId: receiverPeerId,
          receiverName: receiver.deviceName || '',
          fileName: fileMetadata.name,
          size: fileMetadata.size,
          timestamp: Date.now(),
        });
      } catch (_) {}
    }
  }

  const expectedCount = activeTransfer.acceptedReceivers
    ? activeTransfer.acceptedReceivers.size
    : 0;
  const useStreamRelay = config.transfer.enableStreamRelay && expectedCount === 1;

  if (useStreamRelay) {
    logger.info(
      `🌊 Single receiver (${expectedCount}) -> Dynamic stream relay initialized for file ${fileId}`,
    );
    const coordinator = getTransferCoordinator();

    // 1. Initialize stream session in coordinator
    coordinator.initializeStreamSession(
      fileId,
      fileMetadata,
      activeTransfer.acceptedReceivers,
      sender.socketId,
      session,
    );

    // 2. Instruct accepted receivers to connect download stream immediately
    const baseDownloadUrl = `/download/${session.id}/${fileId}`;
    for (const receiverPeerId of activeTransfer.acceptedReceivers) {
      const receiver = session.peers.get(receiverPeerId);
      if (receiver) {
        const downloadUrl = `${baseDownloadUrl}?receiver=${encodeURIComponent(receiverPeerId)}`;
        io.to(receiver.socketId).emit('download-ready', {
          file: fileMetadata,
          downloadUrl,
          stream: true,
        });
      }
    }
  } else {
    // Traditional Disk-based relay
    logger.info(`💾 Initializing traditional disk-based transfer for file ${fileId}`);

    // Send start-upload to sender
    io.to(sender.socketId).emit('start-upload', { fileId });

    // Inform accepted receivers that upload started
    for (const receiverPeerId of activeTransfer.acceptedReceivers) {
      const receiver = session.peers.get(receiverPeerId);
      if (receiver) {
        io.to(receiver.socketId).emit('upload-started', { fileId });
      }
    }
  }
}

export function handleReceiverExit(session, peerId, io) {
  const activeTransfer = session.activeTransfer;
  if (!activeTransfer) return;

  const isExpected = activeTransfer.receiversSnapshot.includes(peerId);
  const hasResponded =
    activeTransfer.acceptedReceivers.has(peerId) || activeTransfer.rejectedReceivers.has(peerId);

  if (isExpected && !hasResponded) {
    logger.info(
      `🔌 Receiver ${peerId} exited session/page during pending transfer for ${activeTransfer.fileId}. Registering auto-rejection.`,
    );

    // Register rejection on behalf of the exiting peer
    activeTransfer.rejectedReceivers.add(peerId);
    activeTransfer.totalResponses++;

    const fileId = activeTransfer.fileId;
    const totalReceivers = activeTransfer.receiversSnapshot.length;
    const totalResponses = activeTransfer.totalResponses;

    // Update all clients with the response count
    io.in(session.id).emit('response-count-updated', {
      fileId,
      totalResponses,
      totalReceivers,
    });

    emitToHostSocket(io, session, 'response-count-updated', {
      fileId,
      totalResponses,
      totalReceivers,
    });

    const sender = session.peers.get(activeTransfer.senderPeerId);
    if (sender) {
      io.to(sender.socketId).emit('receiver-rejected', { fileId, receiverPeerId: peerId });
    }

    // Check if all receivers have responded now
    if (totalResponses >= totalReceivers) {
      logger.info(
        `All responses received for ${fileId} after auto-rejection: ${totalResponses}/${totalReceivers}`,
      );
      settleResponses(session, fileId, io);
    }
  }
}
