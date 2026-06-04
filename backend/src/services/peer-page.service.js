import { normalizePeerPage, PeerPage } from '../config/pages.js';

export { PeerPage, normalizePeerPage };

export function setPeerPage(peer, pageKey) {
  const page = normalizePeerPage(pageKey);
  peer.page = page;
  // Legacy fields — read by older code paths until fully removed
  peer.currentPage = page === PeerPage.SESSION ? 'main' : page === PeerPage.HOST ? 'index' : page;
  peer.inMain = page === PeerPage.SESSION;
  peer.isMainPage = page === PeerPage.SESSION;
}

export function getPeerPage(peer) {
  return normalizePeerPage(peer?.page ?? peer?.currentPage);
}

export function isPeerOnSession(peer) {
  return getPeerPage(peer) === PeerPage.SESSION;
}

export function isPeerOnSend(peer) {
  return getPeerPage(peer) === PeerPage.SEND;
}

export function isPeerOnReceive(peer) {
  return getPeerPage(peer) === PeerPage.RECEIVE;
}

export function peersOnPage(session, pageKey) {
  return Array.from(session.peers.values()).filter(
    (p) => getPeerPage(p) === normalizePeerPage(pageKey) && !p.isDisconnected,
  );
}
