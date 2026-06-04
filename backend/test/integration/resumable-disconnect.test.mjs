import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import http from 'http';
import path from 'path';
import request from 'supertest';
import { config } from '../../src/config.js';
import { store } from '../../src/state/store.js';
import { createSession } from '../../src/services/session.service.js';
import { createTestApp } from '../helpers/test-app.mjs';
import { resetStoreForTests, ensureUploadsDir, cleanUploadsDir } from '../helpers/reset-store.mjs';

const FULL_TEXT = 'hello disconnect world';
const PARTIAL_LEN = 5; // "hello"

function abortingUpload(port, sessionId, fileId, payload, fileBytes) {
  return new Promise((resolve) => {
    const boundary = '----resumable-abort';
    const header = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="resume.txt"\r\nContent-Type: text/plain\r\n\r\n`,
    );
    const contentLength = header.length + fileBytes;
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        method: 'POST',
        path: `/upload/${sessionId}?fileId=${fileId}`,
        headers: {
          'X-File-Id': fileId,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': contentLength,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => {
          data += c;
        });
        res.on('end', () => resolve({ aborted: false, status: res.statusCode, data }));
      },
    );
    const sendAndAbort = () => {
      req.write(header);
      req.write(payload.subarray(0, fileBytes));
      setTimeout(() => req.destroy(), 50);
    };

    req.on('error', () => resolve({ aborted: true }));
    if (req.socket && !req.socket.connecting) {
      sendAndAbort();
    } else {
      req.on('socket', (socket) => {
        if (socket.connecting) {
          socket.once('connect', sendAndAbort);
        } else {
          sendAndAbort();
        }
      });
    }
  });
}

describe('Resumable upload after disconnect (relay-disk)', () => {
  let app;
  let io;
  let sessionId;
  const fileId = 'resume-disconnect-file';
  const originalUploadsDir = config.uploadsDir;
  const testUploadsDir = path.join(originalUploadsDir, 'resumable-disconnect-test');

  beforeEach(async () => {
    resetStoreForTests();
    config.uploadsDir = testUploadsDir;
    config.transfer.defaultStrategy = 'relay-disk';
    ensureUploadsDir(testUploadsDir);
    cleanUploadsDir(testUploadsDir);
    ({ app, io } = createTestApp());
    ({ sessionId } = await createSession(io, true));
  });

  after(() => {
    cleanUploadsDir(testUploadsDir);
    config.uploadsDir = originalUploadsDir;
  });

  it('persists partial bytes when the upload connection aborts mid-transfer', async () => {
    const server = app.listen(0);
    const port = server.address().port;
    const payload = Buffer.from(FULL_TEXT);

    const abortResult = await abortingUpload(port, sessionId, fileId, payload, PARTIAL_LEN);
    assert.equal(abortResult.aborted, true);

    await new Promise((r) => setTimeout(r, 400));

    const statusRes = await request(app).get(`/api/v1/upload/status/${sessionId}/${fileId}`);
    assert.equal(statusRes.status, 200);
    assert.ok(
      statusRes.body.bytesReceived >= PARTIAL_LEN - 1,
      `expected at least ${PARTIAL_LEN - 1} bytes persisted, got ${statusRes.body.bytesReceived}`,
    );

    await new Promise((resolve) => server.close(resolve));
  });

  it('resumes after partial upload and serves the complete file', async () => {
    const payload = Buffer.from(FULL_TEXT);

    const first = await request(app)
      .post(`/upload/${sessionId}?fileId=${fileId}`)
      .set('X-File-Id', fileId)
      .attach('file', payload.subarray(0, PARTIAL_LEN), 'resume.txt');
    assert.equal(first.status, 200);
    assert.equal(first.body.bytesReceived, PARTIAL_LEN);

    const statusMid = await request(app).get(`/api/v1/upload/status/${sessionId}/${fileId}`);
    assert.equal(statusMid.body.bytesReceived, PARTIAL_LEN);

    const second = await request(app)
      .post(`/upload/${sessionId}?fileId=${fileId}`)
      .set('X-File-Id', fileId)
      .set('X-Upload-Offset', String(PARTIAL_LEN))
      .attach('file', payload.subarray(PARTIAL_LEN), 'resume.txt');
    assert.equal(second.status, 200);
    assert.equal(second.body.bytesReceived, FULL_TEXT.length);

    const session = store.sessions.get(sessionId);
    const meta = session.activeFiles.get(fileId);
    assert.ok(meta);
    assert.equal(fs.readFileSync(meta.path, 'utf8'), FULL_TEXT);

    const rangeRes = await request(app)
      .get(`/download/${sessionId}/${fileId}`)
      .set('Range', 'bytes=6-');
    assert.equal(rangeRes.status, 206);
    assert.equal(rangeRes.text, 'disconnect world');

    const downloadRes = await request(app).get(`/download/${sessionId}/${fileId}`);
    assert.equal(downloadRes.status, 200);
    assert.equal(downloadRes.text, FULL_TEXT);
  });
});
