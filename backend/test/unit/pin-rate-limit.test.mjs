import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  getPinRateLimitStatus,
  recordPinFailure,
  clearPinFailures,
  resetPinRateLimitForTests,
} from '../../src/services/pin-rate-limit.service.js';

describe('pin-rate-limit.service', () => {
  beforeEach(() => {
    resetPinRateLimitForTests();
  });

  it('blocks after max failures', () => {
    const ip = '192.168.1.10';
    const sessionId = 'sess1234567';

    for (let i = 0; i < 8; i++) {
      recordPinFailure(ip, sessionId);
    }

    const status = getPinRateLimitStatus(ip, sessionId);
    assert.equal(status.blocked, true);
    assert.ok(status.retryAfterMs > 0);
  });

  it('clears failures on success path', () => {
    const ip = '10.0.0.2';
    recordPinFailure(ip, null);
    clearPinFailures(ip, null);
    assert.equal(getPinRateLimitStatus(ip, null).blocked, false);
  });
});
