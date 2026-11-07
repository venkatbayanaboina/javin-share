import { logger } from './logger.js';

let shuttingDown = false;

function exitIfProduction() {
  if (process.env.JAVIN_TEST !== '1') {
    process.exit(0);
  }
}

export function gracefulShutdown(server, io) {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info('Starting graceful shutdown...');

  // Hard deadline: open keep-alive sockets or long downloads must never hang
  // the exit forever. unref() keeps it from holding the loop by itself.
  const forceTimer = setTimeout(() => {
    logger.error('Graceful shutdown timed out — forcing exit.');
    process.exit(1);
  }, 10000);
  forceTimer.unref();

  const onServerClosed = () => {
    logger.info('HTTP server closed.');
    exitIfProduction();
  };

  if (!server) {
    if (io?.close) {
      io.close(onServerClosed);
    } else {
      onServerClosed();
    }
    return;
  }

  // Drop any remaining keep-alive connections shortly after the close begins,
  // so idle sockets don't stall server.close() for its whole timeout.
  setTimeout(() => {
    try {
      server.closeAllConnections?.();
    } catch (_) {}
  }, 3000).unref();

  if (io?.close) {
    logger.info('Closing Socket.IO connections...');
    io.close(() => {
      logger.info('Socket.IO closed. Closing HTTP server...');
      server.close(onServerClosed);
    });
  } else {
    server.close(onServerClosed);
  }
}
