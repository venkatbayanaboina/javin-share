import express from 'express';
import { registerRoutes } from './routes/index.js';

export function createApp(deps) {
  const app = express();
  registerRoutes(app, deps);
  return app;
}
