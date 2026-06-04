import { pageUrl, Pages } from './pages.js';

function resolveNavigateUrl(data, fallbackPage) {
  if (data?.to) {
    return data.to.startsWith('/') ? data.to : `/${data.to}`;
  }
  const sessionId = data?.sessionId ?? data?.session;
  const role = data?.role;
  const peerId = data?.peerId;
  const forced = data?.forced === true || data?.forced === 'true';
  if (fallbackPage === Pages.RECEIVE_FILES) {
    return pageUrl(Pages.RECEIVE_FILES, { session: sessionId, role, peerId, forced });
  }
  if (fallbackPage === Pages.SEND_FILES) {
    return pageUrl(Pages.SEND_FILES, { session: sessionId, role, peerId });
  }
  return pageUrl(Pages.SESSION, { session: sessionId, role, peerId });
}

function inferFallbackPage(data) {
  const page = data?.page || '';
  const to = data?.to || '';
  if (page === 'receive' || page === 'receive-files' || to.includes('receive-files')) {
    return Pages.RECEIVE_FILES;
  }
  if (page === 'send' || page === 'send-files' || to.includes('send-files')) {
    return Pages.SEND_FILES;
  }
  return Pages.SESSION;
}

function isSameDestination(url) {
  if (!url) return false;
  try {
    const target = new URL(url, window.location.origin);
    const current = new URL(window.location.href);
    if (target.pathname !== current.pathname) return false;
    const session = target.searchParams.get('session');
    const curSession = current.searchParams.get('session');
    return session === curSession;
  } catch {
    return false;
  }
}

export function applyNavigate(data, fallbackPage = Pages.SESSION, { onSamePage } = {}) {
  const url = resolveNavigateUrl(data, fallbackPage);
  if (!url) return;
  if (isSameDestination(url)) {
    onSamePage?.(data, url);
    return;
  }
  window.location.href = url;
}

/**
 * Single navigation channel from server (`navigate` event).
 * @param {import('socket.io-client').Socket} socket
 * @param {{ beforeNavigate?: (data: object) => void, onSamePage?: (data: object, url: string) => void, navigateDelayMs?: number }} [options]
 */
export function registerNavigateListener(socket, { beforeNavigate, onSamePage, navigateDelayMs = 0 } = {}) {
  if (!socket || socket.__navigateRegistered) return;
  socket.__navigateRegistered = true;

  const go = (data) => {
    const fallbackPage = inferFallbackPage(data);
    try {
      beforeNavigate?.(data);
    } catch (_) {}
    const run = () => applyNavigate(data, fallbackPage, { onSamePage });
    if (navigateDelayMs > 0) setTimeout(run, navigateDelayMs);
    else run();
  };

  socket.on('navigate', go);
}
