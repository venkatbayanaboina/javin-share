import '../core/index.js';
import {
  getPeerId,
  getDeviceName,
  removeDeviceName,
  markSessionExited,
  getUrlParameter,
  showNotification,
  setPageStatus,
  escapeHtml,
  formatFileSize,
  formatTime,
  formatSpeed,
  ProgressTracker,
  hasExitedSession,
  clearSessionExited,
} from '../core/index.js';
import { registerNavigateListener } from '../core/navigate.js';

let sessionId;
let role;
let peerId;
let receiveSocket;
let offeredFile = null;
let downloadActive = false;
let downloadCompleted = false;
let consoleBody = null;

document.addEventListener('DOMContentLoaded', async () => {
  if (!window.FileShareUtils) {
    document.body.innerHTML = `<div class='container'><div class='error'><h2>Critical Error</h2><p>Core scripts failed to load.</p></div></div>`;
    return;
  }

  sessionId = getUrlParameter("session");
  role = getUrlParameter("role");
  peerId = getPeerId();

  if (role === 'client' && sessionStorage.getItem(`rejoining_${sessionId}`) === '1') {
    try {
      clearSessionExited(sessionId);
    } catch (_) {}
    sessionStorage.removeItem(`rejoining_${sessionId}`);
  }

  if (!sessionId || !role) {
    document.body.innerHTML = `
      <div class="wrap" style="display: flex; align-items: center; justify-content: center; min-height: 100vh; box-sizing: border-box; padding: 20px;">
        <div class="card card-accent-rose" style="max-width: 440px; width: 100%; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 18px; padding: 36px 28px; box-sizing: border-box;">
          <div style="font-size: 2.2rem; width: 64px; height: 64px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: rgba(244,63,94,0.12); border: 1px solid rgba(244,63,94,0.28); margin-bottom: 6px; animation: orb-pulse 2.6s ease-in-out infinite;">⚠️</div>
          <h2 style="font-family: var(--font-sans); font-size: 1.4rem; font-weight: 700; color: #fff; margin: 0; letter-spacing: -0.01em;">Invalid Access</h2>
          <p style="font-family: var(--font-sans); font-size: 0.9rem; color: var(--sub); margin: 0; line-height: 1.5;">Required session parameters are missing.</p>
          <button onclick="window.location.href='/'" class="btn-primary" style="width: 100%; height: 46px; font-size: 0.95rem; font-weight: 700; margin-top: 8px;" type="button">Return to Main</button>
        </div>
      </div>
    `;
    return;
  }

  if (hasExitedSession(sessionId)) {
    window.location.href = role === 'host' ? '/' : `/session-ended.html?session=${sessionId}&role=${role}`;
    return;
  }

  try {
    const res = await fetch(`/api/session-details/${sessionId}`);
    if (!res.ok) {
      try { clearSessionExited(sessionId); } catch (_) {}
      document.body.innerHTML = `
        <div class="wrap" style="display: flex; align-items: center; justify-content: center; min-height: 100vh; box-sizing: border-box; padding: 20px;">
          <div class="card card-accent-rose" style="max-width: 440px; width: 100%; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 18px; padding: 36px 28px; box-sizing: border-box;">
            <div style="font-size: 2.2rem; width: 64px; height: 64px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: rgba(244,63,94,0.12); border: 1px solid rgba(244,63,94,0.28); margin-bottom: 6px; animation: orb-pulse 2.6s ease-in-out infinite;">⚠️</div>
            <h2 style="font-family: var(--font-sans); font-size: 1.4rem; font-weight: 700; color: #fff; margin: 0; letter-spacing: -0.01em;">Session Expired</h2>
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
          <h2 style="font-family: var(--font-sans); font-size: 1.4rem; font-weight: 700; color: #fff; margin: 0; letter-spacing: -0.01em;">Connection Error</h2>
          <p style="font-family: var(--font-sans); font-size: 0.9rem; color: var(--sub); margin: 0; line-height: 1.5;">Unable to connect to the session. Please check your network.</p>
          <button onclick="window.location.href='/'" class="btn-primary" style="width: 100%; height: 46px; font-size: 0.95rem; font-weight: 700; margin-top: 8px;" type="button">Return to Main</button>
        </div>
      </div>
    `;
    return;
  }

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

  document.getElementById("accept-btn").addEventListener("click", () => {
    if (!offeredFile) return;
    logToConsole('EMITTING OFFER ACCEPTANCE CONDUIT COMMAND', 'success');
    receiveSocket.emit("accept-file", { sessionId, fileId: offeredFile.id, receiverPeerId: peerId });
    
    // Hide drawer and wait
    setPageState(1);
    const lobby = document.getElementById('status-message');
    if (lobby) {
      lobby.classList.remove('is-hidden');
      const statusIcon = lobby.querySelector('.status-icon');
      const statusTitle = lobby.querySelector('.status-title');
      const statusSub = lobby.querySelector('.status-sub');
      if (statusIcon) statusIcon.textContent = '✓';
      if (statusTitle) statusTitle.textContent = 'OFFER ACCEPTED';
      if (statusSub) statusSub.textContent = 'Waiting for sender to establish stream connection...';
    }
    try { if (window.responseCountdown) clearInterval(window.responseCountdown); } catch (_) {}
    try { document.getElementById('response-timer').classList.add('is-hidden'); } catch (_) {}
  });

  document.getElementById("reject-btn").addEventListener("click", () => {
    if (!offeredFile) return;
    logToConsole('EMITTING OFFER REJECTION CONDUIT COMMAND', 'error');
    receiveSocket.emit("reject-file", { sessionId, fileId: offeredFile.id, receiverPeerId: peerId });
    offeredFile = null;
    setPageState(1);
    try { if (window.responseCountdown) clearInterval(window.responseCountdown); } catch (_) {}
    try { document.getElementById('response-timer').classList.add('is-hidden'); } catch (_) {}
  });

  document.getElementById('open-folder-btn').addEventListener('click', () => {
    window.location.href = `/session.html?session=${sessionId}&role=${role}`;
  });

  document.getElementById('cancel-download').addEventListener('click', () => {
    logToConsole('USER CANCELLED DOWNLOAD PROCESS', 'error');
    window.location.href = `/session.html?session=${sessionId}&role=${role}`;
  });

  document.getElementById('exit-receive-btn').addEventListener('click', () => {
    if (confirm('Are you sure you want to exit the session?')) {
      if (receiveSocket && receiveSocket.connected) {
        receiveSocket.emit('leave-receive-page', { sessionId, peerId });
        receiveSocket.emit('leave-session', { sessionId, peerId }, () => {
          try { receiveSocket.disconnect(); } catch (_) {}
          if (role === 'host') {
            window.location.href = '/?forceNew=1';
          } else {
            removeDeviceName();
            markSessionExited(sessionId);
            window.location.href = `/session-ended.html?session=${sessionId}&role=${role}`;
          }
        });
      } else {
        if (role === 'host') {
          window.location.href = '/?forceNew=1';
        } else {
          removeDeviceName();
          markSessionExited(sessionId);
          window.location.href = `/session-ended.html?session=${sessionId}&role=${role}`;
        }
      }
    }
  });

  try {
    window.history.pushState(null, null, window.location.href);
  } catch (e) {}
  
  window.addEventListener('popstate', function (event) {
    if (receiveSocket && receiveSocket.connected) {
      receiveSocket.emit('leave-receive-page', { sessionId, peerId });
    }
    event.preventDefault();
    alert('⚠️ Redirecting to console.');
    setTimeout(() => {
      window.location.href = `/session.html?session=${sessionId}&role=${role}&peerId=${peerId}`;
    }, 100);
  }, true);
  
  window.addEventListener('beforeunload', function () {
    if (receiveSocket && receiveSocket.connected) {
      receiveSocket.emit('leave-receive-page', { sessionId, peerId });
    }
  });

  setupSocket();
});



function logToConsole(message, type = 'info') {
  if (!consoleBody) return;
  const time = new Date().toTimeString().split(' ')[0];
  const colorMap = {
    info: 'var(--color-indigo)',
    success: 'var(--color-emerald)',
    warning: 'var(--color-amber)',
    error: 'var(--color-coral)'
  };
  const color = colorMap[type] || 'var(--color-text-primary)';
  const logRow = document.createElement('div');
  logRow.style.color = color;
  logRow.innerHTML = `<span style="color: var(--color-text-muted);">[${time}]</span> ${escapeHtml(message)}`;
  consoleBody.appendChild(logRow);
  consoleBody.scrollTop = consoleBody.scrollHeight;
}

function setPageState(state) {
  const lobby = document.getElementById('status-message');
  const drawer = document.getElementById('incoming-files');
  const progress = document.getElementById('download-progress');
  const openFolderBtn = document.getElementById('open-folder-btn');
  const cancelBtn = document.getElementById('cancel-download');
  
  if (state === 1) { // Scanning lobby
    if (lobby) {
      lobby.classList.remove('is-hidden');
      // Reset lobby text
      const statusIcon = lobby.querySelector('.status-icon');
      const statusTitle = lobby.querySelector('.status-title');
      const statusSub = lobby.querySelector('.status-sub');
      if (statusIcon) statusIcon.textContent = '🛰️';
      if (statusTitle) statusTitle.textContent = 'Listening for Incoming Streams';
      if (statusSub) statusSub.textContent = 'Conduit ready. Waiting for sender file offers.';
    }
    if (drawer) drawer.classList.add('is-hidden');
    if (progress) progress.classList.add('is-hidden');
    if (openFolderBtn) openFolderBtn.classList.add('is-hidden');
    if (cancelBtn) cancelBtn.classList.add('is-hidden');
    downloadActive = false;
    downloadCompleted = false;
  } else if (state === 2) { // Slide offer
    if (lobby) lobby.classList.add('is-hidden');
    if (drawer) drawer.classList.remove('is-hidden');
    if (progress) progress.classList.add('is-hidden');
    if (openFolderBtn) openFolderBtn.classList.add('is-hidden');
    if (cancelBtn) cancelBtn.classList.add('is-hidden');
    downloadCompleted = false;
  } else if (state === 3) { // Downloading
    if (lobby) lobby.classList.add('is-hidden');
    if (drawer) drawer.classList.add('is-hidden');
    if (progress) progress.classList.remove('is-hidden');
    if (openFolderBtn) openFolderBtn.classList.add('is-hidden');
    if (cancelBtn) cancelBtn.classList.remove('is-hidden');
    downloadActive = true;
  } else if (state === 4) { // Completed
    if (lobby) lobby.classList.add('is-hidden');
    if (drawer) drawer.classList.add('is-hidden');
    if (progress) progress.classList.remove('is-hidden');
    if (openFolderBtn) openFolderBtn.classList.remove('is-hidden');
    if (cancelBtn) cancelBtn.classList.add('is-hidden');
    downloadActive = false;
  }
}

// History List State
const receivedFilesHistory = [];

function addFileToHistory(fileRecord) {
  receivedFilesHistory.push(fileRecord);
  updateHistoryUI();
}

function updateHistoryUI() {
  const historyTable = document.getElementById('history-table');
  const historyBody = document.getElementById('history-body');
  const historyEmpty = document.getElementById('history-empty');
  const historyCount = document.getElementById('history-count');
  
  if (historyCount) {
    historyCount.textContent = receivedFilesHistory.length;
  }
  
  if (receivedFilesHistory.length === 0) {
    if (historyTable) historyTable.style.display = 'none';
    if (historyEmpty) historyEmpty.style.display = 'block';
  } else {
    if (historyTable) historyTable.style.display = 'table';
    if (historyEmpty) historyEmpty.style.display = 'none';
    
    if (historyBody) {
      historyBody.innerHTML = receivedFilesHistory.map((item, idx) => `
        <tr>
          <td class="col-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</td>
          <td class="col-size">${formatFileSize(item.size)}</td>
          <td class="col-time">${escapeHtml(item.time)}</td>
          <td class="col-status">
            <span class="status-pill ${item.status === 'success' ? 'done' : 'failed'}">
              ${item.status === 'success' ? 'Done' : 'Failed'}
            </span>
          </td>
          <td>
            <div class="row-actions">
              <button class="btn-row-action download" onclick="window.reDownloadFile(${idx})" title="Download Again">
                📥
              </button>
              <button class="btn-row-action copy" onclick="window.copyFileName(${idx})" title="Copy Name">
                📋
              </button>
            </div>
          </td>
        </tr>
      `).join('');
    }
  }
}

window.reDownloadFile = (idx) => {
  const item = receivedFilesHistory[idx];
  if (item) {
    logToConsole(`RE-DOWNLOADING: ${item.name}`, 'info');
    alert(`File "${item.name}" was downloaded earlier in this session.`);
  }
};

window.copyFileName = (idx) => {
  const item = receivedFilesHistory[idx];
  if (item) {
    navigator.clipboard.writeText(item.name)
      .then(() => {
        logToConsole(`COPIED FILENAME TO CLIPBOARD: ${item.name}`, 'success');
        setPageStatus('Copied to clipboard!', 'success', { duration: 2000 });
      })
      .catch(err => {
        logToConsole(`COPY FAILED: ${err.message}`, 'error');
      });
  }
};

function setupSocket() {
  receiveSocket = io({ query: { page: 'receive' }, transports: ['websocket'] });
  
  registerNavigateListener(receiveSocket, {
    beforeNavigate: (data) => {
      const to = data?.to || '';
      if (to.includes('session.html') && receiveSocket?.connected) {
        receiveSocket.emit('leave-receive-page', { sessionId, peerId });
      }
    },
    onSamePage: (data) => {
      if (data?.message) {
        setPageStatus(data.message, 'info', { duration: 7000 });
      }
    },
  });

  receiveSocket.on("connect", () => {
    logToConsole('ESTABLISHED SOCKET CONNECTION TO SIGNAL SERVER', 'success');
    const deviceName = getDeviceName();
    receiveSocket.emit("join-session", { sessionId, role, peerId, deviceName });
    setTimeout(() => {
      receiveSocket.emit("enter-receive-page", { sessionId, peerId });
    }, 100);
  });

  receiveSocket.on("session-joined", (data) => {
    logToConsole(`SUCCESSFULLY JOINED CHANNEL: ${data.sessionId}`, 'info');
  });

  receiveSocket.on("file-offer", ({ file, senderId, senderName }) => {
    logToConsole(`INCOMING STREAM OFFER: ${file.name} (${formatFileSize(file.size)}) FROM ${senderName}`, 'warning');
    offeredFile = file;
    showOffer(file, senderName);
  });
  
  receiveSocket.on("response-timer-started", ({ fileId, duration, totalReceivers }) => {
    if (offeredFile && offeredFile.id === fileId) {
      const timerContainer = document.getElementById("response-timer");
      if (timerContainer) {
        timerContainer.classList.remove("is-hidden");
        timerContainer.classList.remove("urgent");
      }
      const timerCount = document.getElementById("timer-count");
      if (timerCount) timerCount.textContent = duration;
      const timerBar = document.getElementById("timer-bar");
      if (timerBar) timerBar.style.width = "100%";
      
      let timeLeft = duration;
      if (window.responseCountdown) clearInterval(window.responseCountdown);
      window.responseCountdown = setInterval(() => {
        timeLeft--;
        if (timerCount) timerCount.textContent = timeLeft;
        if (timerBar) {
          const percent = (timeLeft / duration) * 100;
          timerBar.style.width = `${percent}%`;
        }
        
        if (timeLeft <= 10) {
          if (timerContainer) timerContainer.classList.add("urgent");
        }
        
        if (timeLeft <= 0) {
          clearInterval(window.responseCountdown);
          if (timerContainer) timerContainer.classList.add("is-hidden");
          setPageState(1);
        }
      }, 1000);
    }
  });

  receiveSocket.on("upload-started", () => {
    logToConsole('SENDER INITIATED STREAM TRANSFER', 'info');
    const lobby = document.getElementById('status-message');
    if (lobby) {
      lobby.classList.remove('is-hidden');
      const statusIcon = lobby.querySelector('.status-icon');
      const statusTitle = lobby.querySelector('.status-title');
      const statusSub = lobby.querySelector('.status-sub');
      if (statusIcon) statusIcon.textContent = '⏳';
      if (statusTitle) statusTitle.textContent = 'SENDER UPLOADING CONDUIT STREAMS...';
      if (statusSub) statusSub.textContent = 'Preparing conduit download pipeline...';
    }
  });

  receiveSocket.on('sender-progress', ({ fileId, loaded, total, speedBps, etaSeconds }) => {
    if (downloadCompleted) return;
    if (offeredFile && offeredFile.id === fileId) {
      const sp = document.getElementById('sender-progress');
      const percent = total ? (loaded / total) * 100 : 0;
      
      if (sp) {
        sp.classList.remove('is-hidden');
        sp.textContent = `SENDER UPLOADING: ${percent.toFixed(0)}% · SPEED: ${formatSpeed(speedBps)} · ETA ${formatTime(etaSeconds)}`;
      }

      // If download active, update progress
      if (downloadActive) {
        const titlePct = document.getElementById('download-title-pct');
        if (titlePct) titlePct.textContent = `${percent.toFixed(0)}%`;
        
        const downloadList = document.getElementById('download-list');
        if (downloadList) {
          downloadList.innerHTML = `
            <div class="progress-file-item">
              <div class="progress-file-header">
                <span class="progress-file-name">${escapeHtml(offeredFile.name)}</span>
                <span class="progress-file-pct">${percent.toFixed(0)}%</span>
              </div>
              <div class="progress-track">
                <div class="progress-fill" style="width: ${percent.toFixed(0)}%;"></div>
              </div>
            </div>
          `;
        }
        
        const downloadStats = document.getElementById('download-stats');
        if (downloadStats) {
          downloadStats.innerHTML = `
            <div class="stat-item">
              <div class="stat-label">Progress</div>
              <div class="stat-value cyan">${percent.toFixed(0)}<span class="stat-unit">%</span></div>
            </div>
            <div class="stat-item">
              <div class="stat-label">Speed</div>
              <div class="stat-value indigo">${formatSpeed(speedBps)}</div>
            </div>
            <div class="stat-item">
              <div class="stat-label">ETA</div>
              <div class="stat-value amber">${formatTime(etaSeconds)}</div>
            </div>
          `;
        }
      }
    }
  });

  receiveSocket.on("download-ready", ({ file, downloadUrl }) => {
    logToConsole('CONDUIT CHANNEL READY: DOWNLOAD INITIALIZED', 'success');
    try { if (window.responseCountdown) clearInterval(window.responseCountdown); } catch (_) {}
    try { document.getElementById('response-timer').classList.add('is-hidden'); } catch (_) {}
    try { document.getElementById('sender-progress').classList.add('is-hidden'); } catch (_) {}
    
    setPageState(3);
    startStreamingDownload(file, downloadUrl);
  });

  receiveSocket.on('download-progress', ({ fileId, receiverPeerId, loaded, total }) => {
    if (downloadCompleted) return;
    if (offeredFile && offeredFile.id === fileId && receiverPeerId === peerId) {
      if (!downloadActive) {
        downloadActive = true;
        setPageState(3);
      }

      if (!window.downloadProgressTracker) {
        window.downloadProgressTracker = new ProgressTracker();
        window.downloadProgressTracker.start(total);
      }

      const stats = window.downloadProgressTracker.update(loaded);
      const percent = stats.progress;

      const titlePct = document.getElementById('download-title-pct');
      if (titlePct) titlePct.textContent = `${percent.toFixed(0)}%`;

      const downloadList = document.getElementById('download-list');
      if (downloadList) {
        downloadList.innerHTML = `
          <div class="progress-file-item">
            <div class="progress-file-header">
              <span class="progress-file-name">${escapeHtml(offeredFile.name)}</span>
              <span class="progress-file-pct">${percent.toFixed(0)}%</span>
            </div>
            <div class="progress-track">
              <div class="progress-fill" style="width: ${percent.toFixed(0)}%;"></div>
            </div>
          </div>
        `;
      }

      const statsContainer = document.getElementById('download-stats');
      if (statsContainer) {
        statsContainer.innerHTML = `
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
      }
    }
  });

  receiveSocket.on('return-all-to-main', () => {
    logToConsole('SENDER CANCELLED SESSION. RETURNING TO DASHBOARD.', 'warning');
    try { if (window.responseCountdown) clearInterval(window.responseCountdown); } catch (_) {}
    window.location.href = `/session.html?session=${sessionId}&role=${role}`;
  });

  receiveSocket.on('transfer-unlocked', () => {
    if (window.downloadProgressTracker) {
      window.downloadProgressTracker = null;
    }
    // If download was running, set to Complete state (State 4)
    if (downloadActive) {
      logToConsole('DOWNLOAD TRANSACTION COMPLETED SUCCESSFULLY', 'success');
      downloadCompleted = true;
      setPageState(4);
      
      const title = document.getElementById('download-title');
      if (title) {
        title.innerHTML = `DOWNLOAD COMPLETE <span id="download-title-pct" style="color: var(--color-emerald);">100%</span>`;
      }
      
      const stats = document.getElementById('download-stats');
      if (stats) {
        stats.innerHTML = `
          <div class="stat-item">
            <div class="stat-label">Status</div>
            <div class="stat-value emerald" style="color: var(--color-emerald);">COMPLETE</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">Size</div>
            <div class="stat-value indigo">${formatFileSize(offeredFile?.size || 0)}</div>
          </div>
        `;
      }
      
      if (offeredFile) {
        addFileToHistory({
          name: offeredFile.name,
          size: offeredFile.size,
          time: new Date().toLocaleTimeString(),
          status: 'success'
        });
      }
    } else {
      // Offer canceled or rejected
      logToConsole('TRANSMISSION OFFER CLOSED', 'info');
      try { if (window.responseCountdown) clearInterval(window.responseCountdown); } catch (_) {}
      setPageState(1);
    }
  });

  receiveSocket.on('session-ended', () => {
    logToConsole('SESSION TERMINATED BY HOST', 'error');
    alert('This session has ended. Redirecting...');
    try { window.close(); } catch (e) {}
    window.location.href = role === 'host' ? '/' : `/session-ended.html?session=${sessionId}&role=${role}`;
  });

  receiveSocket.on('session-invalidated', (data) => {
    logToConsole('SESSION KEY REFRESHED / INVALIDATED', 'error');
    alert('Session has been invalidated. The host created a new one.');
    window.location.href = role === 'host' ? '/' : `/session-ended.html?session=${sessionId}&role=${role}`;
  });
  
  receiveSocket.on('peer-removed', (data) => {
    if (data.removedPeerId === peerId) {
      logToConsole(`KICKED FROM SESSION: ${data.reason || 'Unknown'}`, 'error');
      alert(`You have been removed from the session: ${data.reason || 'Unknown reason'}`);
      window.location.href = role === 'host' ? '/' : `/session-ended.html?session=${sessionId}&role=${role}`;
    }
  });

  receiveSocket.on('error', (data) => {
    if (data?.message === 'Session not found') {
      alert('This session does not exist or has expired.');
      window.location.href = role === 'host' ? '/' : `/session-ended.html?session=${sessionId}&role=${role}`;
    }
  });

  receiveSocket.on("disconnect", () => {
    logToConsole('DISCONNECTED FROM SIGNAL SERVER', 'error');
  });
}

function showOffer(file, senderName) {
  setPageState(2);
  
  const offerSenderTitle = document.getElementById("offer-sender-title");
  if (offerSenderTitle) {
    offerSenderTitle.textContent = `${escapeHtml(senderName)} is offering a stream`;
  }
  
  const offerCount = document.getElementById("offer-count");
  if (offerCount) {
    offerCount.textContent = `1 FILE`;
  }
  
  const filesList = document.getElementById("offer-files-list");
  if (filesList) {
    filesList.innerHTML = `
      <li>
        <span class="file-name">${escapeHtml(file.name)}</span>
        <span class="file-size">${formatFileSize(file.size)}</span>
      </li>
    `;
  }
  
  const totalSizeVal = document.getElementById("offer-total-size-val");
  if (totalSizeVal) {
    totalSizeVal.textContent = formatFileSize(file.size);
  }
}



function startStreamingDownload(fileMeta, url) {
  setPageStatus(`Downloading ${fileMeta.name}...`, 'info');
  try {
    let iframe = document.getElementById('download-iframe');
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.id = 'download-iframe';
      iframe.style.display = 'none';
      document.body.appendChild(iframe);
    }
    iframe.src = url;
  } catch (err) {
    logToConsole(`STREAM DOWNLOAD EXECUTION FAILED: ${err.message}`, 'error');
    showNotification(`Download failed: ${fileMeta.name}`, "error");
    if (offeredFile) {
      addFileToHistory({
        name: offeredFile.name,
        size: offeredFile.size,
        time: new Date().toLocaleTimeString(),
        status: 'failed'
      });
    }
    setPageState(1);
  }
}




