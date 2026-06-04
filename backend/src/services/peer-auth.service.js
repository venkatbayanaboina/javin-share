import { logger } from '../logger.js';
import { store } from '../state/store.js';

/**
 * Returns the peer record if peerId is an active host in the session.
 */
export function getHostPeer(sessionId, peerId) {
  if (!sessionId || !peerId) return null;
  const session = store.sessions.get(sessionId);
  if (!session) return null;

  const peer = session.peers.get(peerId);
  if (!peer || peer.role !== 'host' || peer.isDisconnected) return null;
  return peer;
}

export function assertHostPeer(sessionId, peerId) {
  const peer = getHostPeer(sessionId, peerId);
  if (!peer) {
    logger.warn(`Host auth failed: session=${sessionId} peer=${peerId}`);
  }
  return peer;
}
