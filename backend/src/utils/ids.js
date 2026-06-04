const SAFE_ID = /^[a-zA-Z0-9_-]{1,64}$/;

export function isSafeId(value) {
  return typeof value === 'string' && SAFE_ID.test(value);
}
