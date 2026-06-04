import { getUrlParameter } from './url.js';
import { escapeHtml } from './escape.js';

export { escapeHtml } from './escape.js';
export { getUrlParameter } from './url.js';

const MAX_TOASTS = 4;
const DEDUPE_MS = 2500;
let lastToastKey = '';
let lastToastAt = 0;

/**
 * Normalize user-facing notification text; drop null/undefined and raw dev errors.
 * @param {unknown} message
 * @returns {string}
 */
export function normalizeNotificationMessage(message) {
  if (message == null || message === '') return '';

  if (typeof message === 'object') {
    const err = /** @type {{ message?: string }} */ (message);
    if (typeof err.message === 'string') return normalizeNotificationMessage(err.message);
    return '';
  }

  const text = String(message).trim();
  if (!text || text === 'null' || text === 'undefined') return '';

  if (/cannot read properties of null/i.test(text) || /cannot set properties of null/i.test(text)) {
    return 'Something went wrong. Please refresh the page and try again.';
  }
  if (/undefined is not an object/i.test(text) || /is not a function/i.test(text)) {
    return 'Something went wrong. Please try again.';
  }

  return text;
}

/**
 * @param {unknown} error
 * @returns {boolean}
 */
export function isTechnicalError(error) {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  if (!raw) return true;
  return /cannot read properties of null|cannot set properties of null|undefined is not an object|is not a function/i.test(
    raw,
  );
}

/**
 * Inline status strip on transfer pages (#page-status).
 * @param {string} message
 * @param {'info'|'success'|'warning'|'error'} [type]
 * @param {{ duration?: number }} [options]
 */
export function setPageStatus(message, type = 'info', { duration = 0 } = {}) {
  const el = document.getElementById('page-status');
  if (!el) return;

  const text = normalizeNotificationMessage(message);
  if (!text) {
    el.classList.add('is-hidden');
    el.textContent = '';
    el.removeAttribute('data-type');
    return;
  }

  el.classList.remove('is-hidden');
  el.dataset.type = type;
  el.textContent = text;

  if (duration > 0) {
    window.clearTimeout(el._statusTimer);
    el._statusTimer = window.setTimeout(() => setPageStatus(''), duration);
  }
}

/**
 * @param {unknown} message
 * @param {'success'|'error'|'warning'|'info'} [type]
 * @param {number} [duration]
 * @param {{ title?: string, skipDedupe?: boolean }} [options]
 */
export function showNotification(message, type = 'success', duration = 4500, options = {}) {
  const text = normalizeNotificationMessage(message);
  if (!text) return;

  const toastType = ['success', 'error', 'warning', 'info'].includes(type) ? type : 'info';
  const key = `${toastType}:${text}`;
  const now = Date.now();
  if (!options.skipDedupe && key === lastToastKey && now - lastToastAt < DEDUPE_MS) {
    return;
  }
  lastToastKey = key;
  lastToastAt = now;

  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-relevant', 'additions');
    document.body.appendChild(container);
  }

  while (container.children.length >= MAX_TOASTS) {
    container.firstElementChild?.remove();
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${toastType}`;
  toast.setAttribute('role', 'alert');

  const title = options.title ? normalizeNotificationMessage(options.title) : '';
  const titleHtml = title
    ? `<div class="toast-title">${escapeHtml(title)}</div>`
    : '';

  toast.innerHTML = `
    <span class="toast-icon" aria-hidden="true"></span>
    <div class="toast-body">
      ${titleHtml}
      <div class="toast-content">${escapeHtml(text)}</div>
    </div>
    <button class="toast-close" type="button" aria-label="Dismiss">&times;</button>
    <div class="toast-progress" aria-hidden="true">
      <div class="toast-progress-fill" style="animation-duration: ${duration}ms"></div>
    </div>
  `;

  container.appendChild(toast);

  const closeBtn = toast.querySelector('.toast-close');
  let removed = false;
  const removeToast = () => {
    if (removed) return;
    removed = true;
    toast.classList.add('toast-leaving');
    window.setTimeout(() => {
      toast.remove();
      if (container.parentNode && container.children.length === 0) {
        container.remove();
      }
    }, 280);
  };

  closeBtn?.addEventListener('click', removeToast);
  window.setTimeout(removeToast, duration);
}

export function showError(message) {
  const text = normalizeNotificationMessage(message) || 'An error occurred.';
  const container = document.querySelector('.container');
  if (container) {
    const currentPath = window.location.pathname;
    const sessionId = getUrlParameter('session');
    const role = getUrlParameter('role');
    const peerId = getUrlParameter('peerId');

    let homeButton = '';
    if (currentPath.includes('send-files.html') || currentPath.includes('receive-files.html')) {
      homeButton = `<button onclick="window.location.href='/session.html?session=${sessionId}&role=${role}&peerId=${peerId}'" class="btn btn-primary">← Back to Main</button>`;
    } else if (currentPath.includes('session.html')) {
      homeButton = role === 'host'
        ? `<button onclick="window.location.href='/?session=${sessionId}'" class="btn btn-primary">🏠 Go Home</button>`
        : `<button onclick="window.close()" class="btn btn-primary">🚪 Close</button>`;
    } else if (role === 'host') {
      homeButton = `<button onclick="location.href='/'" class="btn btn-primary">🏠 Go Home</button>`;
    }

    container.innerHTML = `
      <div class="error">
        <h2>❌ Error</h2>
        <p>${escapeHtml(text)}</p>
        ${homeButton}
        <button onclick="location.reload()" class="btn btn-secondary">🔄 Retry</button>
      </div>
    `;
  } else {
    alert('Error: ' + text);
  }
}
