import fs from 'fs';
import { config } from '../config.js';
import { logger } from '../logger.js';

let deviceNamesMap = new Map();

export function loadDeviceNames() {
  try {
    if (fs.existsSync(config.deviceNamesFile)) {
      const data = fs.readFileSync(config.deviceNamesFile, 'utf8');
      const parsed = JSON.parse(data);
      deviceNamesMap = new Map(Object.entries(parsed));
      logger.info(`Loaded ${deviceNamesMap.size} device names from persistent storage`);
    } else {
      logger.info('No existing device names file found, starting with empty map');
    }
  } catch (error) {
    logger.error('Error loading device names:', error);
    deviceNamesMap = new Map();
  }
}

export function saveDeviceNames() {
  try {
    const data = JSON.stringify(Object.fromEntries(deviceNamesMap), null, 2);
    fs.writeFileSync(config.deviceNamesFile, data, 'utf8');
    logger.info(`Saved ${deviceNamesMap.size} device names to persistent storage`);
  } catch (error) {
    logger.error('Error saving device names:', error);
  }
}

export function getDeviceName(peerId) {
  return deviceNamesMap.get(peerId) || '';
}

export function setDeviceName(peerId, deviceName) {
  if (deviceName && deviceName.trim()) {
    deviceNamesMap.set(peerId, deviceName.trim());
    saveDeviceNames();
    return true;
  }
  return false;
}

export function deleteDeviceName(peerId) {
  if (deviceNamesMap.has(peerId)) {
    deviceNamesMap.delete(peerId);
    return true;
  }
  return false;
}

export function getAllDeviceNames() {
  return Object.fromEntries(deviceNamesMap);
}

export function getActivePeerIdsFromSessions(sessions) {
  const activePeerIds = new Set();
  for (const session of sessions.values()) {
    for (const peerId of session.peers.keys()) {
      activePeerIds.add(peerId);
    }
  }
  return activePeerIds;
}

export function cleanupOrphanedDeviceNames(sessions) {
  const activePeerIds = getActivePeerIdsFromSessions(sessions);
  let cleanedCount = 0;
  for (const [peerId] of deviceNamesMap) {
    if (!activePeerIds.has(peerId)) {
      deviceNamesMap.delete(peerId);
      cleanedCount++;
    }
  }
  if (cleanedCount > 0) {
    logger.info(`Cleaned up ${cleanedCount} orphaned device names`);
    saveDeviceNames();
  }
  return cleanedCount;
}

loadDeviceNames();
