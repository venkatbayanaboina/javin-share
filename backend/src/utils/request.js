import os from 'os';

/**
 * Client IP for rate limiting (respects X-Forwarded-For when behind a proxy).
 */
export function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || req.ip || 'unknown';
}

/**
 * Helper to check if request is originating from the local machine.
 */
export function isLocalRequest(req) {
  const ip = getClientIp(req);
  if (!ip || ip === 'unknown') return false;

  // Clean IPv6 loopback prefix mapping if present (e.g. ::ffff:127.0.0.1)
  const cleanIp = ip.startsWith('::ffff:') ? ip.slice(7) : ip;

  if (cleanIp === '127.0.0.1' || cleanIp === '::1' || cleanIp === 'localhost') {
    return true;
  }

  // Retrieve local network interface IPs to recognize local requests using LAN IP
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.address === cleanIp || net.address === ip) {
        return true;
      }
    }
  }

  return false;
}
