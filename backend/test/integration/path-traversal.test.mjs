import { describe, it, beforeEach, after } from 'node:test';
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
import { resetStoreForTests, ensureUploadsDir, cleanUploadsDir } from '../helpers/reset-store.mjs';

/**
 * Regression tests for the path-traversal fix: client-supplied file/session ids are
 * interpolated into on-disk paths by the transfer strategies, so every entry point
 * (upload header, upload query, download route, socket request-to-send) must reject
 * ids outside [a-zA-Z0-9_-]{1,64}.
 */
describe('path traversal and id validation', () => {
  let app;
  let io;

  const originalUploadsDir = config.uploadsDir;
  const testUploadsDir = path.join(originalUploadsDir, 'path-traversal-test');

  beforeEach(async () => {
    resetStoreForTests();
    config.uploadsDir = testUploadsDir;
    ensureUploadsDir(testUploadsDir);
    cleanUploadsDir(testUploadsDir);
    ({ app, io } = createTestApp());
  });

  after(() => {
    config.uploadsDir = originalUploadsDir;
    cleanUploadsDir(testUploadsDir);
  });

  describe('upload entry points (x-file-id header / fileId query)', () => {
    it('rejects traversal fileId sent via x-file-id header with 400', async () => {
      const { sessionId } = await createSession(io, true);

      const res = await request(app)
        .post(`/upload/${sessionId}`)
        .set('x-file-id', '../../evil')
        .send();

      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'Invalid file id');
      // Nothing may be written outside the uploads dir
      const escaped = path.resolve(testUploadsDir, '..', 'evil');
      assert.equal(fs.existsSync(`${escaped}`), false);
    });

    it('rejects traversal fileId sent via query string with 400', async () => {
      const { sessionId } = await createSession(io, true);

      const res = await request(app)
        .post(`/upload/${sessionId}`)
        .query('fileId=..%2F..%2Fevil')
        .send();

      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'Invalid file id');
    });

    it('rejects malformed session id on upload with 400', async () => {
      await createSession(io, true);

      const res = await request(app).post('/upload/..%2Fetc').set('x-file-id', 'valid-id-1').send();

      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'Invalid session id');
    });
  });

  describe('download entry points', () => {
    it('rejects traversal fileId in download URL with 400', async () => {
      const { sessionId } = await createSession(io, true);

      const res = await request(app).get(`/download/${sessionId}/..%2F..%2Fevil`);

      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'Invalid session or file id');
    });

    it('rejects traversal receiver id with 400', async () => {
      const { sessionId } = await createSession(io, true);

      const res = await request(app)
        .get(`/download/${sessionId}/valid-file-1`)
        .query('receiver=..%2Fpeer');

      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'Invalid receiver id');
    });

    it('answers 416 (not a crash) for a non-numeric Range header', async () => {
      const { sessionId } = await createSession(io, true);
      const fileId = 'range-test-file';
      const filePath = path.join(testUploadsDir, `${sessionId}-${fileId}`);
      fs.writeFileSync(filePath, Buffer.alloc(10, 'x'));
      const session = store.sessions.get(sessionId);
      session.activeFiles.set(fileId, {
        id: fileId,
        name: 'range-test.bin',
        type: 'application/octet-stream',
        path: filePath,
        size: 10,
      });

      const res = await request(app)
        .get(`/download/${sessionId}/${fileId}`)
        .set('Range', 'bytes=abc-');

      assert.equal(res.status, 416);
      assert.equal(res.headers['content-range'], 'bytes */10');
    });

    it('answers 416 for a negative Range offset', async () => {
      const { sessionId } = await createSession(io, true);
      const fileId = 'range-neg-file';
      const filePath = path.join(testUploadsDir, `${sessionId}-${fileId}`);
      fs.writeFileSync(filePath, Buffer.alloc(10, 'x'));
      const session = store.sessions.get(sessionId);
      session.activeFiles.set(fileId, {
        id: fileId,
        name: 'range-neg.bin',
        type: 'application/octet-stream',
        path: filePath,
        size: 10,
      });

      const res = await request(app)
        .get(`/download/${sessionId}/${fileId}`)
        .set('Range', 'bytes=-5-');

      assert.equal(res.status, 416);
    });

    it('still serves valid Range requests with 206 (positive control)', async () => {
      const { sessionId } = await createSession(io, true);
      const fileId = 'range-ok-file';
      const filePath = path.join(testUploadsDir, `${sessionId}-${fileId}`);
      fs.writeFileSync(filePath, Buffer.alloc(10, 'x'));
      const session = store.sessions.get(sessionId);
      session.activeFiles.set(fileId, {
        id: fileId,
        name: 'range-ok.bin',
        type: 'application/octet-stream',
        path: filePath,
        size: 10,
      });

      const res = await request(app)
        .get(`/download/${sessionId}/${fileId}`)
        .set('Range', 'bytes=0-3');

      assert.equal(res.status, 206);
      assert.equal(res.headers['content-range'], 'bytes 0-3/10');
      assert.equal(res.headers['accept-ranges'], 'bytes');
      assert.equal(res.body.length, 4);
    });
  });

  describe('socket request-to-send entry point', () => {
    function connectClient() {
      const socket = createMockSocket();
      registerSocketHandlers(io);
      io.connect(socket);
      return socket;
    }

    it('rejects traversal file.id with send-rejected', () => {
      const socket = connectClient();

      socket.trigger('request-to-send', {
        sessionId: 'sess-valid-id',
        senderId: 'sender1',
        file: { id: '../../evil', name: 'evil.bin', size: 1 },
      });

      const rejected = socket.emitted.find((e) => e.event === 'send-rejected');
      assert.ok(rejected, 'expected a send-rejected emit');
      assert.equal(rejected.payload.reason, 'Invalid session, sender, or file id');
      // The malicious id must not be echoed back to the client
      assert.equal(rejected.payload.fileId, undefined);
    });

    it('rejects non-string file.id with send-rejected', () => {
      const socket = connectClient();

      socket.trigger('request-to-send', {
        sessionId: 'sess-valid-id',
        senderId: 'sender1',
        file: { id: { nested: 'object' }, name: 'evil.bin', size: 1 },
      });

      const rejected = socket.emitted.find((e) => e.event === 'send-rejected');
      assert.ok(rejected, 'expected a send-rejected emit');
    });

    it('rejects missing file payload with send-rejected', () => {
      const socket = connectClient();

      socket.trigger('request-to-send', {
        sessionId: 'sess-valid-id',
        senderId: 'sender1',
      });

      const rejected = socket.emitted.find((e) => e.event === 'send-rejected');
      assert.ok(rejected, 'expected a send-rejected emit');
    });

    it('still reaches normal validation for well-formed ids (positive control)', async () => {
      const { sessionId } = await createSession(io, true);
      const socket = connectClient();

      socket.trigger('request-to-send', {
        sessionId,
        senderId: 'sender1',
        file: { id: 'valid-file-1', name: 'ok.bin', size: 1 },
      });

      // Host-only session: no receivers exist, so the request must pass id validation
      // and be rejected on receiver availability — not on id format.
      const rejected = socket.emitted.find((e) => e.event === 'send-rejected');
      assert.ok(rejected, 'expected a send-rejected emit');
      assert.equal(rejected.payload.reason, 'No receivers available.');
      assert.equal(rejected.payload.fileId, 'valid-file-1');
    });
  });
});
