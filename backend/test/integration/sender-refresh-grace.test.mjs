import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { store } from '../../src/state/store.js';
import { createSession } from '../../src/services/session.service.js';
import { registerSocketHandlers } from '../../src/sockets/handlers.js';
import { setPeerPage, PeerPage } from '../../src/services/peer-page.service.js';
import { createTestApp } from '../helpers/test-app.mjs';
import { createMockSocket } from '../helpers/mock-io.mjs';
import { resetStoreForTests } from '../helpers/reset-store.mjs';

const GRACE_MS = 2000;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Regression tests for the sender-refresh bug: the browser fires beforeunload
 * → leave-send-page + cancel-transfer even when the sender is merely
 * reloading, which used to kick every receiver off the receive page instantly.
 * The server now defers those disruptions behind a short grace window that is
 * cancelled when the sender re-enters the send page.
 */
describe('sender refresh grace', () => {
  let io;

  beforeEach(() => {
    resetStoreForTests();
    ({ io } = createTestApp());
    registerSocketHandlers(io);
  });

  function makeSocket(id, { address = null, query = {}, peerId, sessionId } = {}) {
    const socket = createMockSocket(id);
    socket.handshake = { address, query };
    socket.join = () => {};
    socket.leave = () => {};
    socket.data = { peerId, sessionId, role: 'client', page: PeerPage.SEND };
    return socket;
  }

  function setupSession() {
    return createSession(io, true).then(({ sessionId: sid }) => {
      const session = store.sessions.get(sid);
      const sender = {
        peerId: 'sender-1',
        role: 'client',
        socketId: 'sock-sender',
        isDisconnected: false,
      };
      const receiver = {
        peerId: 'receiver-1',
        role: 'client',
        socketId: 'sock-receiver',
        isDisconnected: false,
      };
      setPeerPage(sender, PeerPage.SEND);
      setPeerPage(receiver, PeerPage.RECEIVE);
      session.peers.set('sender-1', sender);
      session.peers.set('receiver-1', receiver);
      session.currentSenderPeerId = 'sender-1';
      return { sid, session };
    });
  }

  const socketEmits = (socket, event) => socket.emitted.filter((e) => e.event === event);
  const roomEmits = (io, event) =>
    io.emitted.filter((e) => e.scope === 'room' && e.event === event);

  it('does not bounce receivers immediately when the active sender leaves', async () => {
    const { sid } = await setupSession();
    const sender = makeSocket('sock-sender', { peerId: 'sender-1', sessionId: sid });

    io.connect(sender);
    sender.trigger('leave-send-page', { sessionId: sid, peerId: 'sender-1' });
    sender.trigger('cancel-transfer', { sessionId: sid });

    assert.equal(socketEmits(sender, 'navigate').length, 0);
    assert.equal(roomEmits(io, 'return-all-to-main').length, 0);
    assert.equal(roomEmits(io, 'transfer-unlocked').length, 0);
    // The send lock must survive the grace window
    assert.equal(store.sessions.get(sid).currentSenderPeerId, 'sender-1');
  });

  it('cancels the disruption when the sender rejoins the send page (refresh)', async () => {
    const { sid, session } = await setupSession();
    const sender = makeSocket('sock-sender', {
      peerId: 'sender-1',
      sessionId: sid,
      query: { page: 'send' },
    });

    io.connect(sender);
    sender.trigger('leave-send-page', { sessionId: sid, peerId: 'sender-1' });
    sender.trigger('cancel-transfer', { sessionId: sid });

    // The refresh completes: same peer rejoins with ?page=send on the handshake
    sender.trigger('join-session', {
      sessionId: sid,
      role: 'client',
      peerId: 'sender-1',
      deviceName: 'Sender',
    });
    sender.trigger('enter-send-page', { sessionId: sid, peerId: 'sender-1' });

    await wait(GRACE_MS + 300);

    const receiver = session.peers.get('receiver-1');
    assert.equal(getPage(receiver), PeerPage.RECEIVE, 'receiver must stay on receive page');
    assert.equal(roomEmits(io, 'return-all-to-main').length, 0);
    assert.equal(store.sessions.get(sid).currentSenderPeerId, 'sender-1');
  });

  it('bounces receivers and releases the lock once the sender is genuinely gone', async () => {
    const { sid, session } = await setupSession();
    const sender = makeSocket('sock-sender', { peerId: 'sender-1', sessionId: sid });

    io.connect(sender);
    sender.trigger('leave-send-page', { sessionId: sid, peerId: 'sender-1' });
    sender.trigger('cancel-transfer', { sessionId: sid });

    await wait(GRACE_MS + 300);

    const navigations = io.emitted.filter((e) => e.scope === 'socket' && e.event === 'navigate');
    assert.equal(navigations.length, 1, 'receiver should be navigated exactly once');
    assert.equal(navigations[0].payload.reason, 'sender_left_send_page');
    assert.equal(getPage(session.peers.get('receiver-1')), PeerPage.SESSION);
    assert.equal(store.sessions.get(sid).currentSenderPeerId, null);
    assert.equal(roomEmits(io, 'return-all-to-main').length, 1);
    assert.equal(roomEmits(io, 'transfer-unlocked').length, 1);
  });
});

function getPage(peer) {
  return peer?.page ?? null;
}
