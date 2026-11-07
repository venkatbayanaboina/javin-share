import { getPeerId } from '../core/storage.js';
import { ConnectionMonitor, ErrorHandler } from '../core/errors.js';
import { registerNavigateListener } from '../core/navigate.js';

let socket;
let socketInitialized = false;

export function getSocket() {
  return socket;
}

export async function initPinPageSocket(role = 'client') {
  if (socketInitialized) return socket;
  socketInitialized = true;

  try {
    const res = await fetch('/get-current-session');
    if (!res.ok) throw new Error('Failed to get session');
    const sessionData = await res.json();
    const sessionId = sessionData.sessionId;
    const peerId = getPeerId();

    socket = io({ transports: ['websocket'] });
    registerNavigateListener(socket);

    socket.on('connect', () => {
      socket.emit('join-session', { sessionId, role, peerId });
    });

    new ConnectionMonitor(socket).onStatusChange((status) => {
    });

    return socket;
  } catch (err) {
    ErrorHandler.handle(err, 'Socket Init', () => initPinPageSocket(role));
    return null;
  }
}
