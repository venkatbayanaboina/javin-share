import express from 'express';
import compression from 'compression';
import { registerRoutes } from './routes/index.js';

export function createApp(deps) {
  const app = express();
  // Compress text assets (HTML/CSS/JS/JSON) — LAN or not, it cuts transfer time.
  app.use(compression());
  registerRoutes(app, deps);
  return app;
}
