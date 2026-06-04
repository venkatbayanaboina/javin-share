import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { store } from '../../src/state/store.js';
import { getHostPeer, assertHostPeer } from '../../src/services/peer-auth.service.js';
import { resetStoreForTests } from '../helpers/reset-store.mjs';

describe('peer-auth.service', () => {
  it('returns host peer only when role and session match', () => {
    resetStoreForTests();
    const sessionId = 'testsession1';
    store.sessions.set(sessionId, {
      id: sessionId,
      peers: new Map([
        ['host1', { peerId: 'host1', role: 'host', isDisconnected: false }],
        ['client1', { peerId: 'client1', role: 'client', isDisconnected: false }],
      ]),
    });

    assert.ok(getHostPeer(sessionId, 'host1'));
    assert.equal(getHostPeer(sessionId, 'client1'), null);
    assert.equal(assertHostPeer(sessionId, 'missing'), null);
  });
});
