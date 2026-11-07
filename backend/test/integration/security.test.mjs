import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { config } from '../../src/config.js';
import { store } from '../../src/state/store.js';
import { createSession } from '../../src/services/session.service.js';
import { registerSocketHandlers } from '../../src/sockets/handlers.js';
import { createTestApp } from '../helpers/test-app.mjs';
import { createMockSocket } from '../helpers/mock-io.mjs';
import { resetStoreForTests, ensureUploadsDir } from '../helpers/reset-store.mjs';

describe('security hardening', () => {
  let app;
  let io;
  const uploadsDir = config.uploadsDir;

  beforeEach(() => {
    resetStoreForTests();
    config.uploadsDir = uploadsDir;
    ensureUploadsDir(uploadsDir);
    ({ app, io } = createTestApp());
  });

  describe('download receiver authorization', () => {

    it('rejects download for a receiver that is not part of the session (403)', async () => {
      const { sessionId } = await createSession(io, true);

      const res = await request(app).get(`/download/${sessionId}/some-file?receiver=stranger-peer`);

      assert.equal(res.status, 403);
      assert.match(res.body.error, /not part of this session/);
    });

    it('allows download for a connected session peer (200)', async () => {
      const { sessionId } = await createSession(io, true);
      const session = store.sessions.get(sessionId);
      session.peers.set('receiver-peer', {
        peerId: 'receiver-peer',
        role: 'client',
        socketId: 'sock-receiver',
        isDisconnected: false,
      });

      const fileId = 'auth-ok-file';
      const filePath = path.join(uploadsDir, `${sessionId}-${fileId}`);
      const payload = 'hello secure transfer';
      fs.writeFileSync(filePath, payload);
      session.activeFiles.set(fileId, {
        id: fileId,
        name: 'ok.bin',
        type: 'application/octet-stream',
        path: filePath,
        size: payload.length,
        pending: 1,
      });

      try {
        const res = await request(app).get(
          `/download/${sessionId}/${fileId}?receiver=receiver-peer`,
        );
        assert.equal(res.status, 200);
        assert.equal(Buffer.from(res.body).toString(), payload);
      } finally {
        // The disk strategy already deletes the file once pending hits zero.
        fs.rmSync(filePath, { force: true });
      }
    });

    it('passes authorization for an accepted receiver of the active transfer', async () => {
      const { sessionId } = await createSession(io, true);
      const session = store.sessions.get(sessionId);
      session.activeTransfer = {
        senderPeerId: 'sender-peer',
        acceptedReceivers: new Set(['accepted-peer']),
      };

      const res = await request(app).get(`/download/${sessionId}/f?receiver=accepted-peer`);

      // Authorization must pass (not 403); the transfer itself is unknown, so
      // the strategy answers 404.
      assert.equal(res.status, 404);
    });
  });

  describe('socket host role binding', () => {
    function makeSocket(id, address) {
      const socket = createMockSocket(id);
      socket.handshake = { address: address || null, query: {} };
      socket.join = () => {};
      socket.leave = () => {};
      return socket;
    }

    it('rejects a non-local socket joining as host', async () => {
      const { sessionId } = await createSession(io, true);
      registerSocketHandlers(io);

      const remote = makeSocket('sock-remote', '192.168.1.77');
      io.connect(remote);
      remote.trigger('join-session', { sessionId, role: 'host', peerId: 'evil-host' });

      const err = remote.emitted.find((e) => e.event === 'error');
      assert.ok(err, 'expected an error emit');
      assert.match(err.payload.message, /host machine/i);
      assert.equal(store.sessions.get(sessionId).peers.has('evil-host'), false);
    });

    it('rejects a non-local socket claiming an existing host peer id', async () => {
      const { sessionId } = await createSession(io, true);
      const session = store.sessions.get(sessionId);
      session.peers.set('real-host', {
        peerId: 'real-host',
        role: 'host',
        socketId: 'sock-host',
        handshakeAddress: '127.0.0.1',
        isDisconnected: false,
      });
      registerSocketHandlers(io);

      const remote = makeSocket('sock-remote', '192.168.1.77');
      io.connect(remote);
      remote.trigger('join-session', { sessionId, role: 'client', peerId: 'real-host' });

      const err = remote.emitted.find((e) => e.event === 'error');
      assert.ok(err, 'expected an error emit');
      // The host record must be untouched
      assert.equal(session.peers.get('real-host').socketId, 'sock-host');
    });

    it('allows a local socket to join as host and grants host controls', async () => {
      const { sessionId } = await createSession(io, true);
      registerSocketHandlers(io);

      const local = makeSocket('sock-local');
      io.connect(local);
      local.trigger('join-session', { sessionId, role: 'host', peerId: 'host-1' });

      const joined = local.emitted.find((e) => e.event === 'session-joined');
      assert.ok(joined, 'expected session-joined emit');
      assert.equal(joined.payload.role, 'host');
    });
  });
});
