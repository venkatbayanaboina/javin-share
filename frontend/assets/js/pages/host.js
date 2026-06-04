import '../core/index.js';
import { registerNavigateListener } from '../core/navigate.js';
import { mountGraceCountdown, mountPinCountdown, syncGraceFromApi } from '../core/grace-timer.js';
import {
  getPeerId,
  getDeviceName,
  setDeviceName,
  removeDeviceName,
  clearAllExitedFlags,
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

async function copyTextToClipboard(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      window.FileShareUtils?.showNotification?.('URL copied to clipboard!', 'success');
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px';
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      window.FileShareUtils?.showNotification?.(ok ? 'URL copied!' : 'Copy failed — select manually.', ok ? 'success' : 'error');
    }
  } catch (e) {
    console.error('Copy failed:', e);
  }
}

    document.addEventListener('DOMContentLoaded', async () => {
      if (!window.FileShareUtils) {
        document.body.innerHTML = `<div class='container'><div class='error'><h2>Critical Error</h2><p>Core script (script.js) failed to load. Please refresh the page.</p></div></div>`;
        return;
      }

      const sid = getUrlParameter('session');
      const role = getUrlParameter('role');
      
      // Additional validation for non-host access
      if (role && role !== 'host') {
        document.body.innerHTML = `
          <div class="wrap" style="display: flex; align-items: center; justify-content: center; min-height: 100vh; box-sizing: border-box; padding: 20px;">
            <div class="card card-accent-rose" style="max-width: 440px; width: 100%; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 18px; padding: 36px 28px; box-sizing: border-box;">
              <div style="font-size: 2.2rem; width: 64px; height: 64px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: rgba(244,63,94,0.12); border: 1px solid rgba(244,63,94,0.28); margin-bottom: 6px; animation: orb-pulse 2.6s ease-in-out infinite;">🔒</div>
              <h2 style="font-family: var(--font-sans); font-size: 1.4rem; font-weight: 700; color: #fff; margin: 0; letter-spacing: -0.01em;">Access Denied</h2>
              <p style="font-family: var(--font-sans); font-size: 0.9rem; color: var(--sub); margin: 0; line-height: 1.5;">Only hosts can access this page. Please scan the QR code to join as a client.</p>
              <button onclick="window.location.href='/'" class="btn-primary" style="width: 100%; height: 46px; font-size: 0.95rem; font-weight: 700; margin-top: 8px;" type="button">Return to Main</button>
            </div>
          </div>
        `;
        return;
      }
      
      // Validate session exists if session parameter provided
      if (sid) {
        try {
          const res = await fetch(`/api/session-details/${sid}`);
          if (!res.ok) {
            document.body.innerHTML = `
              <div class="wrap" style="display: flex; align-items: center; justify-content: center; min-height: 100vh; box-sizing: border-box; padding: 20px;">
                <div class="card card-accent-rose" style="max-width: 440px; width: 100%; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 18px; padding: 36px 28px; box-sizing: border-box;">
                  <div style="font-size: 2.2rem; width: 64px; height: 64px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: rgba(244,63,94,0.12); border: 1px solid rgba(244,63,94,0.28); margin-bottom: 6px; animation: orb-pulse 2.6s ease-in-out infinite;">⚠️</div>
                  <h2 style="font-family: var(--font-sans); font-size: 1.4rem; font-weight: 700; color: #fff; margin: 0; letter-spacing: -0.01em;">Session Expired</h2>
                  <p style="font-family: var(--font-sans); font-size: 0.9rem; color: var(--sub); margin: 0; line-height: 1.5;">This session does not exist or has expired. Please start a new session.</p>
                  <button onclick="window.location.href='/'" class="btn-primary" style="width: 100%; height: 46px; font-size: 0.95rem; font-weight: 700; margin-top: 8px;" type="button">Start New Session</button>
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
      }
      if (!window.FileShareUtils) {
        document.body.innerHTML = `<div class='container'><div class='error'><h2>Critical Error</h2><p>Core script (script.js) failed to load. Please refresh the page.</p></div></div>`;
        return;
      }

      const { getPeerId, showError, showNotification } = window.FileShareUtils;

      let hostSocket;
      let sessionData = null;
      const peerId = getPeerId();
      let pinTimerInterval;
      let nonHostCount = 0;
      let lastClientSeenAt = 0;
      let isRestoringGraceTimer = false;

      async function init() {
        try {
          // Clear any old session data when starting fresh
          console.log('=== INIT FUNCTION CALLED ===');
          console.log('Clearing old session data...');
          
          clearAllExitedFlags();
          
          // Check if there's a session parameter in URL
          const urlParams = new URLSearchParams(window.location.search);
          const sessionParam = urlParams.get('session');
          
          let url;
          if (sessionParam) {
            // If session parameter exists, try to get that specific session
            url = `/get-current-session?session=${sessionParam}`;
          } else {
            // If no session parameter, check if we're refreshing or need a new session
            const isRefresh = performance?.navigation?.type === performance?.navigation?.TYPE_RELOAD;
            // Only force new if it's explicitly requested via URL parameter
            const forceNewParam = urlParams.get('forceNew') === '1';
            
            if (isRefresh) {
              // Page refresh - get current session
              url = "/get-current-session?refresh=1";
            } else {
              // No session parameter and not refresh - create NEW session
              // Use forceNew=1 to ensure a fresh session is created
              url = "/get-current-session?forceNew=1";
            }
          }
          
          const resp = await fetch(url);
          if (!resp.ok) {
              const errData = await resp.json();
              throw new Error(errData.error || "Failed to get session from server");
          }
          sessionData = await resp.json();
          
          console.log('=== BACKEND RESPONSE DEBUG ===');
          console.log('Response URL:', url);
          console.log('Response status:', resp.status);
          console.log('Session data:', sessionData);
          
          // Check if this is a new session or existing session
          if (url.includes('forceNew=1')) {
            console.log('🆕 NEW SESSION CREATED (forceNew=1)');
            // Don't start grace timer until a client actually joins
            console.log('New session created - waiting for clients to join before starting grace timer');
          } else if (url.includes('refresh=1')) {
            console.log('🔄 EXISTING SESSION REUSED (refresh=1)');
          } else if (url.includes('session=')) {
            console.log('📋 SPECIFIC SESSION REQUESTED');
          } else {
            console.log('❓ UNKNOWN SESSION REQUEST TYPE');
          }
          
          // Connect to socket immediately so we can receive grace timer events
          console.log('Connecting to socket immediately for grace timer events');
          console.log('New session ID:', sessionData.sessionId);
          setupSocket(sessionData.sessionId);
          
          // Restore grace UI from server state after refresh (no localStorage)
          setTimeout(async () => {
            try {
              window.graceController = await syncGraceFromApi(sessionData.sessionId, {
                labelEl: document.getElementById('grace-countdown'),
                panelEl: document.getElementById('grace-controls'),
              });
            } catch (e) {
              console.error('Error syncing grace timer from server:', e);
            }
          }, 600);
          
          // Check if device name already exists locally
          const existingDeviceName = getDeviceName();
          const isRefresh = performance?.navigation?.type === performance?.navigation?.TYPE_RELOAD;
          const forceNew = urlParams.get('forceNew') === '1';
          
          console.log('=== DEVICE NAME CHECK DEBUG ===');
          console.log('Existing device name:', existingDeviceName);
          console.log('Is refresh:', isRefresh);
          console.log('Force new:', forceNew);
          console.log('URL params:', window.location.search);
          
          if (existingDeviceName) {
            // Device name exists - always reuse it (regardless of forceNew)
            console.log('✅ Device name found locally:', existingDeviceName);
            console.log('✅ Reusing existing device name - going directly to session');
            document.getElementById("loading").style.display = "none";
            // Join session immediately with existing device name
            joinSessionWithDeviceName(sessionData.sessionId, existingDeviceName);
          } else {
            // No device name - show input form
            console.log('❌ No device name found - showing device name input');
            document.getElementById("loading").style.display = "none";
            document.getElementById("device-name-section").style.display = "block";
          }
        } catch (err) {
          console.error(err);
          showError("Couldn't create session: " + err.message);
        }
      }
      
      // Function to join session with existing device name
      function joinSessionWithDeviceName(sessionId, deviceName) {
        console.log('Joining session with existing device name:', deviceName);
        // Store device name if not already stored
        setDeviceName(deviceName);
        
        // Update device name in session (host is already joined)
        if (hostSocket && hostSocket.connected) {
          hostSocket.emit('update-device-name', { sessionId, deviceName });
        } else {
          console.log('Socket not connected yet, device name will be updated when connected');
        }
        
        // Display the session
        displaySession(sessionData);
        
          // Do not restore grace timer here; wait for server event after PIN verification
      }
        
      function displaySession(s) {
        const rawPin = s.pin || "000000";
        const formattedPin = rawPin.length === 6 ? `${rawPin.slice(0, 3)} · ${rawPin.slice(3)}` : rawPin;
        document.getElementById("session-pin").textContent = formattedPin;
        document.getElementById("qr-code").src = s.qrDataUrl || "";
        document.getElementById("connection-url").textContent = s.url || "Loading...";

        // Show .local mDNS URL row if server provided one
        const localUrlEl = document.getElementById('connection-local-url');
        const localUrlRow = document.getElementById('local-url-row');
        if (s.localUrl && localUrlEl && localUrlRow) {
          localUrlEl.textContent = s.localUrl;
          localUrlRow.style.display = 'flex';
        } else if (localUrlRow) {
          localUrlRow.style.display = 'none';
        }
        // Display the device name
        const deviceName = getDeviceName() || 'Unknown Device';
        document.querySelectorAll(".current-device-name-txt").forEach(el => {
          el.textContent = deviceName;
        });
        document.getElementById("loading").style.display = "none";
        document.getElementById("device-name-section").style.display = "none";
        document.getElementById("host-section").style.display = "block";
        
                  // Check if there's a saved PIN timer to restore
          try {
            startPinTimer(s.pinExpiry);
          } catch (_) {
            startPinTimer(s.pinExpiry);
          }
      }

      let pinCountdownController = null;

      function startPinTimer(pinExpiryMs) {
        pinCountdownController?.stop();
        const timerEl = document.getElementById('pin-timer');
        pinCountdownController = mountPinCountdown({
          pinExpiryMs,
          labelEl: timerEl,
          onExpired: () => {
            if (timerEl) timerEl.textContent = 'PIN expired. Refreshing...';
            setTimeout(() => location.reload(), 2000);
          },
        });
      }


      
      function applyGraceCountdown(data) {
        window.graceController?.stop();
        window.graceController = mountGraceCountdown({
          graceEndMs: data?.graceEndMs,
          durationSeconds: data?.durationSeconds,
          sessionId: data?.sessionId || sessionData?.sessionId,
          labelEl: document.getElementById('grace-countdown'),
          panelEl: document.getElementById('grace-controls'),
        });
      }

      window.startGraceTimer = function (durationSeconds, sessionId) {
        applyGraceCountdown({ durationSeconds, sessionId });
      };
      
      // Function to handle extend button timeout (prevent stuck buttons)
      window.extendButtonTimeout = function(button) {
        setTimeout(() => {
          if (button && button.disabled) {
            button.disabled = false;
            button.textContent = '⏱️ Extend 30s';
            console.log('Extend button timeout - re-enabled');
          }
        }, 10000); // 10 second timeout
      }

      function setupSocket(sessionId) {
        console.log('=== SETUP SOCKET CALLED ===');
        console.log('Session ID:', sessionId);
        hostSocket = io({ transports: ['websocket'] });

        registerNavigateListener(hostSocket, {
          navigateDelayMs: 1500,
          beforeNavigate: (data) => {
            const to = data?.to || '';
            if (!to.includes('session.html')) return;
            showNotification('Device connected. Redirecting…', 'success', 3500);
            window.graceController?.stop();
            hostSocket.emit('host-going-to-main', { sessionId: sessionData?.sessionId });
            
            // State 3: Session Lock visual state transition
            const qrBlock = document.getElementById("qr-block");
            const statusPanel = document.getElementById("status-panel");
            const lockPanel = document.getElementById("lock-panel");
            const banner = document.getElementById("new-node-banner");
            if (qrBlock) qrBlock.classList.add("is-hidden");
            if (statusPanel) statusPanel.classList.add("is-hidden");
            if (banner) banner.classList.add("is-hidden");
            if (lockPanel) lockPanel.classList.remove("is-hidden");
          },
        });
        
        // Register event handlers IMMEDIATELY to avoid race conditions
        console.log('Registering event handlers immediately...');
        
        hostSocket.on('start-host-redirect-countdown', (data) => {
          console.log('Grace countdown from server:', data);
          applyGraceCountdown(data);
          const extendBtn = document.getElementById('extend-btn');
          if (extendBtn) {
            extendBtn.disabled = false;
            extendBtn.textContent = '⏱️ Extend 30s';
          }
          /* Grace countdown is shown in the host UI — no toast spam */
        });

        hostSocket.on('grace-timer-cleared', () => {
          console.log('Grace timer cleared by server');
          window.graceController?.stop();
          window.graceController = null;
        });

        // Handle server shutdown
        hostSocket.on('server-shutdown', () => {
          console.log('Server is shutting down - stopping all timers');
          
          // Stop PIN timer
          if (pinTimerInterval) {
            clearInterval(pinTimerInterval);
            pinTimerInterval = null;
          }
          
          window.graceController?.stop();
          window.graceController = null;

          // Update PIN timer display
          const pinTimerEl = document.getElementById('pin-timer');
          if (pinTimerEl) {
            pinTimerEl.textContent = "Server shutting down...";
          }
          
          // Hide grace controls
          const graceControls = document.getElementById('grace-controls');
          if (graceControls) {
            graceControls.style.display = 'none';
          }
          
          // Clean up localStorage
          try {
            removeDeviceName();
          } catch (_) {}
          
          // Show shutdown message
          showNotification('Session has been ended by the host. This tab will attempt to close.', 'warning');
          
          // Attempt to close tab after a delay
          setTimeout(() => {
            try { window.close(); } catch (e) {}
          }, 2000);
        });

        // Handle session ended
        hostSocket.on('session-ended', () => {
          console.log('Session ended - stopping all timers');
          
          // Stop PIN timer
          if (pinTimerInterval) {
            clearInterval(pinTimerInterval);
            pinTimerInterval = null;
          }
          
          window.graceController?.stop();
          window.graceController = null;

          // Update PIN timer display
          const pinTimerEl = document.getElementById('pin-timer');
          if (pinTimerEl) {
            pinTimerEl.textContent = "Session ended";
          }
          
          // Hide grace controls
          const graceControls = document.getElementById('grace-controls');
          if (graceControls) {
            graceControls.style.display = 'none';
          }
          
          window.graceController?.stop();
          pinCountdownController?.stop();

          // Show session ended message
          showNotification('Session has ended. Refreshing page...', 'info');
          
          // Refresh page after a delay
          setTimeout(() => {
            location.reload();
          }, 2000);
        });
        
        // Handle socket disconnect (server shutdown)
        hostSocket.on('disconnect', () => {
          console.log('Socket disconnected - server may have shut down');
          
          // Stop PIN timer
          if (pinTimerInterval) {
            clearInterval(pinTimerInterval);
            pinTimerInterval = null;
          }
          
          window.graceController?.stop();
          window.graceController = null;

          // Update PIN timer display
          const pinTimerEl = document.getElementById('pin-timer');
          if (pinTimerEl) {
            pinTimerEl.textContent = "Connection lost";
          }
          
          // Hide grace controls
          const graceControls = document.getElementById('grace-controls');
          if (graceControls) {
            graceControls.style.display = 'none';
          }
          
          // Show connection lost message
          showNotification('Connection to server lost. Server may have shut down.', 'error');
        });

        // Confirm when host successfully joins session
        hostSocket.on("session-joined", (data) => {
          console.log('🎯 HOST SESSION JOINED CONFIRMED');
          console.log('Session join data:', data);
          console.log('Socket ID:', hostSocket.id);
          console.log('Session ID:', sessionData?.sessionId);
        });
        
        hostSocket.on("connect", () => {
          console.log('🎯 HOST SOCKET CONNECTED');
          console.log('Socket ID:', hostSocket.id);
          console.log('Socket connected:', hostSocket.connected);
          console.log('Ready to receive grace timer events');
          console.log('About to join session:', sessionId);
          
          // Join session immediately to receive grace timer events
          const deviceName = getDeviceName() || 'Host Device';
          console.log('Joining session immediately with device name:', deviceName);
          hostSocket.emit('join-session', { 
            sessionId, 
            role: 'host', 
            peerId, 
            deviceName 
          });
          console.log('Join session event emitted');
          
          // Debug: Check if we can receive events
          console.log('🎯 SOCKET CONNECTION DEBUG:');
          console.log('Socket connected:', hostSocket.connected);
          console.log('Socket ID:', hostSocket.id);
          console.log('Grace controls element exists:', document.getElementById('grace-controls'));
          console.log('Grace countdown element exists:', document.getElementById('grace-countdown'));
        });
        
        hostSocket.on("disconnect", () => {
          console.log('=== HOST SOCKET DISCONNECTED ===');
        });
        
        hostSocket.on("connect_error", (error) => {
          console.error('=== SOCKET CONNECTION ERROR ===', error);
        });

        // Handle host-go-now response
        hostSocket.on("host-go-now-response", (data) => {
          console.log('Host go now response received:', data);
          if (data && data.ok) {
            showNotification("Redirecting to main page...", "success");
            // The backend emits navigate after this
          } else {
            showNotification(data?.message || "Failed to go to main page", "error");
          }
        });
        
        // Handle host-extend-redirect response
        hostSocket.on("host-extend-redirect-response", (data) => {
          console.log('Host extend redirect response received:', data);
          if (data && data.ok) {
            showNotification("Grace period extended by 30 seconds!", "success");
            // Re-enable the extend button
            const extendBtn = document.getElementById('extend-btn');
            if (extendBtn) {
              extendBtn.disabled = false;
              extendBtn.textContent = '⏱️ Extend 30s';
            }
          } else {
            showNotification(data?.message || "Failed to extend grace period", "error");
            // Re-enable the extend button on failure
            const extendBtn = document.getElementById('extend-btn');
            if (extendBtn) {
              extendBtn.disabled = false;
              extendBtn.textContent = '⏱️ Extend 30s';
            }
          }
        });
        

        


        let previousClients = [];
        hostSocket.on("peers-updated", (peers) => {
          console.log('Host received peers-updated:', peers);
          const clients = peers.filter(p => p.role !== "host");
          const clientCount = clients.length;
          nonHostCount = clientCount;
          
          if (clientCount > 0) {
            lastClientSeenAt = Date.now();
            
            // Reveal Connected Nodes panel
            const statusPanel = document.getElementById("status-panel");
            if (statusPanel) {
              statusPanel.classList.remove("is-hidden");
            }
          }
          
          // Render list of connected devices
          const listEl = document.getElementById("connected-nodes-list");
          if (listEl) {
            if (clientCount > 0) {
              listEl.innerHTML = clients.map(c => `
                <li style="margin-bottom: 6px; display: flex; align-items: center; gap: 8px;">
                  <span style="color: var(--color-brand-primary); font-weight: bold;">├─</span> ${escapeHtml(c.deviceName || 'Client Node')}
                </li>
              `).join('');
            } else {
              listEl.innerHTML = '<li style="color: var(--color-text-muted);">NO NODES CONNECTED</li>';
            }
          }
          
          // Trigger State 2 banner if a node joined
          const newJoined = clients.find(c => !previousClients.some(p => p.peerId === c.peerId));
          if (newJoined && previousClients.length === 0) {
            // First device joins!
            const banner = document.getElementById("new-node-banner");
            const nodeNameEl = document.getElementById("new-node-name");
            if (banner && nodeNameEl) {
              nodeNameEl.textContent = newJoined.deviceName || "Client Node";
              banner.classList.remove("is-hidden");
              setTimeout(() => {
                banner.classList.add("is-hidden");
              }, 2000);
            }
          }
          
          // Manage grace controls based on client count
          if (window.graceController) {
            const graceControls = document.getElementById('grace-controls');
            if (graceControls) {
              if (clientCount > 0) {
                graceControls.classList.remove('is-hidden');
              } else {
                graceControls.classList.add('is-hidden');
              }
            }
          }
          
          previousClients = clients;
        });
        
        // Handle response timer events
        hostSocket.on('response-timer-started', (data) => {
          console.log('Response timer started:', data);
          const timerContainer = document.getElementById('response-timer');
          const countdownElement = document.getElementById('countdown');
          const responseCountElement = document.getElementById('response-count');
          const totalReceiversElement = document.getElementById('total-receivers');
          
          // Set initial values
          countdownElement.textContent = '30';
          responseCountElement.textContent = '0';
          totalReceiversElement.textContent = data.totalReceivers;
          
          // Show timer container
          timerContainer.style.display = 'block';
          
          // Start countdown
          let secondsLeft = 30;
          const countdownInterval = setInterval(() => {
              secondsLeft--;
              countdownElement.textContent = secondsLeft;
              
              if (secondsLeft <= 0) {
                  clearInterval(countdownInterval);
                  // Timer will be hidden when we receive response-count-updated with all responses
              }
          }, 1000);
          
          // Store interval ID to clear it if needed
          window.responseTimerInterval = countdownInterval;
        });
        
        hostSocket.on('response-count-updated', (data) => {
          console.log('Response count updated:', data);
          const responseCountElement = document.getElementById('response-count');
          responseCountElement.textContent = data.totalResponses;
          
          // If all receivers have responded, hide the timer
          if (data.totalResponses >= data.totalReceivers) {
              document.getElementById('response-timer').style.display = 'none';
              
              // Clear interval if it exists
              if (window.responseTimerInterval) {
                  clearInterval(window.responseTimerInterval);
                  window.responseTimerInterval = null;
              }
          }
        });

        // Grace timer is now handled in setupSocket function to work before device name is entered

        // If sender cancels or exits, return host to main page
        hostSocket.on('return-all-to-main', () => {
          console.log('Host: Returning to main page due to sender cancellation');
          window.location.href = `/session.html?session=${sessionData?.sessionId}&role=host`;
        });

        // When transfer is unlocked (completed, timed out, etc.), return host to main only if they have clients
        hostSocket.on('transfer-unlocked', () => {
          console.log('Host: Transfer unlocked');
          // Only redirect if there are clients connected (nonHostCount > 0)
          if (nonHostCount > 0) {
            console.log('Host: Transfer unlocked, returning to main page');
            window.location.href = `/session.html?session=${sessionData?.sessionId}&role=host`;
          } else {
            console.log('Host: Transfer unlocked but no clients connected, staying on index page');
          }
        });
      }

      document.getElementById("copy-url-btn").addEventListener("click", async () =>
        copyTextToClipboard(document.getElementById("connection-url").textContent)
      );

      // Copy .local URL button
      const copyLocalBtn = document.getElementById('copy-local-url-btn');
      if (copyLocalBtn) {
        copyLocalBtn.addEventListener('click', async () =>
          copyTextToClipboard(document.getElementById('connection-local-url').textContent)
        );
      }

      document.getElementById('shutdown-btn').addEventListener('click', async () => {
        if (!confirm('End the session for everyone?')) return;
        try {
          // Clear device name when shutting down
          removeDeviceName();
          // Inform clients to show message and try closing tabs
          const sid = sessionData?.sessionId;
          try { hostSocket?.emit('announce-shutdown', { sessionId: sid, peerId }); } catch (e) {}
          const resp = await fetch('/api/shutdown', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ force: true, sessionId: sid, peerId }),
          });
          if (resp.ok) {
            alert('Session has been ended. Redirecting...');
            try { window.close(); } catch (e) {}
            window.location.href = '/';
          } else {
            showNotification('Failed to end session.', 'error');
          }
        } catch (e) {
          showNotification('Error ending session.', 'error');
        }
      });

      // Host controls: go now or extend grace period
      document.getElementById('go-now-btn').addEventListener('click', () => {
        console.log('Go to Main button clicked');
        console.log('nonHostCount:', nonHostCount);
        console.log('hostSocket connected:', hostSocket?.connected);
        console.log('sessionData:', sessionData);
        
        // Check if socket is connected
        if (!hostSocket || !hostSocket.connected) {
          showNotification('Not connected to server. Please wait...', 'error');
          return;
        }
        
        // Check if session data exists
        if (!sessionData || !sessionData.sessionId) {
          showNotification('Session data not available. Please refresh the page.', 'error');
          return;
        }
        
        if (nonHostCount <= 0) {
          showNotification('No clients connected yet. Please wait.', 'warning');
          return;
        }
        
        // Disable button to prevent multiple clicks
        const goNowBtn = document.getElementById('go-now-btn');
        goNowBtn.disabled = true;
        goNowBtn.textContent = 'Redirecting...';
        
        try { 
          console.log('Emitting host-go-now with sessionId:', sessionData.sessionId);
          hostSocket.emit('host-go-now', { sessionId: sessionData.sessionId }, (ack) => {
            console.log('host-go-now response:', ack);
            if (!ack || !ack.ok) {
              showNotification(ack?.message || 'No clients connected yet. Please wait.', 'warning');
              // Re-enable button on failure
              goNowBtn.disabled = false;
              goNowBtn.textContent = 'Go Now →';
            }
          }); 
        } catch (e) {
          console.error('Error emitting host-go-now:', e);
          showNotification('Error sending request. Please try again.', 'error');
          // Re-enable button on error
          goNowBtn.disabled = false;
          goNowBtn.textContent = 'Go Now →';
        }
      });
      document.getElementById('extend-btn').addEventListener('click', () => {
        console.log('Extend button clicked');
        console.log('hostSocket connected:', hostSocket?.connected);
        console.log('sessionData:', sessionData);
        
        // Check if socket is connected
        if (!hostSocket || !hostSocket.connected) {
          showNotification('Not connected to server. Please wait...', 'error');
          return;
        }
        
        // Check if session data exists
        if (!sessionData || !sessionData.sessionId) {
          showNotification('Session data not available. Please refresh the page.', 'error');
          return;
        }
        
        // Check if grace timer is running
        if (!window.graceController) {
          showNotification('No grace timer running to extend.', 'warning');
          return;
        }
        
        // Disable button to prevent multiple clicks
        const extendBtn = document.getElementById('extend-btn');
        extendBtn.disabled = true;
        extendBtn.textContent = 'Extending...';
        
        // Set timeout to re-enable button if no response
        extendButtonTimeout(extendBtn);
        
        try { 
          console.log('Emitting host-extend-redirect with sessionId:', sessionData.sessionId);
          hostSocket.emit('host-extend-redirect', { sessionId: sessionData.sessionId }, (ack) => {
            console.log('host-extend-redirect response:', ack);
            if (!ack || !ack.ok) {
              showNotification(ack?.message || 'Failed to extend grace period', 'error');
              // Re-enable button on failure
              extendBtn.disabled = false;
              extendBtn.textContent = '⏱️ Extend 30s';
            }
          }); 
        } catch (e) {
          console.error('Error emitting host-extend-redirect:', e);
          showNotification('Error sending request. Please try again.', 'error');
          // Re-enable button on error
          extendBtn.disabled = false;
          extendBtn.textContent = '⏱️ Extend 30s';
        }
      });
      
      // Reset device name button
      document.getElementById('reset-device-name-btn').addEventListener('click', () => {
        if (confirm('Change your device name? This will require you to enter a new name.')) {
          try {
            removeDeviceName();
            // Show device name input section again
            document.getElementById("host-section").style.display = "none";
            document.getElementById("device-name-section").style.display = "block";
            // Clear the input field
            document.getElementById("device-name-input").value = "";
            // Focus on the input
            document.getElementById("device-name-input").focus();
          } catch (_) {}
        }
      });

      // Device name input handling
      document.getElementById('continue-btn').addEventListener('click', () => {
        const deviceNameInput = document.getElementById('device-name-input');
        const deviceName = deviceNameInput.value.trim();
        
        if (!deviceName) {
          showNotification('Please enter a device name', 'error');
          deviceNameInput.focus();
          return;
        }
        
        if (deviceName.length > 30) {
          showNotification('Device name must be 30 characters or less', 'error');
          deviceNameInput.focus();
          return;
        }
        
        // Clear any existing device name and save new one
        try {
          removeDeviceName();
          setDeviceName(deviceName);
        } catch (_) {}
        
        // Update the display immediately
        updateDeviceNameDisplay(deviceName);
        
        // Show session
        displaySession(sessionData);
        
                                    // Update device name in session (host is already joined)
          if (hostSocket && hostSocket.connected) {
            console.log('Updating device name in session:', deviceName);
            hostSocket.emit("update-device-name", { 
              sessionId: sessionData.sessionId, 
              deviceName: deviceName 
            });
            
            // Check if there's a pending grace timer to replay
            if (window.pendingGraceTimer) {
              console.log('Replaying pending grace timer after updating device name:', window.pendingGraceTimer);
              const { durationSeconds, sessionId } = window.pendingGraceTimer;
              window.startGraceTimer(durationSeconds, sessionId);
              delete window.pendingGraceTimer;
            }
          } else {
            console.error('Socket not connected when trying to update device name');
          }
      });
      
      // Function to update device name display in real-time
      function updateDeviceNameDisplay(deviceName) {
        document.querySelectorAll(".current-device-name-txt").forEach(el => {
          el.textContent = deviceName;
        });
      }

      // Allow Enter key to submit device name
      document.getElementById('device-name-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          document.getElementById('continue-btn').click();
        }
      });

      // Debug: Check if grace controls exist and test their display
      console.log('Grace controls element exists:', document.getElementById('grace-controls'));
      console.log('Grace countdown element exists:', document.getElementById('grace-countdown'));
      

      
      init();
    });
