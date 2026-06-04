import { registerSocketHandlers } from './handlers.js';

export function registerSockets(io, _deps = {}) {
  registerSocketHandlers(io);
}
