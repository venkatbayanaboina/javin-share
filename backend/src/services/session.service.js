import { nanoid } from 'nanoid';
import QRCode from 'qrcode';
import os from 'os';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { store, setCurrentHostSessionId } from '../state/store.js';
import { generatePIN } from '../utils/network.js';
import { deleteDeviceName, saveDeviceNames } from './device-names.service.js';

export function buildPinUrl(host = store.localIP) {
  return `${config.protocol}://${host}:${config.port}/pin`;
}

export function buildLocalUrl() {
  // 1. If custom host is configured, use it
  if (config.customHost) {
    return buildPinUrl(config.customHost);
  }
  // 2. Otherwise fall back to OS hostname
  const hostname = os.hostname();
  if (hostname && hostname !== 'localhost') {
    if (hostname.toLowerCase().endsWith('.local')) {
      return buildPinUrl(hostname);
    } else {
      // If the hostname doesn't end with .local, append it (if it doesn't already look like a FQDN)
      const hasDot = hostname.includes('.');
      return buildPinUrl(hasDot ? hostname : `${hostname}.local`);
    }
  }
  return null;
}

export function invalidateSessionById(io, sessionId) {
  if (!sessionId) return;
  const session = store.sessions.get(sessionId);
  if (!session) return;

  logger.info(`Invalidating session ${session.id}`);
  io.in(session.id).emit('session-ended');

  const peerIds = Array.from(session.peers.keys());
  peerIds.forEach((peerId) => {
    if (deleteDeviceName(peerId)) {
      logger.info(`Cleaned up device name for peer ${peerId} (session invalidated)`);
    }
  });
  saveDeviceNames();

  store.sessions.delete(session.id);
  store.transferHistory.delete(session.id);

  if (store.currentHostSessionId === session.id) {
    setCurrentHostSessionId(null);
  }
}

function invalidatePreviousSession(io) {
  invalidateSessionById(io, store.currentHostSessionId);
}

export async function createSession(io, forceInvalidatePrevious = false) {
  if (forceInvalidatePrevious && store.currentHostSessionId) {
    invalidatePreviousSession(io);
  }

  const sessionId = nanoid(10);
  const pin = generatePIN();
  const session = {
    id: sessionId,
    pin,
    pinExpiry: Date.now() + config.pinExpiryMs,
    peers: new Map(),
    activeFiles: new Map(),
    activeTransfer: null,
    currentSenderPeerId: null,
    exitedPeers: new Set(),
  };

  store.sessions.set(sessionId, session);
  store.transferHistory.set(sessionId, []);
  setCurrentHostSessionId(sessionId);

  const pinUrl = buildPinUrl(store.localIP);
  const qrUrl = buildPinUrl(store.localIP);
  const localUrl = buildLocalUrl();
  const qrDataUrl = await QRCode.toDataURL(qrUrl);
  logger.info(`Session created: ${sessionId}, PIN: ${pin}`);

  return { sessionId, pin, url: pinUrl, localUrl, qrDataUrl, pinExpiry: session.pinExpiry };
}
