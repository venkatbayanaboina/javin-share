import '../core/index.js';
import {
  getPeerId,
  getDeviceName,
  setDeviceName,
  clearSessionExited,
  setRejoiningSession,
  getUrlParameter,
  showError,
  showNotification,
  escapeHtml,
  formatFileSize,
  formatTime,
  formatSpeed,
  validateFile,
  getDeviceInfo,
  ErrorHandler,
  ProgressTracker,
} from '../core/index.js';
import { mountPinCountdown } from '../core/grace-timer.js';

// PIN entry logic for both QR and manual entry
const pinForm = document.getElementById('pin-form');
const pinInput = document.getElementById('pin-input');
const deviceNameInput = document.getElementById('device-name-input');
const connectBtn = document.getElementById('connect-btn');
const errorDisplay = document.getElementById('error-message');
const statusDisplay = document.getElementById('status-message');
const headerDescription = document.getElementById('header-description');
let pinCountdownController = null;
let isConnecting = false;
let currentSessionId = null;

const digitInputs = Array.from(document.querySelectorAll('.pin-digit'));

function setInputsDisabled(disabled) {
  deviceNameInput.disabled = disabled;
  connectBtn.disabled = disabled;
  digitInputs.forEach(inp => inp.disabled = disabled);
}

const savedDeviceName = getDeviceName();
if (savedDeviceName) {
  deviceNameInput.value = savedDeviceName;
}

function showFormError(message) {
  errorDisplay.textContent = message;
  errorDisplay.style.display = 'block';
  statusDisplay.style.display = 'none';
}

function showStatus(message) {
  statusDisplay.textContent = message;
  statusDisplay.style.display = 'block';
  errorDisplay.style.display = 'none';
}

// Popup message functions
function showPopupMessage(title, message, type = 'info') {
  console.log('showPopupMessage:', { title, message, type });
  const popup = document.getElementById('popupMessage');
  const popupTitle = document.getElementById('popupTitle');
  const popupBody = document.getElementById('popupBody');
  
  if (!popup || !popupTitle || !popupBody) return;
  
  popupTitle.textContent = title;
  popupBody.textContent = message;
  popup.className = `modal-overlay popup-message popup-${type}`;
  popup.style.display = 'flex';
}

function updatePopupMessage(title, message, type = 'info') {
  console.log('updatePopupMessage:', { title, message, type });
  const popup = document.getElementById('popupMessage');
  const popupTitle = document.getElementById('popupTitle');
  const popupBody = document.getElementById('popupBody');
  
  if (!popup || !popupTitle || !popupBody) return;
  
  popupTitle.textContent = title;
  popupBody.textContent = message;
  popup.className = `modal-overlay popup-message popup-${type}`;
}

function hidePopupMessage() {
  const popup = document.getElementById('popupMessage');
  if (popup) {
    popup.style.display = 'none';
    popup.className = 'modal-overlay is-hidden';
  }
}

// Check if this is QR-based access (has session ID in URL)
const urlSessionId = getUrlParameter('session');
const isQRBased = !!urlSessionId;
const peerId = getUrlParameter('peerId');
const role = getUrlParameter('role');

// If we have a peerId, notify server that we're on PIN page (browser back scenario)
if (peerId && role === 'client' && urlSessionId) {
  console.log('PIN page: Browser back, notifying server');
  const pinSocket = io({ transports: ['websocket'] });
  pinSocket.on('connect', () => {
    pinSocket.emit('enter-pin-page', { sessionId: urlSessionId, peerId: peerId });
    setTimeout(() => pinSocket.disconnect(), 1000);
  });
}

if (isQRBased) {
  currentSessionId = urlSessionId;
  headerDescription.textContent = 'Enter the PIN displayed on the host screen.';
  clearSessionExited(urlSessionId);
  fetchSessionDetails(urlSessionId);
} else {
  headerDescription.textContent = 'Enter the 6-digit PIN provided by the host.';
  startPinTimerForManualEntry();
}

function onPinExpired(message) {
  const timerEl = document.getElementById('pin-timer');
  if (timerEl) timerEl.textContent = 'PIN expired!';
  showFormError(message);
  setInputsDisabled(true);
}

async function startPinTimerForManualEntry() {
  try {
    const response = await fetch('/api/get-pin-expiry');
    if (response.ok) {
      const data = await response.json();
      currentSessionId = data.sessionId;
      startPinTimer(data.pinExpiry);
    }
  } catch (err) {
    console.error('Failed to get PIN expiry:', err);
    startPinTimer(Date.now() + 5 * 60 * 1000);
  }
}

async function fetchSessionDetails(sessionId) {
  try {
    const response = await fetch('/api/session-details/' + sessionId);
    if (!response.ok) throw new Error('Session not found.');
    const data = await response.json();
    startPinTimer(data.pinExpiry);
  } catch (err) {
    showFormError("SESSION KEY EXPIRED / REQUEST NEW SESSION");
    setInputsDisabled(true);
  }
}

function startPinTimer(pinExpiryMs) {
  pinCountdownController?.stop();
  const timerEl = document.getElementById('pin-timer');
  pinCountdownController = mountPinCountdown({
    pinExpiryMs,
    labelEl: timerEl,
    labelPrefix: 'Time left:',
    onExpired: () =>
      onPinExpired(
        isQRBased
          ? 'SESSION KEY EXPIRED. Please scan a new QR code.'
          : 'SESSION KEY EXPIRED. Please get a new PIN from the host.',
      ),
  });
}

async function attemptConnection() {
  if (isConnecting) return;
  
  const pin = pinInput.value.trim();
  const deviceName = (deviceNameInput.value || '').trim();
  
  if (!deviceName) {
    showFormError('Please enter your device name');
    deviceNameInput.focus();
    return;
  }
  
  if (pin.length !== 6) {
    showFormError('Please enter exactly 6 digits');
    digitInputs.find(i => !i.value)?.focus();
    return;
  }
  
  errorDisplay.style.display = 'none';
  setInputsDisabled(true);
  connectBtn.textContent = '[ VERIFYING SESSION... ]';
  isConnecting = true;

  try {
    let sessionData;
    let response;
    
    if (isQRBased) {
      response = await fetch('/api/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: currentSessionId, pin }),
      });
      sessionData = await response.json().catch(() => ({}));
    } else {
      response = await fetch('/api/find-session-by-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      sessionData = await response.json().catch(() => ({}));
      if (response.ok && sessionData.success) {
        currentSessionId = sessionData.sessionId;
      }
    }

    if (response.status === 429) {
      const retrySec = sessionData.retryAfterSeconds || 60;
      showFormError(`Too many attempts. Wait ${retrySec}s.`);
      isConnecting = false;
      setInputsDisabled(false);
      connectBtn.textContent = '[ CONNECT ]';
      return;
    }

    if (response.ok && sessionData.success) {
      setDeviceName(deviceName);
      clearSessionExited(currentSessionId);
      setRejoiningSession(currentSessionId);
      
      showPopupMessage('✓ VERIFIED', 'JOINING NETWORK...', 'success');
      
      const socket = io({ transports: ['websocket'] });
      let joinTimeout;
      
      joinTimeout = setTimeout(() => {
        showFormError('Connection timeout. Please try again.');
        isConnecting = false;
        setInputsDisabled(false);
        connectBtn.textContent = '[ CONNECT ]';
        hidePopupMessage();
        socket.disconnect();
      }, 10000);
      
      socket.on('connect', () => {
        console.log('Socket connected, joining session...');
        const peerId = getPeerId();
        socket.emit('client-has-verified', { sessionId: currentSessionId });
        
        socket.on('session-joined', (joinData) => {
          clearTimeout(joinTimeout);
          updatePopupMessage('✓ VERIFIED', 'INITIALIZING NETWORK CONDUIT...', 'success');
          
          setTimeout(() => {
            window.location.href = '/session.html?session=' + currentSessionId + '&role=client&peerId=' + peerId;
          }, 2000);
        });
        
        socket.on('join-error', (error) => {
          clearTimeout(joinTimeout);
          showFormError(error.message || 'Failed to join session');
          isConnecting = false;
          setInputsDisabled(false);
          connectBtn.textContent = '[ CONNECT ]';
          hidePopupMessage();
          socket.disconnect();
        });
      });
      
      socket.on('connect_error', () => {
        clearTimeout(joinTimeout);
        showFormError('Connection failed. Please try again.');
        isConnecting = false;
        setInputsDisabled(false);
        connectBtn.textContent = '[ CONNECT ]';
        hidePopupMessage();
      });
    } else {
      showFormError(sessionData.error || 'Invalid PIN. Please check and try again.');
      digitInputs.forEach(inp => inp.value = '');
      pinInput.value = '';
      digitInputs[0].focus();
      isConnecting = false;
      setInputsDisabled(false);
      connectBtn.textContent = '[ CONNECT ]';
    }
  } catch (err) {
    console.error('Connection error:', err);
    if (isConnecting) {
      showFormError('Network error. Could not connect.');
      isConnecting = false;
      setInputsDisabled(false);
      connectBtn.textContent = '[ CONNECT ]';
    }
  }
}

pinForm.addEventListener('submit', (e) => {
  e.preventDefault();
  attemptConnection();
});

pinInput.addEventListener('input', () => {
  const pin = pinInput.value;
  errorDisplay.style.display = 'none';
  
  if (pin.length === 6) {
    if (!/^\d{6}$/.test(pin)) {
      showFormError('PIN must contain only numbers');
      return;
    }
    if (!isConnecting) {
      setTimeout(() => {
        if (!isConnecting) attemptConnection();
      }, 100);
    }
  }
});

// digit-by-digit pin input handling
digitInputs.forEach((input, index) => {
  // Focus auto advance
  input.addEventListener('input', () => {
    const val = input.value.trim();
    if (val && !/^\d$/.test(val)) {
      input.value = '';
      return;
    }
    updateHiddenPin();
    if (val && index < 5) {
      digitInputs[index + 1].focus();
    }
  });
  
  // Auto-backspace focus backward shifting
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace') {
      if (!input.value && index > 0) {
        digitInputs[index - 1].value = '';
        digitInputs[index - 1].focus();
        updateHiddenPin();
      } else {
        input.value = '';
        updateHiddenPin();
      }
      e.preventDefault();
    }
  });

  // Handle paste of full PIN
  input.addEventListener('paste', (e) => {
    const pasteData = (e.clipboardData || window.clipboardData).getData('text').trim();
    if (/^\d{6}$/.test(pasteData)) {
      for (let i = 0; i < 6; i++) {
        digitInputs[i].value = pasteData[i];
      }
      updateHiddenPin();
      attemptConnection();
      e.preventDefault();
    }
  });
});

function updateHiddenPin() {
  const pin = digitInputs.map(inp => inp.value).join('');
  pinInput.value = pin;
  pinInput.dispatchEvent(new Event('input'));
}

// Focus on first input digit when page loads
window.addEventListener('load', () => {
  digitInputs[0].focus();
});

// Setup popup close button
const popupClose = document.getElementById('popupClose');
if (popupClose) {
  popupClose.addEventListener('click', () => {
    hidePopupMessage();
  });
}
