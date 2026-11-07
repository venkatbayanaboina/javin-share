export const store = {
  sessions: new Map(),
  transferHistory: new Map(),
  recentTransfers: [],
  receiverDownloadQueues: new Map(),
  receiverActiveDownloads: new Map(),
  currentHostSessionId: null,
  localIP: '127.0.0.1',
};

const MAX_RECENT_TRANSFERS = 100;

/**
 * Append to recentTransfers with a hard cap, so the list cannot grow
 * unbounded across long-running server lifetimes.
 */
export function pushRecentTransfer(entry) {
  store.recentTransfers.push(entry);
  if (store.recentTransfers.length > MAX_RECENT_TRANSFERS) {
    store.recentTransfers.splice(0, store.recentTransfers.length - MAX_RECENT_TRANSFERS);
  }
}

export function setCurrentHostSessionId(sessionId) {
  store.currentHostSessionId = sessionId;
}
