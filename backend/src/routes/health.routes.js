import { Router } from 'express';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(path.join(__dirname, '../../package.json'), 'utf8'));

export function createHealthRouter() {
  const router = Router();

  router.get('/api/v1/health', (_req, res) => {
    res.json({ status: 'ok', version: pkg.version });
  });

  return router;
}
