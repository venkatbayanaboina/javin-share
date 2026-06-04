import '../core/index.js';
import {
  getPeerId,
  getUrlParameter,
  escapeHtml,
  formatFileSize,
  showError,
} from '../core/index.js';

document.addEventListener('DOMContentLoaded', () => {
  if (!window.FileShareUtils) {
    document.body.innerHTML = `<div class='container'><div class='error'><h2>Critical Error</h2><p>Core script failed to load.</p></div></div>`;
    return;
  }

  const sessionId = getUrlParameter('session');
  const role = getUrlParameter('role');
  const peerId = getPeerId();

  if (!sessionId) {
    return showError('No active session ID provided.');
  }

  const backBtn = document.getElementById('back-btn');
  backBtn.addEventListener('click', () => {
    window.location.href = `/session.html?session=${sessionId}&role=${role}&peerId=${peerId}`;
  });

  async function fetchHistory() {
    try {
      const resp = await fetch(`/api/session-history/${sessionId}`);
      if (!resp.ok) throw new Error('Failed to retrieve history');
      const history = await resp.json();
      renderHistory(history);
    } catch (err) {
      console.error(err);
      const body = document.getElementById('audit-logs-body');
      body.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; padding: 40px 0; color: var(--color-brand-danger);">
            FAILED TO RETRIEVE AUDIT LOGS FROM HOST
          </td>
        </tr>
      `;
    }
  }

  function renderHistory(history) {
    const body = document.getElementById('audit-logs-body');
    const countLabel = document.getElementById('record-count');

    // Show only items I sent or I personally received
    const myItems = history.filter(
      (item) => item.sender === peerId || (item.recipients || []).includes(peerId)
    );

    countLabel.textContent = `${myItems.length} ${myItems.length === 1 ? 'ENTRY' : 'ENTRIES'}`;

    if (myItems.length === 0) {
      body.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; padding: 40px 0; color: var(--color-text-muted); font-style: italic;">
            NO TRANSMISSION RECORDS FOUND FOR THIS NODE
          </td>
        </tr>
      `;
      return;
    }

    body.innerHTML = myItems
      .map((item) => {
        const isSender = item.sender === peerId;
        const directionStr = isSender ? 'OUTGOING' : 'INCOMING';
        const directionColor = isSender ? 'var(--color-brand-primary)' : 'var(--color-brand-success)';
        
        // Simple timestamp format: hh:mm:ss
        let timeStr = '—';
        if (item.timestamp) {
          const d = new Date(item.timestamp);
          if (!isNaN(d.getTime())) {
            timeStr = d.toTimeString().split(' ')[0];
          }
        }

        const statusStr = (item.status || 'pending').toUpperCase();
        const statusColor =
          statusStr === 'COMPLETED' || statusStr === 'SUCCESS'
            ? 'var(--color-brand-success)'
            : statusStr === 'FAILED'
            ? 'var(--color-brand-danger)'
            : 'var(--color-brand-warning)';

        return `
          <tr style="border-bottom: 1px solid rgba(255,255,255,0.04); font-family: var(--font-family-mono);">
            <td style="padding: 12px 8px; color: var(--color-text-secondary);">${escapeHtml(timeStr)}</td>
            <td style="padding: 12px 8px; color: ${directionColor}; font-weight: 600;">${directionStr}</td>
            <td style="padding: 12px 8px; color: var(--color-text-primary); font-weight: 500; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              ${escapeHtml(item.fileName)}
            </td>
            <td style="padding: 12px 8px; text-align: right; color: var(--color-text-secondary);">${formatFileSize(item.fileSize)}</td>
            <td style="padding: 12px 8px; text-align: right; color: ${statusColor}; font-weight: 600; font-size: 0.8rem;">[ ${statusStr} ]</td>
          </tr>
        `;
      })
      .join('');
  }

  fetchHistory();
});
