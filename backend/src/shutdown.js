import { logger } from './logger.js';

function exitIfProduction() {
  if (process.env.JAVIN_TEST !== '1') {
    process.exit(0);
  }
}

export function gracefulShutdown(server, io) {
  logger.info('Starting graceful shutdown...');

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
