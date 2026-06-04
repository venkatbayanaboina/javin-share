import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { config } from '../../src/config.js';
import { store } from '../../src/state/store.js';
import { createSession } from '../../src/services/session.service.js';
import { createTestApp } from '../helpers/test-app.mjs';
import { resetStoreForTests, ensureUploadsDir, cleanUploadsDir } from '../helpers/reset-store.mjs';

describe('POST /upload/:sessionId', () => {
  let app;
  let io;
  let sessionId;
  const fileId = 'peer1-1700000001';
  const payload = 'hello integration upload';

  const originalUploadsDir = config.uploadsDir;
  const testUploadsDir = path.join(originalUploadsDir, 'upload-test');

  beforeEach(async () => {
    resetStoreForTests();
    config.uploadsDir = testUploadsDir;
    ensureUploadsDir(testUploadsDir);
    cleanUploadsDir(testUploadsDir);
    ({ app, io } = createTestApp());
    ({ sessionId } = await createSession(io, true));
  });

  after(() => {
    cleanUploadsDir(testUploadsDir);
    config.uploadsDir = originalUploadsDir; // Restore
  });

  it('stores uploaded file metadata and bytes on disk', async () => {
    const res = await request(app)
      .post(`/upload/${sessionId}`)
      .field('fileId', fileId)
      .attach('file', Buffer.from(payload), 'notes.txt');

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.fileId, fileId);

    const session = store.sessions.get(sessionId);
    const meta = session.activeFiles.get(fileId);
    assert.ok(meta);
    assert.equal(meta.name, 'notes.txt');
    assert.ok(fs.existsSync(meta.path));

    const onDisk = fs.readFileSync(meta.path, 'utf8');
    assert.equal(onDisk, payload);
  });

  it('rejects invalid session id', async () => {
    const res = await request(app)
      .post('/upload/not_valid!!')
      .field('fileId', fileId)
      .attach('file', Buffer.from('x'), 'x.txt');

    assert.equal(res.status, 400);
  });

  it('returns 404 for unknown session', async () => {
    const res = await request(app)
      .post('/upload/unknownsess')
      .field('fileId', fileId)
      .attach('file', Buffer.from('x'), 'x.txt');

    assert.equal(res.status, 404);
  });
});
