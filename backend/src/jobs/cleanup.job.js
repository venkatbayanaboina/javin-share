import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { store } from '../state/store.js';
import { invalidateSessionById } from '../services/session.service.js';

// Sessions linger past PIN expiry before being swept so in-flight downloads,
// reconnecting peers and grace windows are unaffected.
const SESSION_LINGER_MS = 10 * 60 * 1000;
// Orphaned temp/spool/upload files younger than this are assumed active.
const ORPHAN_FILE_AGE_MS = 60 * 60 * 1000;

/**
 * Remove sessions that expired a while ago and have no connected peers.
 * Without this, store.sessions grows unbounded for the lifetime of the process.
 */
function sweepExpiredSessions(io) {
  const now = Date.now();
  for (const [sessionId, session] of store.sessions.entries()) {
    const expiredAgoMs = now - session.pinExpiry;
    if (expiredAgoMs <= SESSION_LINGER_MS) continue;

    const hasConnectedPeers = Array.from(session.peers.values()).some((p) => !p.isDisconnected);
    if (hasConnectedPeers) continue;

    logger.info(
      `Sweeping expired session ${sessionId} (expired ${Math.round(expiredAgoMs / 60000)} min ago)`,
    );
    invalidateSessionById(io, sessionId);
  }
}

/**
 * Delete files in the uploads dir that no active session references and that
 * have been on disk for a while (crashed uploads, spools from killed
 * transfers, downloads nobody picked up). Age-gated so anything recent —
 * including resumable uploads in progress — is left alone.
 */
function sweepOrphanedUploads() {
  let dirEntries;
  try {
    dirEntries = fs.readdirSync(config.uploadsDir, { withFileTypes: true });
  } catch (_) {
    return; // uploads dir missing — nothing to sweep
  }

  const referenced = new Set();
  for (const session of store.sessions.values()) {
    for (const meta of session.activeFiles.values()) {
      if (meta?.path) referenced.add(path.resolve(meta.path));
    }
  }

  const now = Date.now();
  for (const entry of dirEntries) {
    if (!entry.isFile()) continue;
    const fullPath = path.join(config.uploadsDir, entry.name);
    if (referenced.has(path.resolve(fullPath))) continue;
    try {
      const stat = fs.statSync(fullPath);
      if (now - stat.mtimeMs < ORPHAN_FILE_AGE_MS) continue;
      fs.unlinkSync(fullPath);
      logger.info(`Swept orphaned upload file: ${entry.name}`);
    } catch (err) {
      logger.error(`Failed to sweep ${entry.name}:`, err);
    }
  }
}

export function runMaintenanceSweep(io) {
  try {
    sweepExpiredSessions(io);
  } catch (err) {
    logger.error('Expired-session sweep failed:', err);
  }
  try {
    sweepOrphanedUploads();
  } catch (err) {
    logger.error('Orphaned-upload sweep failed:', err);
  }
}
