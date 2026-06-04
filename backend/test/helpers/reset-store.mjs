import fs from 'fs';
import { store } from '../../src/state/store.js';
import { resetPinRateLimitForTests } from '../../src/services/pin-rate-limit.service.js';

export function resetStoreForTests() {
  store.sessions.clear();
  store.transferHistory.clear();
  store.recentTransfers.length = 0;
  store.receiverDownloadQueues.clear();
  store.receiverDownloadFlags.clear();
  store.receiverActiveDownloads.clear();
  store.currentHostSessionId = null;
  resetPinRateLimitForTests();
}

export function ensureUploadsDir(uploadsDir) {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
}

export function cleanUploadsDir(uploadsDir) {
  if (!fs.existsSync(uploadsDir)) return;
  for (const name of fs.readdirSync(uploadsDir)) {
    try {
      fs.unlinkSync(`${uploadsDir}/${name}`);
    } catch (_) {}
  }
}
