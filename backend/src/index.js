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

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  maxHttpBufferSize: 1e9,
  pingTimeout: 120000,
  pingInterval: 25000,
  transports: ['websocket'],
});

deps.io = io;
deps.server = server;

registerSockets(io, deps);

setInterval(() => {
  try {
    cleanupOrphanedDeviceNames(store.sessions);
  } catch (error) {
    logger.error('Error in device name cleanup:', error);
  }
}, 300000);

setInterval(() => {
  try {
    prunePinRateLimitStore();
  } catch (error) {
    logger.error('Error in PIN rate-limit cleanup:', error);
  }
}, 600000);

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

server.listen(config.port, config.host, async () => {
  const displayHost = config.customHost || store.localIP;
  logger.info(`FileShare server running on ${config.protocol}://${displayHost}:${config.port}`);
  logger.info(`Uploads directory: ${config.uploadsDir}`);
  logger.info('Abandoned sender checks run on page transitions (no polling interval)');
  logger.info('Device name cleanup active (every 5 minutes)');

  if (config.openBrowser) {
    try {
      await open(`${config.protocol}://${displayHost}:${config.port}`);
      logger.info('Browser opened automatically');
    } catch (e) {
      logger.info(`Could not open browser automatically: ${e.message}`);
    }
  }
});
