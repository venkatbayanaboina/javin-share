/**
 * Server-authoritative countdown UI (no localStorage).
 */

function resolveGraceEndMs(data) {
  if (typeof data?.graceEndMs === 'number' && Number.isFinite(data.graceEndMs)) {
    return data.graceEndMs;
  }
  const seconds = Number(data?.durationSeconds);
  if (Number.isFinite(seconds) && seconds > 0) {
    return Date.now() + seconds * 1000;
  }
  return null;
}

/**
 * @param {{ graceEndMs?: number, durationSeconds?: number, sessionId?: string, labelEl?: HTMLElement, panelEl?: HTMLElement, onExpired?: () => void }} options
 * @returns {{ stop: () => void, graceEndMs: number } | null}
 */
export function mountGraceCountdown(options) {
  const { labelEl, panelEl, onExpired } = options;
  const graceEndMs = resolveGraceEndMs(options);
  if (!graceEndMs || !labelEl) return null;

  if (panelEl) panelEl.style.display = 'flex';

  const tick = () => {
    const remainingMs = Math.max(0, graceEndMs - Date.now());
    const secondsTotal = Math.ceil(remainingMs / 1000);
    const m = Math.floor(secondsTotal / 60);
    const s = secondsTotal % 60;
    labelEl.textContent = remainingMs > 0 ? `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : '00:00';
    if (remainingMs <= 0) {
      stop();
      onExpired?.();
    }
  };

  tick();
  const intervalId = setInterval(tick, 250);

  function stop() {
    clearInterval(intervalId);
    if (panelEl) panelEl.style.display = 'none';
  }

  return { stop, graceEndMs };
}

/**
 * PIN expiry countdown from server timestamp.
 * @param {{ pinExpiryMs: number, labelEl?: HTMLElement, onExpired?: () => void }} options
 * @returns {{ stop: () => void } | null}
 */
export function mountPinCountdown({ pinExpiryMs, labelEl, onExpired, labelPrefix = 'PIN expires in' }) {
  if (!pinExpiryMs || !labelEl) return null;

  const tick = () => {
    const remainingMs = Math.max(0, pinExpiryMs - Date.now());
    const minutes = Math.floor(remainingMs / 60000);
    const seconds = Math.floor((remainingMs % 60000) / 1000);
    labelEl.textContent =
      remainingMs > 0
        ? `${labelPrefix} ${minutes}:${String(seconds).padStart(2, '0')}`
        : 'PIN expired';
    if (remainingMs <= 0) {
      stop();
      onExpired?.();
    }
  };

  tick();
  const intervalId = setInterval(tick, 1000);

  function stop() {
    clearInterval(intervalId);
  }

  return { stop };
}

/**
 * Restore grace UI after host page refresh using session-details API.
 */
export async function syncGraceFromApi(sessionId, mountOptions) {
  if (!sessionId) return null;
  try {
    const res = await fetch(`/api/session-details/${sessionId}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.grace?.active || !data.grace.graceEndMs) return null;
    return mountGraceCountdown({
      graceEndMs: data.grace.graceEndMs,
      sessionId,
      ...mountOptions,
    });
  } catch {
    return null;
  }
}
