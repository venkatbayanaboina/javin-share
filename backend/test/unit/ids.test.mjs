import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isSafeId } from '../../src/utils/ids.js';

describe('isSafeId', () => {
  it('accepts alphanumeric ids', () => {
    assert.equal(isSafeId('abc123'), true);
    assert.equal(isSafeId('peer1-1700000000'), true);
  });

  it('rejects path-like or empty values', () => {
    assert.equal(isSafeId(''), false);
    assert.equal(isSafeId('../x'), false);
    assert.equal(isSafeId('a'.repeat(65)), false);
  });
});
