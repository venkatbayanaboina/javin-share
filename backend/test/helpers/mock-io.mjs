/** Minimal Socket.IO server mock for session creation tests. */
export function createMockIo() {
  const emitted = [];
  return {
    emitted,
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
    close(callback) {
      if (typeof callback === 'function') callback();
    },
  };
}
