import os from 'os';

/**
 * True when the given IP address belongs to this machine or its loopback.
 */
function isLocalIp(ip) {
  if (!ip) return false;
  // Clean IPv6 loopback prefix mapping if present (e.g. ::ffff:127.0.0.1)
  const cleanIp = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  if (cleanIp === '127.0.0.1' || cleanIp === '::1') return true;

  // Retrieve local network interface IPs to recognize local requests using LAN IP
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.address === cleanIp) return true;
    }
  }
  return false;
}

/**
 * Client IP for rate limiting.
 *
 * X-Forwarded-For is NEVER trusted in normal operation: this app has no reverse
 * proxy by design, and honoring a client-supplied header would let any LAN
 * device spoof the host machine (or rotate IPs to defeat PIN rate limiting).
 * The test suite (JAVIN_TEST=1) may still use the header to simulate remote clients.
 */
export function getClientIp(req) {
  if (process.env.JAVIN_TEST === '1') {
    const forwarded = req.headers?.['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length > 0) {
      return forwarded.split(',')[0].trim();
    }
  }
  return req.socket?.remoteAddress || 'unknown';
}

/**
 * Helper to check if request is originating from the local machine.
 */
export function isLocalRequest(req) {
  const ip = getClientIp(req);
  if (!ip || ip === 'unknown') return false;
  if (ip === 'localhost') return true;
  return isLocalIp(ip);
}

/**
 * Socket.IO equivalent of isLocalRequest, based on the handshake address.
 * Fails open when no handshake address is available (test mocks, unusual
 * transports) so behavior stays backwards compatible there.
 */
export function isLocalSocket(socket) {
  const addr = socket?.handshake?.address;
  if (!addr) return true;
  return isLocalIp(addr);
}
