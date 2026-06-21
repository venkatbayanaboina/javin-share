import '../core/index.js';
import {
  getPeerId,
  getDeviceName,
  getUrlParameter,
  showError,
  showNotification,
  setPageStatus,
  escapeHtml,
  formatFileSize,
  formatTime,
  formatSpeed,
  ProgressTracker,
} from '../core/index.js';
import { registerNavigateListener } from '../core/navigate.js';

let sessionId;
let role;
let peerId;
let sendSocket;
let selectedFile = null;
let selectedQueue = [];
let currentFileId = null;
let isRequesting = false;
let receiversCount = 0;
let consoleBody = null;
let knownPeers = new Map();

document.addEventListener('DOMContentLoaded', async () => {
  if (!window.FileShareUtils) {
    document.body.innerHTML = `<div class='container'><div class='error'><h2>Critical Error</h2><p>Core scripts failed to load.</p></div></div>`;
    return;
  }

  sessionId = getUrlParameter("session");
  role = getUrlParameter("role");
  peerId = getPeerId();

  if (!sessionId || !role) {
    document.body.innerHTML = `
      <div class="wrap" style="display: flex; align-items: center; justify-content: center; min-height: 100vh; box-sizing: border-box; padding: 20px;">
        <div class="card card-accent-rose" style="max-width: 440px; width: 100%; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 18px; padding: 36px 28px; box-sizing: border-box;">
          <div style="font-size: 2.2rem; width: 64px; height: 64px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: rgba(244,63,94,0.12); border: 1px solid rgba(244,63,94,0.28); margin-bottom: 6px; animation: orb-pulse 2.6s ease-in-out infinite;">⚠️</div>
          <h2 style="font-family: var(--font-sans); font-size: 1.4rem; font-weight: 700; color: var(--text-primary); margin: 0; letter-spacing: -0.01em;">Invalid Access</h2>
          <p style="font-family: var(--font-sans); font-size: 0.9rem; color: var(--sub); margin: 0; line-height: 1.5;">Required session parameters are missing.</p>
          <button onclick="window.location.href='/'" class="btn-primary" style="width: 100%; height: 46px; font-size: 0.95rem; font-weight: 700; margin-top: 8px;" type="button">Return to Main</button>
        </div>
      </div>
    `;
    return;
  }

  try {
    const res = await fetch(`/api/session-details/${sessionId}`);
    if (!res.ok) {
      document.body.innerHTML = `
        <div class="wrap" style="display: flex; align-items: center; justify-content: center; min-height: 100vh; box-sizing: border-box; padding: 20px;">
          <div class="card card-accent-rose" style="max-width: 440px; width: 100%; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 18px; padding: 36px 28px; box-sizing: border-box;">
            <div style="font-size: 2.2rem; width: 64px; height: 64px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: rgba(244,63,94,0.12); border: 1px solid rgba(244,63,94,0.28); margin-bottom: 6px; animation: orb-pulse 2.6s ease-in-out infinite;">⚠️</div>
            <h2 style="font-family: var(--font-sans); font-size: 1.4rem; font-weight: 700; color: var(--text-primary); margin: 0; letter-spacing: -0.01em;">Session Expired</h2>
            <p style="font-family: var(--font-sans); font-size: 0.9rem; color: var(--sub); margin: 0; line-height: 1.5;">This session has expired or is no longer available.</p>
            <button onclick="window.location.href='/'" class="btn-primary" style="width: 100%; height: 46px; font-size: 0.95rem; font-weight: 700; margin-top: 8px;" type="button">Return to Main</button>
          </div>
        </div>
      `;
      return;
    }
  } catch (err) {
    console.error('Session details check failed:', err);
    document.body.innerHTML = `
      <div class="wrap" style="display: flex; align-items: center; justify-content: center; min-height: 100vh; box-sizing: border-box; padding: 20px;">
        <div class="card card-accent-rose" style="max-width: 440px; width: 100%; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 18px; padding: 36px 28px; box-sizing: border-box;">
          <div style="font-size: 2.2rem; width: 64px; height: 64px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: rgba(244,63,94,0.12); border: 1px solid rgba(244,63,94,0.28); margin-bottom: 6px; animation: orb-pulse 2.6s ease-in-out infinite;">⚠️</div>
          <h2 style="font-family: var(--font-sans); font-size: 1.4rem; font-weight: 700; color: var(--text-primary); margin: 0; letter-spacing: -0.01em;">Connection Error</h2>
          <p style="font-family: var(--font-sans); font-size: 0.9rem; color: var(--sub); margin: 0; line-height: 1.5;">Unable to connect to the session. Please check your network.</p>
          <button onclick="window.location.href='/'" class="btn-primary" style="width: 100%; height: 46px; font-size: 0.95rem; font-weight: 700; margin-top: 8px;" type="button">Return to Main</button>
        </div>
      </div>
    `;
    return;
  }

  document.getElementById("sessionId").textContent = sessionId;

  // Collapsible Console
  const toggleConsoleBtn = document.getElementById('toggle-console-btn');
  consoleBody = document.getElementById('console-body');
  const toggleConsoleText = document.getElementById('toggle-console-text');

  if (toggleConsoleBtn && consoleBody) {
    toggleConsoleBtn.addEventListener('click', () => {
      const isHidden = consoleBody.style.display === 'none';
      consoleBody.style.display = isHidden ? 'block' : 'none';
      toggleConsoleText.textContent = isHidden ? '[ HIDE ]' : '[ SHOW ]';
    });
  }

  document.getElementById("fileDropZone").addEventListener("click", () => document.getElementById("fileInput").click());
  document.getElementById("fileInput").addEventListener("change", (e) => {
    if (!e.target.files.length) return;
    const newFiles = Array.from(e.target.files);
    selectedQueue = [...selectedQueue, ...newFiles];
    selectedFile = selectedQueue[0] || null;
    renderSelectedList();
  });

  const dropZone = document.getElementById("fileDropZone");
  ['dragenter','dragover','dragleave','drop'].forEach(evt => {
    window.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); });
    dropZone.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); });
  });
  ['dragenter','dragover'].forEach(evt => {
    dropZone.addEventListener(evt, () => { dropZone.classList.add('drag-over'); });
  });
  ['dragleave','drop'].forEach(evt => {
    dropZone.addEventListener(evt, () => { dropZone.classList.remove('drag-over'); });
  });
  dropZone.addEventListener('dragover', (e) => { if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; });
  dropZone.addEventListener('drop', (e) => {
    const files = Array.from(e.dataTransfer?.files || []);
    if (!files.length) return;
    selectedQueue = [...selectedQueue, ...files];
    selectedFile = selectedQueue[0] || null;
    renderSelectedList();
  });

  document.getElementById("sendBtn").addEventListener("click", requestToSendFile);

  document.getElementById('back-btn')?.addEventListener('click', goBack);
  document.getElementById('back-btn-alt')?.addEventListener('click', goBack);

  try {
    window.history.pushState(null, null, window.location.href);
  } catch (e) {}
  
  window.addEventListener('popstate', function (event) {
    if (sendSocket && sendSocket.connected) {
      sendSocket.emit('leave-send-page', { sessionId, peerId });
      sendSocket.emit('cancel-transfer', { sessionId });
    }
    event.preventDefault();
    alert('⚠️ Redirecting to console.');
    setTimeout(() => {
      window.location.href = `/session.html?session=${sessionId}&role=${role}&peerId=${peerId}`;
    }, 100);
  }, true);
  
  window.addEventListener('beforeunload', function () {
    if (sendSocket && sendSocket.connected) {
      sendSocket.emit('leave-send-page', { sessionId, peerId });
      sendSocket.emit('cancel-transfer', { sessionId });
    }
  });

  setupSocket();
});



function logToConsole(message, type = 'info') {
  if (!consoleBody) return;
  const time = new Date().toTimeString().split(' ')[0];
  const colorMap = {
    info: 'var(--color-brand-primary)',
    success: 'var(--color-brand-success)',
    warning: 'var(--color-brand-warning)',
    error: 'var(--color-brand-danger)'
  };
  const color = colorMap[type] || 'var(--color-text-primary)';
  const logRow = document.createElement('div');
  logRow.style.color = color;
  logRow.innerHTML = `<span style="color: var(--color-text-muted);">[${time}]</span> ${escapeHtml(message)}`;
  consoleBody.appendChild(logRow);
  consoleBody.scrollTop = consoleBody.scrollHeight;
}

// State display management
function setPageState(state) {
  const dropZone = document.getElementById('fileDropZone');
  const stagedSection = document.getElementById('staged-section');
  const responseTimer = document.getElementById('response-timer');
  const uploadSection = document.getElementById('upload-section');
  
  if (state === 1) {
    if (dropZone) dropZone.style.display = 'block';
    if (stagedSection) stagedSection.classList.add('is-hidden');
    if (responseTimer) responseTimer.style.display = 'none';
    if (uploadSection) uploadSection.style.display = 'none';
    clearReceiverProgress();
  } else if (state === 2) {
    if (dropZone) dropZone.style.display = 'block';
    if (stagedSection) stagedSection.classList.remove('is-hidden');
    if (responseTimer) responseTimer.style.display = 'none';
    if (uploadSection) uploadSection.style.display = 'none';
    clearReceiverProgress();
  } else if (state === 3) {
    if (dropZone) dropZone.style.display = 'none';
    if (stagedSection) stagedSection.classList.add('is-hidden');
    if (responseTimer) responseTimer.style.display = 'block';
    if (uploadSection) uploadSection.style.display = 'none';
  } else if (state === 4 || state === 5) {
    if (dropZone) dropZone.style.display = 'none';
    if (stagedSection) stagedSection.classList.add('is-hidden');
    if (responseTimer) responseTimer.style.display = 'none';
    if (uploadSection) uploadSection.style.display = 'block';
  }
}

function clearReceiverProgress() {
  if (window.peerProgressStates) {
    window.peerProgressStates = null;
  }
  const progressSec = document.getElementById('receiver-progress-section');
  if (progressSec) progressSec.classList.add('is-hidden');
  const listEl = document.getElementById('peer-progress-list');
  if (listEl) listEl.innerHTML = '';
}

function updateSendButtonState() {
  const sendBtn = document.getElementById("sendBtn");
  if (!sendBtn) return;

  if (isRequesting) {
    sendBtn.disabled = true;
    sendBtn.textContent = '[ ACQUIRING CONDUIT LOCK... ]';
  } else if (receiversCount === 0) {
    sendBtn.disabled = true;
    sendBtn.textContent = '[ NO RECEIVERS DETECTED ]';
  } else if (!selectedFile) {
    sendBtn.disabled = true;
    sendBtn.textContent = '[ SELECT A FILE TO SEND ]';
  } else {
    sendBtn.disabled = false;
    sendBtn.textContent = '[ EXECUTE_TRANSMISSION ]';
  }
}

function setupSocket() {
  sendSocket = io({ query: { page: 'send' }, transports: ['websocket'] });

  registerNavigateListener(sendSocket, {
    beforeNavigate: (data) => {
      const to = data?.to || '';
      if (sendSocket?.connected && !to.includes('send-files') && !to.includes('receive-files')) {
        sendSocket.emit('leave-send-page', { sessionId, peerId });
      }
    },
    onSamePage: (data) => {
      if (data?.message) setPageStatus(data.message, 'warning', { duration: 6000 });
    },
  });

  sendSocket.on("connect", () => {
    logToConsole('ESTABLISHED SOCKET CONNECTION TO SIGNAL SERVER', 'success');
    const deviceName = getDeviceName();
    sendSocket.emit("join-session", { sessionId, role, peerId, deviceName });
    setTimeout(() => {
      sendSocket.emit("enter-send-page", { sessionId, peerId });
    }, 100);
  });

  sendSocket.on("session-joined", (data) => {
    logToConsole(`SUCCESSFULLY JOINED CHANNEL: ${data.sessionId}`, 'info');
  });

  sendSocket.on("peers-updated", (peers) => {
    const others = peers.filter(p => p.peerId !== peerId);
    receiversCount = others.length;
    
    // Cache peer device names
    peers.forEach(p => {
      knownPeers.set(p.peerId, p.deviceName || 'Client Node');
    });

    document.getElementById("devicesStatus").textContent = `CONNECTED NODES: ${receiversCount} ONLINE`;
    
    updateSendButtonState();
    
    const noRecv = document.getElementById('no-receivers-notification');
    if (noRecv) {
      if (receiversCount === 0 && !isRequesting) {
        noRecv.classList.remove('is-hidden');
        setPageState(1);
      } else {
        noRecv.classList.add('is-hidden');
      }
    }
  });

  sendSocket.on("send-approved", ({ fileId }) => {
    if (fileId === currentFileId) {
      logToConsole('OFFER RECEIVED AND APPROVED BY HOST', 'success');
      setPageStatus('Transmission approved. Staging conduit streams...', 'info');
    }
  });
  
  sendSocket.on("response-timer-started", ({ fileId, duration, totalReceivers }) => {
    if (fileId === currentFileId) {
      logToConsole(`TRANSMISSION STAGED: WAITING FOR PEER RESPONSES (${duration}s)`, 'warning');
      setPageState(3);
      
      const timerContainer = document.getElementById("response-timer");
      document.getElementById("total-receivers").textContent = totalReceivers;
      document.getElementById("response-count").textContent = "0";
      
      let timeLeft = duration;
      document.getElementById("timer-count").textContent = timeLeft;
      
      if (window.responseCountdown) clearInterval(window.responseCountdown);
      window.responseCountdown = setInterval(() => {
        timeLeft--;
        document.getElementById("timer-count").textContent = timeLeft;
        if (timeLeft <= 0) {
          clearInterval(window.responseCountdown);
        }
      }, 1000);

      const extendBtn = document.getElementById('extend-response-btn');
      extendBtn.onclick = () => {
        logToConsole('EMITTING TIMEOUT EXTENSION COMMAND', 'info');
        try { sendSocket.emit('extend-response-timer', { sessionId, fileId, senderId: peerId }); } catch (_) {}
      };
      
      const manualBtn = document.getElementById('manual-proceed-btn');
      manualBtn.onclick = () => {
        logToConsole('FORCE EXECUTE CONDUIT VIA OVERRIDE', 'warning');
        try { sendSocket.emit('manual-proceed', { sessionId, fileId, senderId: peerId }); } catch (_) {}
      };
    }
  });
  
  sendSocket.on("response-count-updated", ({ fileId, totalResponses, totalReceivers }) => {
    if (fileId === currentFileId) {
      document.getElementById("response-count").textContent = totalResponses;
      document.getElementById("total-receivers").textContent = totalReceivers;
      logToConsole(`PEER CONDUIT UPDATE: ${totalResponses} / ${totalReceivers} RESPONDED`, 'info');
      
      if (totalResponses >= totalReceivers) {
        clearInterval(window.responseCountdown);
        document.getElementById("response-timer").style.display = "none";
      }
    }
  });

  sendSocket.on('start-upload', ({ fileId }) => {
    if (fileId === currentFileId) {
      logToConsole('TRANSMISSION IN PROGRESS...', 'info');
      try { if (window.responseCountdown) clearInterval(window.responseCountdown); } catch (_) {}
      setPageState(4);
      startUpload(fileId);
    }
  });

  sendSocket.on("send-rejected", ({ fileId, reason }) => {
    if (fileId === currentFileId) {
      logToConsole(`TRANSMISSION BLOCK REJECTED: ${reason}`, 'error');
      showNotification(`Transmission rejected: ${reason}`, 'error');
      currentFileId = null;
      isRequesting = false;
      setPageState(selectedFile ? 2 : 1);
      updateSendButtonState();
    }
  });
  
  sendSocket.on("transfer-unlocked", () => {
    logToConsole('TRANSMISSION SHUT DOWN. CHANNEL UNLOCKED.', 'success');
    isRequesting = false;
    setPageState(selectedFile ? 2 : 1);
    updateSendButtonState();
  });

  sendSocket.on('receiver-rejected', ({ fileId, receiverPeerId }) => {
    if (fileId !== currentFileId) return;
    logToConsole(`PEER DECLINED CONDUIT OFFER`, 'warning');
  });

  sendSocket.on('all-rejected', ({ fileId }) => {
    if (fileId !== currentFileId) return;
    logToConsole('ALL PEER CONNECTIONS FAILED OR DECLINED OFFER', 'error');
    try { if (window.responseCountdown) clearInterval(window.responseCountdown); } catch (_) {}
    showNotification('All receivers declined offer.', 'warning');
    dequeueAndProceed();
  });

  sendSocket.on('offer-timeout', ({ fileId }) => {
    if (fileId !== currentFileId) return;
    logToConsole('TRANSMISSION OFFER TIMED OUT', 'error');
    try { if (window.responseCountdown) clearInterval(window.responseCountdown); } catch (_) {}
    showNotification('Offer expired.', 'warning');
    dequeueAndProceed();
  });

  sendSocket.on('download-progress', ({ fileId, receiverPeerId, loaded, total }) => {
    const percent = total ? Math.round((loaded / total) * 100) : 0;
    
    // Update local cache of peer progress
    if (!window.peerProgressStates) {
      window.peerProgressStates = new Map();
    }
    window.peerProgressStates.set(receiverPeerId, { loaded, total, percent });

    // Show receiver progress section in the UI
    const progressSec = document.getElementById('receiver-progress-section');
    if (progressSec) progressSec.classList.remove('is-hidden');

    // Render list of peer progress bars
    const listEl = document.getElementById('peer-progress-list');
    if (listEl) {
      let html = '';
      window.peerProgressStates.forEach((state, pId) => {
        const pName = knownPeers.get(pId) || pId.substring(0, 8);
        html += `
          <div style="display: flex; flex-direction: column; gap: 4px;">
            <div style="display: flex; justify-content: space-between; font-size: 0.78rem; font-family: var(--font-mono);">
              <span style="color: var(--text-primary); font-weight: 500;">🖥️ ${escapeHtml(pName)}</span>
              <span style="color: var(--cyan); font-weight: 600;">${state.percent}%</span>
            </div>
            <div style="height: 4px; background: rgba(0, 0, 0, 0.08); border-radius: 999px; overflow: hidden;">
              <div style="height: 100%; width: ${state.percent}%; background: linear-gradient(90deg, var(--cyan), var(--indigo)); transition: width 0.1s ease-out;"></div>
            </div>
          </div>
        `;
      });
      listEl.innerHTML = html;
    }

    if (!window.lastLoggedProgressPercents) {
      window.lastLoggedProgressPercents = new Map();
    }
    const key = `${fileId}-${receiverPeerId}`;
    const lastPercent = window.lastLoggedProgressPercents.get(key) || 0;
    if (percent === 100 || percent - lastPercent >= 10) {
      window.lastLoggedProgressPercents.set(key, percent);
      const peerName = knownPeers.get(receiverPeerId) || receiverPeerId.substring(0, 8);
      logToConsole(`PEER [${peerName}] DOWNLOAD PROGRESS: ${percent}%`, 'info');
      if (percent === 100) {
        window.lastLoggedProgressPercents.delete(key);
      }
    }
  });

  sendSocket.on('session-ended', () => {
    logToConsole('SESSION TERMINATED BY HOST', 'error');
    alert('This session has ended. Redirecting...');
    try { window.close(); } catch (e) {}
    window.location.href = role === 'host' ? '/' : `/session-ended.html?session=${sessionId}&role=${role}`;
  });

  sendSocket.on('session-invalidated', (data) => {
    logToConsole('SESSION KEY REFRESHED / INVALIDATED', 'error');
    alert('Session has been invalidated. The host created a new one.');
    window.location.href = role === 'host' ? '/' : `/session-ended.html?session=${sessionId}&role=${role}`;
  });
  
  sendSocket.on('peer-removed', (data) => {
    if (data.removedPeerId === peerId) {
      logToConsole(`KICKED FROM SESSION: ${data.reason || 'Unknown'}`, 'error');
      alert(`You have been removed from the session: ${data.reason || 'Unknown reason'}`);
      window.location.href = role === 'host' ? '/' : `/session-ended.html?session=${sessionId}&role=${role}`;
    }
  });

  sendSocket.on('error', (data) => {
    if (data?.message === 'Session not found') {
      alert('This session does not exist or has expired.');
      window.location.href = role === 'host' ? '/' : `/session-ended.html?session=${sessionId}&role=${role}`;
    }
  });

  sendSocket.on("disconnect", () => {
    logToConsole('DISCONNECTED FROM SIGNAL SERVER', 'error');
  });
}

function dequeueAndProceed() {
  clearReceiverProgress();
  if (selectedQueue.length > 0) {
    selectedQueue.shift();
    selectedFile = selectedQueue[0] || null;
    renderSelectedList();
    if (selectedFile) {
      setTimeout(() => requestToSendFile(), 1000);
    }
  } else {
    selectedFile = null;
    updateSendButtonState();
  }
  currentFileId = null;
  isRequesting = false;
}



function renderSelectedList() {
  const el = document.getElementById("selectedFiles");
  if (!selectedQueue.length) {
    el.innerHTML = "";
    setPageState(1);
    return;
  }
  
  const items = selectedQueue.map((f, idx) => `
    <div class="file-row">
      <span class="file-name">${escapeHtml(f.name)}</span>
      <span class="file-size">${formatFileSize(f.size)}</span>
      <button type="button" class="remove-btn remove-file" data-index="${idx}">✕</button>
    </div>
  `).join('');
  
  el.innerHTML = items;

  const badge = document.getElementById('staged-count-badge');
  if (badge) {
    badge.textContent = `${selectedQueue.length} FILES`;
  }
  
  // Attach listeners to remove buttons
  el.querySelectorAll('.remove-file').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(btn.getAttribute('data-index'), 10);
      removeAtIndex(idx);
    });
  });

  const totalSize = selectedQueue.reduce((acc, f) => acc + f.size, 0);
  document.getElementById('staged-stats-text').textContent = `FILES: ${selectedQueue.length} · SIZE: ${formatFileSize(totalSize).toUpperCase()}`;
  
  setPageState(2);
  updateSendButtonState();
}

function removeAtIndex(idx) {
  const removed = selectedQueue.splice(idx, 1)[0];
  const wasCurrentTop = (idx === 0 && currentFileId);
  selectedFile = selectedQueue[0] || null;
  document.getElementById("fileInput").value = "";
  renderSelectedList();
  
  if (wasCurrentTop) {
    try {
      if (window.responseCountdown) clearInterval(window.responseCountdown);
    } catch (_) {}
    try {
      sendSocket.emit('cancel-pending-offer', { sessionId, fileId: currentFileId, senderId: peerId });
    } catch (_) {}
    currentFileId = null;
    isRequesting = false;
    if (selectedFile) {
      setTimeout(() => requestToSendFile(), 250);
    }
  }
}

function requestToSendFile() {
  if (!selectedFile || isRequesting) return;
  
  isRequesting = true;
  updateSendButtonState();
  
  logToConsole(`OFFERING FILE CONDUIT: ${selectedFile.name} (${formatFileSize(selectedFile.size)})`, 'info');
  
  sendSocket.emit("request-send-lock", { sessionId, senderId: peerId }, (response) => {
    if (response.ok) {
      currentFileId = `${peerId}-${Date.now()}`;
      const fileObj = { id: currentFileId, name: selectedFile.name, size: selectedFile.size, type: selectedFile.type };
      sendSocket.emit("request-to-send", { sessionId, file: fileObj, senderId: peerId });
    } else {
      isRequesting = false;
      updateSendButtonState();
      showNotification(response.message || "Lock acquisition failed.", "error");
    }
  });
}



async function startUpload(fileId) {
  let offset = 0;
  try {
    const statusResp = await fetch(`/api/v1/upload/status/${sessionId}/${fileId}`);
    if (statusResp.ok) {
      const statusJson = await statusResp.json();
      if (statusJson.bytesReceived > 0 && statusJson.bytesReceived < selectedFile.size) {
        offset = statusJson.bytesReceived;
        logToConsole(`RESUMING STREAM FROM OFFSET ${formatFileSize(offset)}`, 'info');
      }
    }
  } catch (e) {}
  executeUpload(fileId, offset);
}

function executeUpload(fileId, offset = 0) {
  const startTime = Date.now();
  const progressTracker = new ProgressTracker();
  progressTracker.start(selectedFile.size);

  const fileChunk = offset > 0 ? selectedFile.slice(offset) : selectedFile;

  const formData = new FormData();
  formData.append("file", fileChunk, selectedFile.name);
  formData.append("fileId", fileId);
  formData.append("peerId", peerId);

  const xhr = new XMLHttpRequest();
  xhr.open("POST", `/upload/${sessionId}?fileId=${encodeURIComponent(fileId)}`, true);
  
  if (offset > 0) {
    xhr.setRequestHeader("X-Upload-Offset", offset);
  }
  xhr.setRequestHeader("X-File-Id", fileId);

  let lastProgressEmitTime = 0;

  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) {
      const totalLoaded = offset + e.loaded;
      const stats = progressTracker.update(totalLoaded);
      
      const percent = stats.progress;

      document.getElementById("upload-list").innerHTML = `
        <div class="upload-file-item">
          <div class="upload-file-header">
            <span class="upload-file-name">${escapeHtml(selectedFile.name)}</span>
            <span class="upload-file-pct">${percent.toFixed(0)}%</span>
          </div>
          <div class="progress-track">
            <div class="fill-upload" style="width: ${percent.toFixed(0)}%;"></div>
          </div>
        </div>`;
      
      document.getElementById('upload-stats').innerHTML = `
        <div class="stat-item">
          <div class="stat-label">Progress</div>
          <div class="stat-value cyan">${percent.toFixed(0)}<span class="stat-unit">%</span></div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Speed</div>
          <div class="stat-value indigo">${formatSpeed(stats.speed)}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">ETA</div>
          <div class="stat-value amber">${formatTime(stats.eta)}</div>
        </div>
      `;
      
      const now = Date.now();
      if (now - lastProgressEmitTime >= 150 || percent === 100) {
        lastProgressEmitTime = now;
        try { 
          sendSocket.emit('sender-progress', { sessionId, fileId, loaded: totalLoaded, total: selectedFile.size, speedBps: stats.speed, etaSeconds: stats.eta }); 
        } catch (_) {}
      }
    }
  };

  xhr.onload = () => {
    if (xhr.status === 200) {
      const durationSec = Math.max(1, Math.round((Date.now() - startTime) / 1000));
      logToConsole(`TRANSMISSION SUCCESSFUL: ${selectedFile.name}`, 'success');
      
      const fileMetadata = { id: fileId, name: selectedFile.name, size: selectedFile.size, type: selectedFile.type };
      sendSocket.emit('upload-complete', { sessionId, file: fileMetadata });
      
      showNotification("Transmission completed successfully.", "success");
      
      document.getElementById("upload-title").textContent = `TRANSMISSION COMPLETE · ${formatFileSize(selectedFile.size).toUpperCase()} · ${durationSec} SEC`;
      document.getElementById('upload-stats').innerHTML = '';
      
      setTimeout(() => {
        dequeueAndProceed();
      }, 2000);
    } else {
      showError("Transmission conduit failure.");
      resetState();
    }
  };

  xhr.onerror = async () => {
    showError('Network socket failure.');
    resetState();
  };

  xhr.send(formData);
}

function resetState() {
  selectedFile = null;
  currentFileId = null;
  isRequesting = false;
  setPageState(1);
  selectedQueue = [];
  renderSelectedList();
}

function goBack() {
  try { 
    if (sendSocket && sendSocket.connected) {
      sendSocket.emit('leave-send-page', { sessionId, peerId });
      sendSocket.emit('cancel-transfer', { sessionId });
      setTimeout(() => {
        window.location.href = `/session.html?session=${sessionId}&role=${role}&peerId=${peerId}`;
      }, 100);
    } else {
      window.location.href = `/session.html?session=${sessionId}&role=${role}&peerId=${peerId}`;
    }
  } catch (e) {
    window.location.href = `/session.html?session=${sessionId}&role=${role}&peerId=${peerId}`;
  }
}


