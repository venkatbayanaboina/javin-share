import { store } from '../state/store.js';
import { logger } from '../logger.js';

export function checkAndReleaseStaleTransferLocks(sessionId, io) {
  const session = store.sessions.get(sessionId);
  if (!session) return;

  if (session.currentSenderPeerId && !session.activeTransfer) {
    logger.info(
      `Releasing stale send lock for ${session.currentSenderPeerId} in session ${sessionId}`,
    );
    session.currentSenderPeerId = null;
    io.in(sessionId).emit('transfer-unlocked');
  }
}
