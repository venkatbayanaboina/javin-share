/** Canonical frontend page paths (keep in sync with backend/src/config/pages.js). */
export const Pages = {
  HOST: '/host.html',
  JOIN_PIN: '/join-pin.html',
  SESSION: '/session.html',
  SEND_FILES: '/send-files.html',
  RECEIVE_FILES: '/receive-files.html',
  SESSION_ENDED: '/session-ended.html',
  HISTORY: '/history.html',
};

/**
 * @param {string} path - One of Pages.*
 * @param {{ session?: string, role?: string, peerId?: string, forced?: boolean }} [params]
 */
export function pageUrl(path, { session, role, peerId, forced } = {}) {
  const url = new URL(path, window.location.origin);
  if (session) url.searchParams.set('session', session);
  if (role) url.searchParams.set('role', role);
  if (peerId) url.searchParams.set('peerId', peerId);
  if (forced) url.searchParams.set('forced', 'true');
  return `${url.pathname}${url.search}`;
}

/** @param {import('socket.io-client').Socket} socket */
export function pageFromPathname(pathname = window.location.pathname) {
  if (pathname.includes('host.html')) return 'host';
  if (pathname.includes('join-pin')) return 'pin';
  if (pathname.includes('session.html')) return 'session';
  if (pathname.includes('send-files')) return 'send';
  if (pathname.includes('receive-files')) return 'receive';
  if (pathname.includes('session-ended')) return 'ended';
  if (pathname.includes('history.html')) return 'history';
  return null;
}
