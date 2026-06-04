import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  setPeerPage,
  getPeerPage,
  isPeerOnSession,
  peersOnPage,
  PeerPage,
} from '../../src/services/peer-page.service.js';

describe('peer-page.service', () => {
  it('normalizes legacy main to session', () => {
    const peer = {};
    setPeerPage(peer, 'main');
    assert.equal(peer.page, PeerPage.SESSION);
    assert.equal(peer.inMain, true);
    assert.equal(peer.currentPage, 'main');
  });

  it('tracks peers on page', () => {
    const session = {
      peers: new Map([
        ['a', { peerId: 'a', page: PeerPage.SESSION, isDisconnected: false }],
        ['b', { peerId: 'b', page: PeerPage.SEND, isDisconnected: false }],
        ['c', { peerId: 'c', page: PeerPage.SESSION, isDisconnected: true }],
      ]),
    };
    assert.equal(peersOnPage(session, PeerPage.SESSION).length, 1);
    assert.equal(isPeerOnSession(session.peers.get('a')), true);
    assert.equal(getPeerPage({ currentPage: 'send' }), PeerPage.SEND);
  });
});
