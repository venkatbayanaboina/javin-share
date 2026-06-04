import { markSessionExited } from '../core/storage.js';

try {
  const params = new URLSearchParams(window.location.search);
  const sid = params.get('session');
  if (sid) markSessionExited(sid);

  // Set metrics from URL if present
  const nodes = params.get('nodes');
  const files = params.get('files');
  const data = params.get('data');
  const duration = params.get('duration');

  if (nodes) document.getElementById('stat-nodes').textContent = nodes;
  if (files) document.getElementById('stat-files').textContent = files;
  if (data) document.getElementById('stat-data').textContent = data;
  if (duration) document.getElementById('stat-duration').textContent = duration;

} catch (_) {}

document.getElementById('init-btn')?.addEventListener('click', () => {
  window.location.href = '/?forceNew=1';
});

document.getElementById('home-btn')?.addEventListener('click', () => {
  window.location.href = '/';
});
