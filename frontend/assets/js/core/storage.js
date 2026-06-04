/** Allowed localStorage keys — all access should go through this module. */

export const StorageKeys = {
  PEER_ID: 'peerId',
  DEVICE_NAME: 'device_name',
  exited: (sessionId) => `exited_${sessionId}`,
};

function safeGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore quota / private mode */
  }
}

function safeRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function getPeerId() {
  let pid = safeGet(StorageKeys.PEER_ID);
  if (!pid) {
    pid = Math.random().toString(36).substring(2, 10);
    safeSet(StorageKeys.PEER_ID, pid);
  }
  return pid;
}

export function getDeviceName() {
  return safeGet(StorageKeys.DEVICE_NAME) || '';
}

export function setDeviceName(name) {
  if (name) safeSet(StorageKeys.DEVICE_NAME, name);
}

export function removeDeviceName() {
  safeRemove(StorageKeys.DEVICE_NAME);
}

export function hasExitedSession(sessionId) {
  if (!sessionId) return false;
  return safeGet(StorageKeys.exited(sessionId)) === '1';
}

export function markSessionExited(sessionId) {
  if (!sessionId) return;
  safeSet(StorageKeys.exited(sessionId), '1');
}

export function clearSessionExited(sessionId) {
  if (!sessionId) return;
  safeRemove(StorageKeys.exited(sessionId));
}

/** Remove all `exited_*` flags (e.g. host starting a fresh session). */
export function clearAllExitedFlags() {
  const keys = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('exited_')) keys.push(key);
    }
  } catch {
    return;
  }
  keys.forEach((key) => safeRemove(key));
}

export function setRejoiningSession(sessionId) {
  if (!sessionId) return;
  try {
    sessionStorage.setItem(`rejoining_${sessionId}`, '1');
  } catch {
    /* ignore */
  }
}

export function clearRejoiningSession(sessionId) {
  if (!sessionId) return;
  try {
    sessionStorage.removeItem(`rejoining_${sessionId}`);
  } catch {
    /* ignore */
  }
}
