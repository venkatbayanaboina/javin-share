export function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 Bytes';
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  const value = bytes / Math.pow(k, i);
  const decimals = i >= 2 ? 2 : 0;

  return parseFloat(value.toFixed(decimals)) + ' ' + sizes[i];
}

export function formatTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) return '--:--';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

export function formatSpeed(bytesPerSecond) {
  if (!isFinite(bytesPerSecond) || bytesPerSecond < 0) return '-- B/s';
  const mbPerSec = bytesPerSecond / (1024 * 1024);
  const mbitPerSec = (bytesPerSecond * 8) / 1_000_000;
  return `${mbPerSec.toFixed(2)} MB/s (${mbitPerSec.toFixed(2)} Mbps)`;
}
