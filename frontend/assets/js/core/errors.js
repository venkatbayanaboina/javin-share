import { showNotification, normalizeNotificationMessage, isTechnicalError } from './dom.js';
import { showConfirm } from './confirm.js';

export class ConnectionMonitor {
  constructor(socket) {
    this.socket = socket;
    this.isOnline = navigator.onLine;
    this.callbacks = [];
    this.setupListeners();
  }

  setupListeners() {
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.notifyCallbacks('online');
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.notifyCallbacks('offline');
    });

    if (this.socket) {
      this.socket.on('connect', () => this.notifyCallbacks('socket-connected'));
      this.socket.on('disconnect', () => this.notifyCallbacks('socket-disconnected'));
      this.socket.on('reconnect', () => this.notifyCallbacks('socket-reconnected'));
    }
  }

  onStatusChange(callback) {
    this.callbacks.push(callback);
  }

  notifyCallbacks(status) {
    this.callbacks.forEach((callback) => callback(status, this.isOnline));
  }

  getStatus() {
    return {
      online: this.isOnline,
      socketConnected: this.socket?.connected || false,
    };
  }
}

export class ErrorHandler {
  static handle(error, context = '', retryCallback = null) {
    console.error(`Error in ${context}:`, error);

    let userMessage = 'An unexpected error occurred.';
    let canRetry = false;

    if (error.name === 'NetworkError' || error.message?.includes('fetch')) {
      userMessage = 'Network error. Please check your connection.';
      canRetry = true;
    } else if (error.name === 'AbortError') {
      userMessage = 'Operation was cancelled.';
    } else if (error.message?.includes('File too large')) {
      userMessage = error.message;
    } else if (error.message?.includes('Session')) {
      userMessage = 'Session expired or invalid. Please reconnect.';
    } else if (error.message) {
      userMessage = error.message;
    }

    if (isTechnicalError(error)) {
      console.warn(`[${context}] Suppressed technical error toast`);
      return;
    }

    userMessage = normalizeNotificationMessage(userMessage);
    if (!userMessage) return;

    showNotification(userMessage, 'error', 5000);

    if (canRetry && retryCallback) {
      setTimeout(async () => {
        const ok = await showConfirm({
          title: 'Retry?',
          message: `${userMessage}\n\nWould you like to retry?`,
          confirmLabel: 'Retry',
          cancelLabel: 'Cancel',
        });
        if (ok) retryCallback();
      }, 1000);
    }
  }
}

export class ProgressTracker {
  constructor() {
    this.reset();
  }

  reset() {
    this.startTime = null;
    this.lastUpdate = null;
    this.totalBytes = 0;
    this.transferredBytes = 0;
    this.speed = 0;
    this.eta = 0;
  }

  start(totalBytes) {
    this.startTime = Date.now();
    this.lastUpdate = this.startTime;
    this.totalBytes = totalBytes;
    this.transferredBytes = 0;
  }

  update(transferredBytes) {
    const now = Date.now();
    this.transferredBytes = transferredBytes;

    if (this.lastUpdate && now - this.lastUpdate > 0) {
      const timeDiff = (now - this.startTime) / 1000;
      this.speed = transferredBytes / timeDiff;
      this.eta = (this.totalBytes - transferredBytes) / this.speed;
    }

    this.lastUpdate = now;

    return {
      progress: (transferredBytes / this.totalBytes) * 100,
      speed: this.speed,
      eta: this.eta,
      transferred: transferredBytes,
      total: this.totalBytes,
    };
  }

  getStats() {
    return {
      progress: (this.transferredBytes / this.totalBytes) * 100,
      speed: this.speed,
      eta: this.eta,
      transferred: this.transferredBytes,
      total: this.totalBytes,
      elapsed: this.startTime ? (Date.now() - this.startTime) / 1000 : 0,
    };
  }
}
