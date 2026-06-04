/** Canonical page filenames — keep in sync with frontend/assets/js/core/pages.js */
export const PAGE_FILES = {
  host: 'host.html',
  pin: 'join-pin.html',
  session: 'session.html',
  send: 'send-files.html',
  receive: 'receive-files.html',
  ended: 'session-ended.html',
  history: 'history.html',
};

/** Internal peer.page values */
export const PeerPage = {
  HOST: 'host',
  PIN: 'pin',
  SESSION: 'session',
  SEND: 'send',
  RECEIVE: 'receive',
};

/**
 * @param {string} pageKey - PeerPage value or legacy alias (main, index)
 */
export function normalizePeerPage(pageKey) {
  if (!pageKey) return null;
  if (pageKey === 'main') return PeerPage.SESSION;
  if (pageKey === 'index') return PeerPage.HOST;
  return pageKey;
}

/**
 * @param {string} pageKey
 * @param {{ sessionId?: string, role?: string, peerId?: string, forced?: boolean }} params
 */
export function buildPagePath(pageKey, { sessionId, role, peerId, forced } = {}) {
  const normalized = normalizePeerPage(pageKey);
  const file = PAGE_FILES[normalized] || PAGE_FILES.session;
  const q = new URLSearchParams();
  if (sessionId) q.set('session', sessionId);
  if (role) q.set('role', role);
  if (peerId) q.set('peerId', peerId);
  if (forced) q.set('forced', 'true');
  const qs = q.toString();
  return `/${file}${qs ? `?${qs}` : ''}`;
}
