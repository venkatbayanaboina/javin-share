import path from 'path';
import { fileURLToPath } from 'url';
import { createApp } from '../../src/create-app.js';
import { createMockIo } from './mock-io.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const testUploadsDir = path.join(__dirname, '../../uploads-test');

export function createTestApp() {
  const io = createMockIo();
  const app = createApp({ io, server: null });
  return { app, io };
}
