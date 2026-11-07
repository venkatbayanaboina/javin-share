import { logger } from '../logger.js';
import { registerSessionLifecycle } from './session.lifecycle.js';
import { registerTransferHandlers } from './transfer.handlers.js';
import { registerPageHandlers } from './page.handlers.js';

export function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    logger.info(`New socket connection: ${socket.id}`);
    registerSessionLifecycle(io, socket);
    registerTransferHandlers(io, socket);
    registerPageHandlers(io, socket);
  });
}
