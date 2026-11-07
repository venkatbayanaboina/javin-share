/**
 * Screen Wake Lock — keeps the display (and the JS timers driving transfer
 * progress) active during long transfers. Background tabs get throttled by
 * the browser, which stalls chunked uploads/downloads on phones.
 *
 * No-op where the API is unsupported (e.g. Firefox) or the page is hidden.
 * The browser releases the lock automatically on tab close/navigation.
 */
let sentinel = null;

async function acquire() {
  if (!('wakeLock' in navigator) || sentinel) return;
  try {
    sentinel = await navigator.wakeLock.request('screen');
    sentinel.addEventListener('release', () => {
      sentinel = null;
    });
  } catch (_) {
    // Denied or unsupported — transfers still work, just possibly throttled.
  }
}

document.addEventListener('visibilitychange', () => {
  // The lock is implicitly released when the tab is hidden; re-acquire.
  if (document.visibilityState === 'visible') acquire();
});

export function keepAwake() {
  acquire();
}
