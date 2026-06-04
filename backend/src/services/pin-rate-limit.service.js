import { config } from '../config.js';
import { logger } from '../logger.js';

/** @type {Map<string, { failures: number, windowStart: number, lockedUntil: number }>} */
const attemptsByKey = new Map();

function bucketKey(ip, sessionId) {
  return sessionId ? `${ip}:${sessionId}` : ip;
}

function getBucket(key) {
  let bucket = attemptsByKey.get(key);
  if (!bucket) {
    bucket = { failures: 0, windowStart: Date.now(), lockedUntil: 0 };
    attemptsByKey.set(key, bucket);
  }
  return bucket;
}

export function getPinRateLimitStatus(ip, sessionId = null) {
  const key = bucketKey(ip, sessionId);
  const bucket = getBucket(key);
  const now = Date.now();

  if (bucket.lockedUntil > now) {
    return {
      blocked: true,
      retryAfterMs: bucket.lockedUntil - now,
      failures: bucket.failures,
    };
  }

  if (now - bucket.windowStart > config.pinRateWindowMs) {
    bucket.failures = 0;
    bucket.windowStart = now;
  }

  return { blocked: false, retryAfterMs: 0, failures: bucket.failures };
}

export function recordPinFailure(ip, sessionId = null) {
  const key = bucketKey(ip, sessionId);
  const bucket = getBucket(key);
  const now = Date.now();

  if (now - bucket.windowStart > config.pinRateWindowMs) {
    bucket.failures = 0;
    bucket.windowStart = now;
  }

  bucket.failures += 1;

  if (bucket.failures >= config.pinMaxAttempts) {
    bucket.lockedUntil = now + config.pinLockoutMs;
    logger.warn(`PIN rate limit: locked ${key} for ${config.pinLockoutMs}ms`);
  }
}

export function clearPinFailures(ip, sessionId = null) {
  attemptsByKey.delete(bucketKey(ip, sessionId));
}

/** @internal Test-only reset */
export function resetPinRateLimitForTests() {
  attemptsByKey.clear();
}

/** Periodic cleanup of stale buckets */
export function prunePinRateLimitStore() {
  const now = Date.now();
  const maxAge = config.pinRateWindowMs + config.pinLockoutMs;
  for (const [key, bucket] of attemptsByKey.entries()) {
    if (now - bucket.windowStart > maxAge && bucket.lockedUntil < now) {
      attemptsByKey.delete(key);
    }
  }
}
