import { run } from 'node:test';
import { spec } from 'node:test/reporters';
import path from 'path';
import process from 'process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// Import setup-env variables manually to ensure test environment is exactly right
process.env.PORT = '4005';
process.env.LOG_LEVEL = 'error';

const stream = run({
  files: [path.resolve(__dirname, 'test/integration/transfer-optimization.test.mjs')],
});

stream.on('test:fail', (data) => {
  console.error(`\n❌ TEST FAILED: ${data.name}`);
  if (data.details?.error) {
    console.error(data.details.error);
  }
});

stream.pipe(new spec()).pipe(process.stdout);
