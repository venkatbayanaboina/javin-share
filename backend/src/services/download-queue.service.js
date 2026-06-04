import fs from 'fs';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { store } from '../state/store.js';

export function decrementPendingDownloads(fileMetadata, session, fileId) {
  if (!fileMetadata) return;

  // Only delete after the transfer flow sets a pending download count (upload-complete).
  if (typeof fileMetadata.pending !== 'number') {
    return;
  }

  fileMetadata.pending = Math.max(0, fileMetadata.pending - 1);

  if (fileMetadata.pending === 0) {
    if (fileMetadata.path && fileMetadata.path !== 'in-memory-stream') {
      try {
        if (fs.existsSync(fileMetadata.path)) {
          fs.unlinkSync(fileMetadata.path);
        }
      } catch (e) {
        if (e?.code !== 'ENOENT') {
          logger.error('Failed to delete file after download:', e);
        }
      }
    }
    try {
      session.activeFiles.delete(fileId);
    } catch (_) {
      /* ignore */
    }
  }
}

export function progressReceiverDownloadQueue(sessionId, receiverPeerId, io) {
  if (!receiverPeerId) return;

  const session = store.sessions.get(sessionId);
  if (!session) return;

  if (!store.receiverActiveDownloads.has(sessionId)) {
    store.receiverActiveDownloads.set(sessionId, new Map());
  }
  const activeMap = store.receiverActiveDownloads.get(sessionId);
  activeMap.set(receiverPeerId, Math.max(0, (activeMap.get(receiverPeerId) || 0) - 1));

  const sessionDownloadQueue = store.receiverDownloadQueues.get(sessionId);
  const receiverQueue = sessionDownloadQueue?.get(receiverPeerId) || [];
  const receiver = session.peers.get(receiverPeerId);

  while (
    receiver &&
    receiverQueue &&
    receiverQueue.length > 0 &&
    (activeMap.get(receiverPeerId) || 0) < config.maxConcurrentDownloadsPerReceiver
  ) {
    const nextFile = receiverQueue.shift();
    io.to(receiver.socketId).emit('download-ready', {
      file: nextFile.file,
      downloadUrl: nextFile.downloadUrl,
    });
    activeMap.set(receiverPeerId, (activeMap.get(receiverPeerId) || 0) + 1);
    logger.info(`Active downloads for ${receiverPeerId}: ${activeMap.get(receiverPeerId)}`);
  }

  if (receiverQueue.length === 0 && sessionDownloadQueue) {
    sessionDownloadQueue.delete(receiverPeerId);
    if (sessionDownloadQueue.size === 0) {
      store.receiverDownloadQueues.delete(sessionId);
    }
  }

  const remaining = activeMap.get(receiverPeerId) || 0;
  const hasQueue = !!store.receiverDownloadQueues.get(sessionId)?.get(receiverPeerId)?.length;
  if (receiver && remaining === 0 && !hasQueue) {
    io.to(receiver.socketId).emit('receiver-downloads-idle');
  }
}
