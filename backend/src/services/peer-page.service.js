import { normalizePeerPage, PeerPage } from '../config/pages.js';

export { PeerPage, normalizePeerPage };

export function setPeerPage(peer, pageKey) {
  peer.page = normalizePeerPage(pageKey);
}

export function getPeerPage(peer) {
  return normalizePeerPage(peer?.page ?? peer?.currentPage);
}

export function isPeerOnSession(peer) {
  return getPeerPage(peer) === PeerPage.SESSION;
}

export function peersOnPage(session, pageKey) {
  return Array.from(session.peers.values()).filter(
    (p) => getPeerPage(p) === normalizePeerPage(pageKey) && !p.isDisconnected,
  );
}
