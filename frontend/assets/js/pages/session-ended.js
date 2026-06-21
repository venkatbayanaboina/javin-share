import { markSessionExited } from '../core/storage.js';

let role = 'client';

try {
  const params = new URLSearchParams(window.location.search);
  const sid = params.get('session');
  if (sid) markSessionExited(sid);

  if (params.get('role')) {
    role = params.get('role');
  }

  // Set metrics from URL if present
  const nodes = params.get('nodes');
  const files = params.get('files');
  const data = params.get('data');
  const duration = params.get('duration');

  if (nodes || files || data || duration) {
    const container = document.getElementById('metrics-summary-container');
    if (container) container.style.display = 'block';
    if (nodes) document.getElementById('stat-nodes').textContent = nodes;
    if (files) document.getElementById('stat-files').textContent = files;
    if (data) document.getElementById('stat-data').textContent = data;
    if (duration) document.getElementById('stat-duration').textContent = duration;
  }

} catch (_) {}

const initBtn = document.getElementById('init-btn');
if (initBtn) {
  if (role !== 'host') {
    initBtn.style.display = 'none';
  } else {
    initBtn.addEventListener('click', () => {
      window.location.href = '/?forceNew=1';
    });
  }
}

document.getElementById('home-btn')?.addEventListener('click', () => {
  if (role !== 'host') {
    window.location.href = '/join-pin.html';
  } else {
    window.location.href = '/';
  }
});
