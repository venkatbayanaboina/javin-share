import crypto from 'crypto';
import os from 'os';

export function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return '127.0.0.1';
}

export function generatePIN() {
  // Cryptographically secure: the PIN is the only secret gating session join.
  return crypto.randomInt(100000, 1000000).toString();
}
