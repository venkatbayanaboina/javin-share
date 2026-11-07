import { logger } from '../logger.js';

/**
 * Sender-disruption grace window.
 *
 * When the active sender leaves the send page (or cancels), receivers are
 * normally redirected away. But the browser fires beforeunload handlers even
 * when the sender is merely REFRESHING the page — without a grace window,
 * every sender refresh kicks all receivers off the receive page.
 *
 * Disruptions are therefore deferred briefly: if the sender re-enters the
 * send page within the window (refresh rejoin), the pending disruption is
 * cancelled; if they are genuinely gone, it executes.
 */
const pendingDisruptions = new Map(); // sessionId -> timer

export function scheduleSenderDisruption(sessionId, io, applyFn, delayMs = 2000) {
  cancelSenderDisruption(sessionId, 'replaced by newer disruption');

  const timer = setTimeout(() => {
    pendingDisruptions.delete(sessionId);
    try {
      applyFn();
    } catch (err) {
      logger.error(`Sender disruption for session ${sessionId} failed:`, err);
    }
  }, delayMs);
  timer.unref?.();

  pendingDisruptions.set(sessionId, timer);
  logger.info(`⏳ Sender disruption scheduled for ${sessionId} (grace ${delayMs}ms)`);
}

export function cancelSenderDisruption(sessionId, reason = 'sender returned') {
  const timer = pendingDisruptions.get(sessionId);
  if (timer) {
    clearTimeout(timer);
    pendingDisruptions.delete(sessionId);
    logger.info(`⏹ Cancelled pending sender disruption for ${sessionId} (${reason})`);
  }
}
