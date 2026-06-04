import path from 'path';

const MAX_FILENAME_LENGTH = 255;

/**
 * Safe basename for storage and Content-Disposition (no path segments or control chars).
 */
export function sanitizeFilename(name) {
  if (!name || typeof name !== 'string') return 'download';

  let base = path.basename(name.replace(/\\/g, '/'));
  // eslint-disable-next-line no-control-regex -- strip control chars from untrusted names
  base = base.replace(/[\x00-\x1f\x7f]/g, '').trim();
  if (!base || base === '.' || base === '..') return 'download';
  if (base.length > MAX_FILENAME_LENGTH) {
    const ext = path.extname(base);
    const stem = base.slice(0, MAX_FILENAME_LENGTH - ext.length);
    base = `${stem}${ext}`;
  }
  return base;
}

/** RFC 5987 filename* for Content-Disposition. */
export function contentDispositionAttachment(filename) {
  const safe = sanitizeFilename(filename);
  const encoded = encodeURIComponent(safe).replace(/['()]/g, escape);
  return `attachment; filename="${safe.replace(/"/g, '\\"')}"; filename*=UTF-8''${encoded}`;
}
