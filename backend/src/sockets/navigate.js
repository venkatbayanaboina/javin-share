import { buildPagePath, PeerPage } from '../config/pages.js';

/**
 * @param {import('socket.io').Server} io
 * @param {string} socketId
 * @param {{ page?: string, sessionId?: string, role?: string, peerId?: string, reason?: string, message?: string, forced?: boolean, to?: string }} opts
 */
export function emitNavigate(io, socketId, opts) {
  const { page = PeerPage.SESSION, sessionId, role, peerId, reason, message, forced, to } = opts;

  const path = to || buildPagePath(page, { sessionId, role, peerId, forced });

  io.to(socketId).emit('navigate', {
    to: path,
    sessionId,
    role,
    peerId,
    reason,
    message,
    forced: !!forced,
  });

  return path;
}
