import { config } from '../config.js';
import { logger } from '../logger.js';
import { store } from '../state/store.js';
import { PeerPage, setPeerPage, getPeerPage } from './peer-page.service.js';
import { emitNavigate } from '../sockets/navigate.js';

const EXTEND_MS = 30 * 1000;
const HOST_EMIT_DELAY_MS = 1000;

function findHost(session) {
  return Array.from(session.peers.values()).find((p) => p.role === 'host');
}

function hasConnectedClients(session) {
  return Array.from(session.peers.values()).some((p) => p.role !== 'host' && !p.isDisconnected);
}

/**
 * @param {import('../state/store.js').Session} session
 */
export function getGraceState(session) {
  if (!session?.graceRedirectEndMs) return null;
  const remainingMs = Math.max(0, session.graceRedirectEndMs - Date.now());
  if (remainingMs <= 0 && !session.graceRedirectTimer) return null;
  return {
    active: true,
    sessionId: session.id,
    graceEndMs: session.graceRedirectEndMs,
    remainingMs,
    durationSeconds: Math.ceil(remainingMs / 1000),
  };
}

/**
 * @param {import('socket.io').Server} io
 * @param {import('../state/store.js').Session} session
 * @param {string} [targetSocketId]
 */
export function emitGraceCountdown(io, session, targetSocketId = null) {
  const state = getGraceState(session);
  if (!state?.active) return;
  const payload = {
    sessionId: session.id,
    graceEndMs: state.graceEndMs,
    durationSeconds: state.durationSeconds,
  };
  if (targetSocketId) {
    io.to(targetSocketId).emit('start-host-redirect-countdown', payload);
  } else {
    io.in(session.id).emit('start-host-redirect-countdown', payload);
  }
}

function onGraceExpired(sessionId, io) {
  const session = store.sessions.get(sessionId);
  if (!session) return;

  clearGraceRedirect(session, io, { notifyHost: false });

  const currentHost = findHost(session);
  if (currentHost && hasConnectedClients(session) && getPeerPage(currentHost) === PeerPage.HOST) {
    logger.info(
      `⏰ Grace window ended. Automatically redirecting host ${currentHost.peerId} to session page.`,
    );
    setPeerPage(currentHost, PeerPage.SESSION);
    session.peers.set(currentHost.peerId, currentHost);
    emitNavigate(io, currentHost.socketId, {
      page: PeerPage.SESSION,
      sessionId,
      role: 'host',
      peerId: currentHost.peerId,
    });
  } else {
    logger.info(`⏰ Grace window ended but no clients connected for session ${sessionId}.`);
  }
}

function scheduleGraceExpiry(session, io) {
  const remainingMs = Math.max(0, (session.graceRedirectEndMs || 0) - Date.now());
  try {
    if (session.graceRedirectTimer) clearTimeout(session.graceRedirectTimer);
  } catch (_) {}
  session.graceRedirectTimer = setTimeout(() => onGraceExpired(session.id, io), remainingMs);
}

/**
 * Start grace redirect window after first client PIN verification.
 * @param {import('../state/store.js').Session} session
 * @param {import('socket.io').Server} io
 */
export function startGraceRedirect(session, io) {
  if (session.graceRedirectTimer || session.graceRedirectEndMs) {
    logger.info(`Client verified while grace window active for session ${session.id}`);
    return;
  }

  const now = Date.now();
  session.graceRedirectStartedAt = now;
  session.graceRedirectEndMs = now + config.gracePeriodMs;
  logger.info(
    `Starting host redirect grace window (${config.gracePeriodMs / 1000}s) for session ${session.id}`,
  );

  scheduleGraceExpiry(session, io);

  setTimeout(() => {
    const current = store.sessions.get(session.id);
    if (!current) return;
    const hostPeer = findHost(current);
    if (!hostPeer) {
      logger.info(`No host found in session ${session.id}, skipping grace timer event`);
      return;
    }
    logger.info(`Emitting start-host-redirect-countdown to host ${hostPeer.peerId}`);
    emitGraceCountdown(io, current, hostPeer.socketId);
  }, HOST_EMIT_DELAY_MS);
}

/**
 * @param {import('../state/store.js').Session} session
 * @param {import('socket.io').Server} io
 */
export function extendGraceRedirect(session, io) {
  const now = Date.now();
  if (!session.graceRedirectEndMs) {
    return { ok: false, reason: 'not_active', message: 'No grace timer running.' };
  }

  const startedAt =
    session.graceRedirectStartedAt || session.graceRedirectEndMs - config.gracePeriodMs;
  const totalSoFar = Math.max(0, now - startedAt);

  if (totalSoFar >= config.maxGraceMs) {
    logger.info(`Grace window maxed out for session ${session.id}`);
    return {
      ok: false,
      reason: 'max_extended',
      message: `Grace period already at maximum (${config.maxGraceMs / 1000} seconds).`,
    };
  }

  const remaining = Math.max(0, session.graceRedirectEndMs - now);
  const newDuration = Math.min(config.maxGraceMs - totalSoFar, remaining + EXTEND_MS);
  session.graceRedirectEndMs = now + newDuration;
  scheduleGraceExpiry(session, io);
  emitGraceCountdown(io, session);

  logger.info(
    `Extended host redirect grace window to ${Math.ceil(newDuration / 1000)}s for session ${session.id}`,
  );

  return {
    ok: true,
    graceEndMs: session.graceRedirectEndMs,
    remainingMs: newDuration,
    newDuration: Math.ceil(newDuration / 1000),
  };
}

/**
 * @param {import('../state/store.js').Session} session
 * @param {import('socket.io').Server} io
 * @param {{ notifyHost?: boolean }} [options]
 */
export function clearGraceRedirect(session, io, { notifyHost = true } = {}) {
  try {
    if (session.graceRedirectTimer) clearTimeout(session.graceRedirectTimer);
  } catch (_) {}
  session.graceRedirectTimer = null;
  session.graceRedirectEndMs = null;
  session.graceRedirectStartedAt = null;

  if (!notifyHost || !io) return;

  const hostPeer = findHost(session);
  if (hostPeer) {
    io.to(hostPeer.socketId).emit('grace-timer-cleared');
    logger.info(`Notified host ${hostPeer.peerId} to clear grace timer display`);
  }
}

/**
 * Push active grace state to a specific host socket (e.g. after reconnect).
 */
export function syncGraceToHost(io, session, hostSocketId) {
  if (getGraceState(session)?.active) {
    emitGraceCountdown(io, session, hostSocketId);
  }
}
