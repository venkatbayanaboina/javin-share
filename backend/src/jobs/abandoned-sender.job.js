import { logger } from '../logger.js';
import { store } from '../state/store.js';
import { PeerPage, setPeerPage, peersOnPage } from '../services/peer-page.service.js';
import { emitNavigate } from '../sockets/navigate.js';

const pendingChecks = new Map();

/**
 * Run abandoned-sender logic once (debounced per session).
 * Replaces the former 7-second global polling interval.
 */
export function scheduleAbandonedSenderCheck(sessionId, io, delayMs = 400) {
  const existing = pendingChecks.get(sessionId);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    pendingChecks.delete(sessionId);
    checkForAbandonedSenders(sessionId, io);
  }, delayMs);

  pendingChecks.set(sessionId, timer);
}

export function checkForAbandonedSenders(sessionId, io) {
  const session = store.sessions.get(sessionId);
  if (!session) return;

  if (session.recentSendRequestAt && Date.now() - session.recentSendRequestAt < 5000) {
    logger.info('Skipping abandoned-sender check (recent send request)');
    return;
  }

  if (session.recentEnterSendPageAt && Date.now() - session.recentEnterSendPageAt < 3000) {
    logger.info('Skipping abandoned-sender check (recent enter-send-page event)');
    return;
  }

  if (session.recentEnterReceivePageAt && Date.now() - session.recentEnterReceivePageAt < 3000) {
    logger.info('Skipping abandoned-sender check (recent enter-receive-page event)');
    return;
  }

  const receiversInReceivePage = peersOnPage(session, PeerPage.RECEIVE);
  const sendersInSendPage = peersOnPage(session, PeerPage.SEND);
  const hasActiveTransfer = session.activeTransfer !== null;

  logger.info(`Abandoned sender check for session ${sessionId}:`);
  logger.info(`  - Receivers in receive page: ${receiversInReceivePage.length}`);
  logger.info(`  - Senders in send page: ${sendersInSendPage.length}`);
  logger.info(`  - Active transfer: ${hasActiveTransfer}`);

  const hasSenderLock = Boolean(session.currentSenderPeerId);

  if (
    receiversInReceivePage.length > 0 &&
    sendersInSendPage.length === 0 &&
    !hasActiveTransfer &&
    !hasSenderLock
  ) {
    const recentTransfer =
      session.lastTransferCompletedAt && Date.now() - session.lastTransferCompletedAt < 10000;

    if (!recentTransfer) {
      logger.info(
        `Redirecting ${receiversInReceivePage.length} receivers to session page — no active sender`,
      );

      receiversInReceivePage.forEach((receiver) => {
        setPeerPage(receiver, PeerPage.SESSION);
        session.peers.set(receiver.peerId, receiver);

        emitNavigate(io, receiver.socketId, {
          page: PeerPage.SESSION,
          reason: 'sender_abandoned_transfer',
          message: 'The sender appears to have left. You have been redirected to the session page.',
          sessionId,
          role: receiver.role,
          peerId: receiver.peerId,
        });
      });
    }
  }

  if (sendersInSendPage.length > 0 && !hasActiveTransfer) {
    const usersOnSessionPage = peersOnPage(session, PeerPage.SESSION).filter(
      (p) => p.peerId !== sendersInSendPage[0].peerId,
    );

    if (usersOnSessionPage.length > 0) {
      usersOnSessionPage.forEach((user) => {
        setPeerPage(user, PeerPage.RECEIVE);
        session.peers.set(user.peerId, user);

        emitNavigate(io, user.socketId, {
          page: PeerPage.RECEIVE,
          reason: 'sender_active_in_send_page',
          message: 'A sender is active. You have been redirected to the receive page.',
          sessionId,
          role: user.role,
          peerId: user.peerId,
          forced: true,
        });
      });
    }
  }
}
