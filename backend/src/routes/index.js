import express from 'express';
import { createHealthRouter } from './health.routes.js';
import { createPagesRouter } from './pages.routes.js';
import { createSessionRouter } from './session.routes.js';
import { createUploadRouter } from './upload.routes.js';
import { createDownloadRouter } from './download.routes.js';

import { initializeTransferCoordinator } from '../services/transfer/coordinator.service.js';
import { logger } from '../logger.js';

export function registerRoutes(app, deps) {
  initializeTransferCoordinator(deps);

  app.use(express.json());

  app.use(createHealthRouter());
  app.use(createPagesRouter());
  app.use(createSessionRouter(deps));
  app.use(createUploadRouter());
  app.use(createDownloadRouter());

  // JSON 404 for anything unmatched (Express's HTML default leaks route info).
  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Central error handler — never leaks stack traces to the network.
  app.use((err, req, res, _next) => {
    logger.error(`Request error on ${req.method} ${req.path}:`, err);
    if (res.headersSent) return;
    const status = err?.status || err?.statusCode || 500;
    res.status(status).json({ error: status < 500 ? 'Invalid request' : 'Internal server error' });
  });
}
