import express from 'express';
import { createHealthRouter } from './health.routes.js';
import { createPagesRouter } from './pages.routes.js';
import { createSessionRouter } from './session.routes.js';
import { createUploadRouter } from './upload.routes.js';
import { createDownloadRouter } from './download.routes.js';

import { initializeTransferCoordinator } from '../services/transfer/coordinator.service.js';

export function registerRoutes(app, deps) {
  initializeTransferCoordinator(deps);

  app.use(express.json());

  app.use(createHealthRouter());
  app.use(createPagesRouter());
  app.use(createSessionRouter(deps));
  app.use(createUploadRouter());
  app.use(createDownloadRouter(deps));
}
