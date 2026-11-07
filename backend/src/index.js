import fs from 'fs';
import https from 'https';
import open from 'open';
import { Server } from 'socket.io';
import { config, paths } from './config.js';
import { startMdnsResponder } from './services/mdns.service.js';
import { logger, setLogLevel } from './logger.js';
import { store } from './state/store.js';
import { getLocalIP } from './utils/network.js';
import { cleanupOrphanedDeviceNames } from './services/device-names.service.js';
import { createApp } from './create-app.js';
import { registerSockets } from './sockets/index.js';
import { gracefulShutdown } from './shutdown.js';
import { prunePinRateLimitStore } from './services/pin-rate-limit.service.js';
import { runMaintenanceSweep } from './jobs/cleanup.job.js';

setLogLevel(config.logLevel);

if (!fs.existsSync(config.uploadsDir)) {
  fs.mkdirSync(config.uploadsDir, { recursive: true });
}

store.localIP = getLocalIP();

const deps = { io: null, server: null };
const app = createApp(deps);

const server = https.createServer(
  {
    key: fs.readFileSync(paths.certKey),
    cert: fs.readFileSync(paths.certPem),
  },
  app,
);

// A second instance (or any port conflict) must fail with a clear message,
// not an unhandled 'error' event.
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    logger.error(
      `Port ${config.port} is already in use — is another JAVIN FileShare instance still running?`,
    );
  } else {
    logger.error('HTTPS server error:', err);
  }
  process.exit(1);
});

// LAN transfer tuning: no Nagle delays on control/data sockets, and a
// keep-alive window that comfortably outlives a browser's idle reuse gap.
server.on('connection', (socket) => socket.setNoDelay(true));
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000; // must exceed keepAliveTimeout

const io = new Server(server, {
  // No CORS config: the app is same-origin (pages are served by this server),
  // and without permissive CORS headers a cross-site WebSocket hijack from a
  // random web page cannot connect.
  maxHttpBufferSize: 1e6, // file bytes travel over HTTP, not WS — 1MB is ample
  pingTimeout: 25000, // LAN dead-peer detection; 120s left zombie peers holding locks
  pingInterval: 25000,
  transports: ['websocket'],
});

deps.io = io;
deps.server = server;

registerSockets(io, deps);

const deviceCleanupTimer = setInterval(() => {
  try {
    cleanupOrphanedDeviceNames(store.sessions);
  } catch (error) {
    logger.error('Error in device name cleanup:', error);
  }
}, 300000);
deviceCleanupTimer.unref();

const pinPruneTimer = setInterval(() => {
  try {
    prunePinRateLimitStore();
  } catch (error) {
    logger.error('Error in PIN rate-limit cleanup:', error);
  }
}, 600000);
pinPruneTimer.unref();

const maintenanceTimer = setInterval(() => {
  try {
    runMaintenanceSweep(io);
  } catch (error) {
    logger.error('Error in maintenance sweep:', error);
  }
}, 300000);
maintenanceTimer.unref();

const mdnsServer = startMdnsResponder(config.customHost, store.localIP, logger);

process.on('SIGINT', () => {
  logger.info('\nReceived SIGINT (Ctrl+C). Shutting down gracefully...');
  if (mdnsServer) {
    try {
      mdnsServer.destroy();
      logger.info('mDNS responder stopped.');
    } catch (e) {
      logger.error('Error stopping mDNS responder:', e);
    }
  }
  gracefulShutdown(server, io);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM. Shutting down gracefully...');
  if (mdnsServer) {
    try {
      mdnsServer.destroy();
      logger.info('mDNS responder stopped.');
    } catch (e) {
      logger.error('Error stopping mDNS responder:', e);
    }
  }
  gracefulShutdown(server, io);
});

// A stray rejection in any socket callback must not kill the server silently.
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception:', err);
  if (mdnsServer) {
    try {
      mdnsServer.destroy();
    } catch (_) {}
  }
  gracefulShutdown(server, io);
});

server.listen(config.port, config.host, async () => {
  const displayHost = config.customHost || store.localIP;
  logger.info(`FileShare server running on ${config.protocol}://${displayHost}:${config.port}`);
  logger.info(`Uploads directory: ${config.uploadsDir}`);
  logger.info('Abandoned sender checks run on page transitions (no polling interval)');
  logger.info('Device name cleanup active (every 5 minutes)');

  if (config.openBrowser) {
    try {
      // Always open localhost on the host machine — no mDNS dependency
      await open(`${config.protocol}://localhost:${config.port}`);
      logger.info('Browser opened automatically');
    } catch (e) {
      logger.info(`Could not open browser automatically: ${e.message}`);
    }
  }
});
