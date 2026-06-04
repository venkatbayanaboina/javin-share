import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.UPLOADS_DIR = path.join(__dirname, 'uploads-test');
process.env.OPEN_BROWSER = 'false';
process.env.LOG_LEVEL = 'error';
process.env.JAVIN_TEST = '1';
