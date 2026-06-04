export const store = {
  sessions: new Map(),
  transferHistory: new Map(),
  recentTransfers: [],
  receiverDownloadQueues: new Map(),
  receiverDownloadFlags: new Map(),
  receiverActiveDownloads: new Map(),
  currentHostSessionId: null,
  localIP: '127.0.0.1',
};

export function getSession(sessionId) {
  return store.sessions.get(sessionId);
}

export function setCurrentHostSessionId(sessionId) {
  store.currentHostSessionId = sessionId;
}

export function getCurrentHostSessionId() {
  return store.currentHostSessionId;
}
