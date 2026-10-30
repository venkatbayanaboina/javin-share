/** Minimal Socket.IO server mock for session creation tests. */
export function createMockIo() {
  const emitted = [];
  const connectionHandlers = [];
  return {
    emitted,
    connectionHandlers,
    in(_room) {
      return {
        emit(event, payload) {
          emitted.push({ scope: 'room', event, payload });
        },
      };
    },
    emit(event, payload) {
      emitted.push({ scope: 'global', event, payload });
    },
    to(_socketId) {
      return {
        emit(event, payload) {
          emitted.push({ scope: 'socket', event, payload });
        },
      };
    },
    /** Captures 'connection' callbacks so tests can simulate client sockets. */
    on(event, callback) {
      if (event === 'connection') connectionHandlers.push(callback);
    },
    /** Simulates a client connecting with the given mock socket. */
    connect(socket) {
      connectionHandlers.forEach((handler) => handler(socket));
    },
    close(callback) {
      if (typeof callback === 'function') callback();
    },
  };
}

/** Minimal Socket.IO client-socket mock: records emits, stores registered handlers. */
export function createMockSocket(id = 'mock-socket-1') {
  const handlers = new Map();
  const emitted = [];
  return {
    id,
    emitted,
    on(event, callback) {
      handlers.set(event, callback);
    },
    emit(event, payload) {
      emitted.push({ event, payload });
    },
    /** Invokes a handler the server registered via socket.on(event, ...). */
    trigger(event, payload) {
      const handler = handlers.get(event);
      if (handler) handler(payload);
    },
  };
}
