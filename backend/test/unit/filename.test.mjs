import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeFilename, contentDispositionAttachment } from '../../src/utils/filename.js';

describe('sanitizeFilename', () => {
  it('strips directory traversal', () => {
    assert.equal(sanitizeFilename('../../etc/passwd'), 'passwd');
    assert.equal(sanitizeFilename('..\\secret.txt'), 'secret.txt');
  });

  it('returns download for empty or dot names', () => {
    assert.equal(sanitizeFilename(''), 'download');
    assert.equal(sanitizeFilename('..'), 'download');
  });

  it('removes control characters', () => {
    assert.equal(sanitizeFilename('file\x00name.txt'), 'filename.txt');
  });
});

describe('contentDispositionAttachment', () => {
  it('includes safe filename and UTF-8 variant', () => {
    const header = contentDispositionAttachment('report.pdf');
    assert.match(header, /^attachment;/);
    assert.match(header, /filename="report\.pdf"/);
    assert.match(header, /filename\*=UTF-8''/);
  });
});
