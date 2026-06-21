import '../core/index.js';
import {
  getPeerId,
  getDeviceName,
  removeDeviceName,
  hasExitedSession,
  clearSessionExited,
  getUrlParameter,
  showError,
  showNotification,
  setPageStatus,
  escapeHtml,
  formatFileSize,
  getDeviceInfo,
} from '../core/index.js';
import { registerNavigateListener } from '../core/navigate.js';

// Globals
let mainSocket = null;
let hostInMainPage = false;
const peerId = getPeerId();

document.addEventListener('DOMContentLoaded', async () => {
  if (!window.FileShareUtils) {
    document.body.innerHTML = `<div class='container'><div class='error'><h2>Critical Error</h2><p>Core scripts failed to load.</p></div></div>`;
    return;
  }

  // Comprehensive client-side guard to prevent direct navigation
  console.log('🔒 Setting up back navigation blocking...');
  let backNavigationBlocked = false;
  
  try {
    window.history.pushState(null, null, window.location.href);
    console.log('      History state pushed successfully');
  } catch (e) {
    console.error('      Failed to push history state:', e);
  }
  
  function blockBackNavigation(event) {
    console.log('🚫 Back navigation attempt detected!');
    if (!backNavigationBlocked) {
      backNavigationBlocked = true;
      event.preventDefault();
      event.stopPropagation();
      try {
        window.history.pushState(null, null, window.location.href);
      } catch (e) {}
      
      const urlParams = new URLSearchParams(window.location.search);
      const role = urlParams.get('role');
      const sessionId = urlParams.get('session');
      const peerIdVal = getPeerId();
      
      if (mainSocket && mainSocket.connected && role === 'host') {
        mainSocket.emit('leave-main-page', { sessionId, peerId: peerIdVal });
      }
      
      alert('⚠️ Back navigation is disabled for security reasons.\n\nPlease use the Exit button to leave the session.');
      
      setTimeout(() => {
        backNavigationBlocked = false;
      }, 1000);
    }
  }
  
  window.addEventListener('popstate', blockBackNavigation, true);
  
  window.addEventListener('beforeunload', function(e) {
    const urlParams = new URLSearchParams(window.location.search);
    const role = urlParams.get('role');
    const sessionId = urlParams.get('session');
    const peerIdVal = getPeerId();
    if (mainSocket && mainSocket.connected && role === 'host') {
      mainSocket.emit('leave-main-page', { sessionId, peerId: peerIdVal });
    }
  });
  
  window.addEventListener('hashchange', function(e) {
    e.preventDefault();
    e.stopPropagation();
  });
  
  setInterval(() => {
    try {
      if (window.location.href !== window.history.state?.url) {
        window.history.pushState({ url: window.location.href }, null, window.location.href);
      }
    } catch (e) {}
  }, 2000);
  
  // Swipe gesture blocking
  let touchStartX = 0;
  let touchStartY = 0;
  document.addEventListener('touchstart', function(e) {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: false });
  
  document.addEventListener('touchend', function(e) {
    const deltaX = e.changedTouches[0].clientX - touchStartX;
    const deltaY = e.changedTouches[0].clientY - touchStartY;
    if (deltaX < -50 && Math.abs(deltaY) < 100) {
      e.preventDefault();
      e.stopPropagation();
      const urlParams = new URLSearchParams(window.location.search);
      const role = urlParams.get('role');
      const sessionId = urlParams.get('session');
      const peerIdVal = getPeerId();
      if (mainSocket && mainSocket.connected && role === 'host') {
        mainSocket.emit('leave-main-page', { sessionId, peerId: peerIdVal });
      }
      alert('⚠️ Back swipe gesture is disabled for security reasons.\n\nPlease use the Exit button to leave the session.');
    }
  }, { passive: false });
  
  document.addEventListener('keydown', function(e) {
    if ((e.altKey && e.key === 'ArrowLeft') || (e.altKey && e.key === 'ArrowRight') || e.key === 'F5') {
      e.preventDefault();
      e.stopPropagation();
      alert('⚠️ This keyboard shortcut is disabled for security reasons.\n\nPlease use the Exit button to leave the session.');
    }
  });

  const sessionId = getUrlParameter('session');
  const role = getUrlParameter('role');

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
          <h2 style="font-family: var(--font-sans); font-size: 1.4rem; font-weight: 700; color: var(--text-primary); margin: 0; letter-spacing: -0.01em;">Invalid Access</h2>
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

  // Initialize UI controls
  document.getElementById('sendBtn').disabled = true;

  const deviceName = getDeviceName() || 'Unknown Device';

  document.getElementById('deviceName').textContent = deviceName;
  const deviceInfo = getDeviceInfo();
  const osIcon = deviceInfo.os === 'macos' ? '🍎' : deviceInfo.os === 'windows' ? '🪟' : deviceInfo.os === 'linux' ? '🐧' : deviceInfo.os === 'android' ? '🤖' : deviceInfo.os === 'ios' ? '📱' : '💻';
  const typeIcon = deviceInfo.deviceType === 'mobile' ? '📱' : deviceInfo.deviceType === 'tablet' ? '📲' : '🖥️';
  document.getElementById('deviceInfo').textContent = `${typeIcon} ${osIcon} ${deviceInfo.os.toUpperCase()}`;
  document.getElementById('userRole').textContent = role === 'host' ? '🏠 HOST NODE' : '💻 CLIENT NODE';

  try {
    clearSessionExited(sessionId);
  } catch (_) {}

  // Collapsible Activity Console Log Logic
  const toggleConsoleBtn = document.getElementById('toggle-console-btn');
  const consoleBody = document.getElementById('console-body');
  const toggleConsoleText = document.getElementById('toggle-console-text');

  if (toggleConsoleBtn && consoleBody) {
    toggleConsoleBtn.addEventListener('click', () => {
      const isHidden = consoleBody.style.display === 'none';
      consoleBody.style.display = isHidden ? 'block' : 'none';
      toggleConsoleText.textContent = isHidden ? '[ HIDE ]' : '[ SHOW ]';
    });
  }

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

  // Render ASCII topology map
  function updateTopologyMap(peers) {
    const mapEl = document.getElementById('topology-map');
    if (!mapEl) return;
    
    const host = peers.find(p => p.role === 'host');
    const clients = peers.filter(p => p.role !== 'host');
    
    let hostName = host ? (host.deviceName || 'HOST') : 'HOST';
    if (host && host.peerId === peerId) {
      hostName += ' (YOU)';
    }

    let tree = `${hostName}\n`;
    if (clients.length === 0) {
      tree += ` │\n └── (NO CLIENTS CONNECTED)`;
    } else {
      clients.forEach((c, idx) => {
        const isLast = idx === clients.length - 1;
        const connector = isLast ? ' └── ' : ' ├── ';
        let clientLabel = c.deviceName || 'Client Node';
        if (c.peerId === peerId) {
          clientLabel += ' (YOU)';
        }
        tree += ` │\n${connector}${clientLabel}\n`;
      });
    }
    mapEl.textContent = tree;
  }

  function setupSocket() {
    mainSocket = io({ query: { page: 'session' }, transports: ['websocket'] });
    registerNavigateListener(mainSocket, {
      beforeNavigate: (data) => {
        const to = data?.to || '';
        if (to.includes('receive-files') && mainSocket?.connected) {
          logToConsole('REDIRECTING TO FILE STREAM CHANNEL', 'info');
          mainSocket.emit('leave-main-page', { sessionId, peerId });
        }
      },
      onSamePage: (data) => {
        if (data?.message) setPageStatus(data.message, 'info', { duration: 6000 });
      },
    });

    mainSocket.on('connect', () => {
      logToConsole('ESTABLISHED SOCKET CONNECTION TO SIGNAL SERVER', 'success');
      document.getElementById('sendBtn').disabled = true;
      mainSocket.emit('join-session', { sessionId, role, peerId, deviceName });
      mainSocket.emit('enter-main-page', { sessionId, peerId, role });
      fetchHistory();
    });

    let previousPeers = [];
    mainSocket.on('peers-updated', (peers) => {
      const activePeers = peers.filter(p => !p.isDisconnected);
      const totalDevices = activePeers.length;
      const otherPeers = activePeers.filter(p => p.peerId !== peerId);
      const otherDeviceCount = otherPeers.length;
      const hadClient = previousPeers.some(p => p.role === 'client' && !p.isDisconnected);
      
      const statusSpan = document.getElementById('devicesStatus').querySelector('span');
      if (statusSpan) {
        statusSpan.textContent = `${totalDevices} NODE(S) [${otherDeviceCount} REMOTE]`;
      }
      
      // Update ASCII map
      updateTopologyMap(activePeers);

      // Console logger comparison
      peers.forEach(p => {
        const wasActive = previousPeers.some(prev => prev.peerId === p.peerId && !prev.isDisconnected);
        const isActive = !p.isDisconnected;
        if (isActive && !wasActive) {
          logToConsole(`NODE_JOINED: ${p.deviceName || 'Unknown'} [${p.role.toUpperCase()}]`, 'success');
        } else if (!isActive && wasActive) {
          logToConsole(`NODE_LEFT: ${p.deviceName || 'Unknown'}`, 'warning');
        }
      });
      previousPeers = peers;
      
      // Check if host is in main page
      const hostPeer = peers.find(p => p.role === 'host');
      hostInMainPage = hostPeer !== undefined && (hostPeer.page === 'session' || hostPeer.isMainPage === true || hostPeer.inMain === true);
      
      const transferStatus = document.getElementById('transfer-status');
      if (hostInMainPage) {
        transferStatus.textContent = 'Ready to send files. Receiving is automatic.';
        document.getElementById('sendBtn').disabled = otherDeviceCount === 0;
        
        if (role === 'host' && otherDeviceCount === 0 && hadClient) {
          setTimeout(async () => {
            try {
              const resp = await fetch(`/api/session-details/${sessionId}`);
              if (resp.ok) {
                const s = await resp.json();
                if ((s.peerCount || 0) <= 1) {
                  if (!confirm('You are alone in this session. Do you want to end the session?')) {
                    window.location.href = '/';
                  } else {
                    await fetch('/api/shutdown', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ force: true, sessionId, peerId }),
                    });
                    window.location.href = '/';
                  }
                }
              }
            } catch (err) {}
          }, 1000);
        }
        
        if (otherDeviceCount === 0) {
          transferStatus.textContent = role === 'host'
            ? 'No other devices connected. Waiting for network nodes...'
            : 'No other devices connected. The host has gone offline.';
          document.getElementById('sendBtn').disabled = true;
        }
      } else {
        transferStatus.textContent = 'Waiting for host to connect. Please wait...';
        document.getElementById('sendBtn').disabled = true;
      }
    });

    mainSocket.on('history-updated', (history) => {
      logToConsole(`AUDIT_LOG_UPDATED: ${history.length} active records`, 'info');
      renderHistory(history);
    });

    async function fetchHistory() {
      try {
        const resp = await fetch(`/api/session-history/${sessionId}`);
        if (!resp.ok) throw new Error('Failed to retrieve history');
        const history = await resp.json();
        renderHistory(history);
      } catch (err) {
        console.error('Failed to fetch history:', err);
      }
    }

    function renderHistory(history) {
      const table = document.getElementById('history-table');
      const body = document.getElementById('history-body');
      const empty = document.getElementById('history-empty');
      const countLabel = document.getElementById('history-count');
      if (!body) return;

      const myItems = history.filter(
        (item) => item.sender === peerId || (item.recipients || []).includes(peerId)
      );

      if (countLabel) {
        countLabel.textContent = `${myItems.length} ${myItems.length === 1 ? 'ENTRY' : 'ENTRIES'}`;
      }

      if (myItems.length === 0) {
        if (table) table.style.display = 'none';
        if (empty) empty.style.display = 'block';
        return;
      }

      if (table) table.style.display = 'table';
      if (empty) empty.style.display = 'none';

      body.innerHTML = myItems
        .map((item) => {
          const isSender = item.sender === peerId;
          const dirIcon = isSender ? '↑' : '↓';
          const dirText = isSender ? 'Up' : 'Down';
          const dirColor = isSender ? '#06b6d4' : '#10b981';
          
          let timeStr = '—';
          if (item.timestamp) {
            const d = new Date(item.timestamp);
            if (!isNaN(d.getTime())) {
              timeStr = d.toTimeString().split(' ')[0];
            }
          }

          const statusStr = (item.status || 'pending').toLowerCase();
          const statusClass = statusStr === 'success' || statusStr === 'completed' ? 'ok' : (statusStr === 'failed' ? 'err' : 'warn');

          return `
            <tr>
              <td class="col-n" title="${escapeHtml(item.fileName)}">${escapeHtml(item.fileName)}</td>
              <td class="col-s">${formatFileSize(item.fileSize)}</td>
              <td>
                <span style="color: ${dirColor}; font-family: var(--font-mono); font-weight: bold; font-size: 0.8rem;">
                  ${dirIcon} ${dirText}
                </span>
              </td>
              <td class="col-t">${escapeHtml(timeStr)}</td>
              <td>
                <span class="pill ${statusClass}">
                  ${statusStr.toUpperCase()}
                </span>
              </td>
            </tr>
          `;
        })
        .join('');
    }
    
    mainSocket.on('send-button-locked', (data) => {
      logToConsole(`TRANSMISSION LOCK ENGAGED BY ${data.lockedBy || 'ANOTHER NODE'}`, 'warning');
      const sendButton = document.getElementById('sendBtn');
      if (sendButton) {
        sendButton.disabled = true;
        sendButton.textContent = '[ SEND (LOCKED) ]';
      }
      const lockStatus = document.getElementById('sendLockStatus');
      if (lockStatus) {
        lockStatus.style.display = 'flex';
        lockStatus.querySelector('.lock-message').textContent = `Send button locked by ${data.lockedBy || 'another user'}`;
      }
    });

    mainSocket.on('send-button-unlocked', () => {
      logToConsole('TRANSMISSION LOCK RELEASED', 'success');
      const sendButton = document.getElementById('sendBtn');
      if (sendButton) {
        sendButton.disabled = false;
        sendButton.textContent = '[ SEND FILES ]';
      }
      const lockStatus = document.getElementById('sendLockStatus');
      if (lockStatus) {
        lockStatus.style.display = 'none';
      }
    });

    mainSocket.on('host-navigation-blocked', (data) => {
      logToConsole('HOST NAVIGATION BLOCKED: ACTIVE CONDUITS EXIST', 'error');
      showNotification(data.message || 'Navigation blocked while others are connected.', 'warning');
      const navBlockedIndicator = document.getElementById('hostNavigationBlocked');
      if (navBlockedIndicator) {
        navBlockedIndicator.style.display = 'flex';
        navBlockedIndicator.querySelector('.lock-message').textContent = `Navigation blocked - ${data.connectedPeers || 0} user(s) connected`;
      }
      if (role === 'host') {
        window.history.pushState(null, '', window.location.href);
      }
    });

    mainSocket.on('host-navigation-allowed', (data) => {
      logToConsole('HOST NAVIGATION ALLOWED: CONDUITS DISSOLVED', 'success');
      showNotification(data.message || 'All peers disconnected. You can leave now.', 'info');
      const navBlockedIndicator = document.getElementById('hostNavigationBlocked');
      if (navBlockedIndicator) {
        navBlockedIndicator.style.display = 'none';
      }
    });
    
    mainSocket.on('transfer-unlocked', () => {
      logToConsole('CHANNEL UNLOCKED: TRANSFERS IDLE', 'success');
      const transferStatus = document.getElementById('transfer-status');
      transferStatus.className = 'status-message status-success';
      document.getElementById('response-timer').style.display = 'none';
      
      if (hostInMainPage) {
        transferStatus.textContent = 'Ready to send files. Receiving is automatic.';
        const sendButton = document.getElementById('sendBtn');
        if (sendButton) {
          sendButton.disabled = false;
          sendButton.textContent = '[ SEND FILES ]';
        }
      } else {
        transferStatus.textContent = 'Waiting for host to connect. Please wait...';
        const sendButton = document.getElementById('sendBtn');
        if (sendButton) {
          sendButton.disabled = true;
          sendButton.textContent = '[ SEND FILES ]';
        }
      }
      const lockStatus = document.getElementById('sendLockStatus');
      if (lockStatus) lockStatus.style.display = 'none';
    });

    mainSocket.on('return-all-to-main', () => {
      logToConsole('SENDER CANCELLED. RETURNING NETWORK TO DASHBOARD.', 'warning');
      window.location.href = `/session.html?session=${sessionId}&role=${role}&peerId=${peerId}`;
    });

    mainSocket.on('session-ended', () => {
      logToConsole('SESSION TERMINATED BY HOST', 'error');
      alert('This session has ended. Redirecting...');
      try { window.close(); } catch (e) {}
    });
    
    mainSocket.on('response-timer-started', (data) => {
      logToConsole(`WAITING FOR RESPONSES: ${data.duration || 30}s`, 'warning');
      const timerContainer = document.getElementById('response-timer');
      const countdownElement = document.getElementById('countdown');
      const responseCountElement = document.getElementById('response-count');
      const totalReceiversElement = document.getElementById('total-receivers');
      
      countdownElement.textContent = String(data.duration || 30);
      responseCountElement.textContent = '0';
      totalReceiversElement.textContent = data.totalReceivers;
      timerContainer.style.display = 'block';
      
      if (window.responseTimerInterval) clearInterval(window.responseTimerInterval);
      let secondsLeft = data.duration || 30;
      window.responseTimerInterval = setInterval(() => {
        secondsLeft--;
        countdownElement.textContent = secondsLeft;
        if (secondsLeft <= 0) {
          clearInterval(window.responseTimerInterval);
        }
      }, 1000);
    });
    
    mainSocket.on('response-count-updated', (data) => {
      const responseCountElement = document.getElementById('response-count');
      if (responseCountElement) responseCountElement.textContent = data.totalResponses;
      if (data.totalResponses >= data.totalReceivers) {
        document.getElementById('response-timer').style.display = 'none';
        if (window.responseTimerInterval) {
          clearInterval(window.responseTimerInterval);
          window.responseTimerInterval = null;
        }
      }
    });

    mainSocket.on('session-invalidated', (data) => {
      logToConsole('SESSION KEY REFRESHED / INVALIDATED', 'error');
      alert('Session has been invalidated. The host created a new one.');
      window.location.href = role === 'host' ? '/' : `/session-ended.html?session=${sessionId}&role=${role}`;
    });
    
    mainSocket.on('peer-removed', (data) => {
      if (data.removedPeerId === peerId) {
        logToConsole(`KICKED FROM SESSION: ${data.reason || 'Unknown'}`, 'error');
        alert(`You have been removed from the session: ${data.reason || 'Unknown reason'}`);
        window.location.href = role === 'host' ? '/' : `/session-ended.html?session=${sessionId}&role=${role}`;
      }
    });

    mainSocket.on('server-shutdown', () => {
      logToConsole('SERVER SHUTDOWN DETECTED', 'error');
      alert('Session has been ended by the host. This tab will attempt to close.');
      try { window.close(); } catch (e) {}
    });

    mainSocket.on('error', (data) => {
      if (data?.message === 'Session not found') {
        alert('This session does not exist or has expired.');
        window.location.href = role === 'host' ? '/' : `/session-ended.html?session=${sessionId}&role=${role}`;
      }
    });

    mainSocket.on('disconnect', () => {
      logToConsole('DISCONNECTED FROM SIGNAL SERVER', 'error');
    });
  }

  function setupEventListeners() {
    document.getElementById('sendBtn').addEventListener('click', () => {
      if (!hostInMainPage) {
        showNotification('Wait for the host node to connect.', 'warning');
        return;
      }
      
      if (mainSocket && mainSocket.connected) {
        mainSocket.emit('request-send-lock', { sessionId, senderId: peerId }, (lockRes) => {
          if (lockRes && lockRes.ok) {
            mainSocket.emit('prepare-receivers', { sessionId, senderId: peerId }, () => {
              if (role === 'host') {
                mainSocket.emit('leave-main-page', { sessionId, peerId, reason: 'auto_redirect_to_send' });
              } else {
                mainSocket.emit('leave-main-page', { sessionId, peerId });
              }
              try { 
                sessionStorage.setItem(`allow_reload_send_${sessionId}`, '1');
              } catch (_) {}
              window.location.href = `/send-files.html?session=${sessionId}&role=${role}&peerId=${peerId}`;
            });
          } else {
            showNotification(lockRes.message || 'Send button is currently locked.', 'warning');
          }
        });
      } else {
        showNotification('Not connected.', 'warning');
      }
    });

    document.getElementById('historyBtn').addEventListener('click', () => {
      window.location.href = `/history.html?session=${sessionId}&role=${role}`;
    });
    
    document.getElementById('exitBtn').addEventListener('click', () => {
      if (!confirm('Are you sure you want to exit the session?')) return;
      
      if (role === 'client') {
        removeDeviceName();
        if (mainSocket && mainSocket.connected) {
          mainSocket.emit('leave-main-page', { sessionId, peerId });
          mainSocket.emit('leave-session', { sessionId, peerId }, () => {
            try { mainSocket.disconnect(); } catch (_) {}
            window.location.href = `/session-ended.html?session=${sessionId}&role=${role}`;
          });
        } else {
          window.location.href = `/session-ended.html?session=${sessionId}&role=${role}`;
        }
      } else {
        if (mainSocket) {
          mainSocket.emit('leave-main-page', { sessionId, peerId, reason: 'host_exit_session' });
          try { mainSocket.disconnect(); } catch (_) {}
        }
        window.location.href = '/?forceNew=1';
      }
    });
  }

  setupSocket();
  setupEventListeners();
});
