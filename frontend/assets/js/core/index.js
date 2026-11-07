import {
  getPeerId,
  getDeviceName,
  setDeviceName,
  removeDeviceName,
  hasExitedSession,
  markSessionExited,
  clearSessionExited,
  clearAllExitedFlags,
  setRejoiningSession,
} from './storage.js';
import { formatFileSize, formatTime, formatSpeed } from './format.js';
import { getUrlParameter } from './url.js';
import {
  escapeHtml,
  showNotification,
  showError,
  setPageStatus,
  normalizeNotificationMessage,
  isTechnicalError,
} from './dom.js';
import { validateFile } from './validation.js';
import { getDeviceInfo } from './device.js';
import { ConnectionMonitor, ErrorHandler, ProgressTracker } from './errors.js';
import { initPinPageSocket } from '../socket/client.js';

export {
  getPeerId,
  getDeviceName,
  setDeviceName,
  removeDeviceName,
  hasExitedSession,
  markSessionExited,
  clearSessionExited,
  clearAllExitedFlags,
  setRejoiningSession,
  formatFileSize,
  formatTime,
  formatSpeed,
  getUrlParameter,
  escapeHtml,
  showNotification,
  showError,
  setPageStatus,
  normalizeNotificationMessage,
  validateFile,
  getDeviceInfo,
  ConnectionMonitor,
  ErrorHandler,
  ProgressTracker,
};

export const FileShareUtils = {
  getPeerId,
  getDeviceName,
  setDeviceName,
  removeDeviceName,
  hasExitedSession,
  markSessionExited,
  clearSessionExited,
  formatFileSize,
  formatTime,
  formatSpeed,
  validateFile,
  showNotification,
  showError,
  setPageStatus,
  normalizeNotificationMessage,
  escapeHtml,
  getUrlParameter,
  ConnectionMonitor,
  ErrorHandler,
  ProgressTracker,
  getDeviceInfo,
};

window.FileShareUtils = FileShareUtils;

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  if (!isTechnicalError(event.reason)) {
    ErrorHandler.handle(event.reason, 'Unhandled Promise');
  }
  event.preventDefault();
});

window.addEventListener('error', (event) => {
  console.error('Global JavaScript error:', event.error || event.message);
  const err = event.error || event.message;
  if (!isTechnicalError(err)) {
    ErrorHandler.handle(err, 'Global Error');
  }
});

document.addEventListener('DOMContentLoaded', () => {
  // Theme Toggle Button Logic
  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    const updateThemeColorMeta = (isLight) => {
      // Keep the browser chrome color in sync with the canvas
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', isLight ? '#eef2f9' : '#070d1a');
    };
    const updateToggleIcon = () => {
      const isLight = document.documentElement.classList.contains('light-theme');
      themeToggle.innerHTML = isLight
        ? '<svg class="icon"><use href="assets/icons.svg#moon"></use></svg>'
        : '<svg class="icon"><use href="assets/icons.svg#sun"></use></svg>';
      themeToggle.title = isLight ? 'Switch to dark mode' : 'Switch to light mode';
      themeToggle.setAttribute('aria-label', themeToggle.title);
      updateThemeColorMeta(isLight);
    };
    updateToggleIcon();
    themeToggle.addEventListener('click', () => {
      const isLight = document.documentElement.classList.toggle('light-theme');
      localStorage.setItem('theme', isLight ? 'light' : 'dark');
      updateToggleIcon();
    });
  }
  if (window.location.pathname.includes('pin')) {
    initPinPageSocket();
  }

  // Register PWA Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => {
        console.log('[PWA] Service Worker registered under scope:', reg.scope);
      })
      .catch((err) => {
        console.error('[PWA] Service Worker registration failed:', err);
      });
  }
});
