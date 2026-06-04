import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createTestApp } from '../helpers/test-app.mjs';

describe('GET /api/v1/health', () => {
  it('returns ok and version', async () => {
    const { app } = createTestApp();
    const res = await request(app).get('/api/v1/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
    assert.ok(res.body.version);
  });
});
