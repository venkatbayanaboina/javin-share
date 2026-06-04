/**
 * One-off helper: extract inline <script> blocks from HTML into page modules.
 * Run from repo root: node scripts/extract-page-scripts.mjs
 */
import fs from 'fs';
import path from 'path';

const FRONTEND = path.join(process.cwd(), 'frontend');

const PAGES = [
  { html: 'join-pin.html', module: 'assets/js/pages/join-pin.js' },
  { html: 'host.html', module: 'assets/js/pages/host.js' },
  { html: 'session.html', module: 'assets/js/pages/session.js' },
  { html: 'send-files.html', module: 'assets/js/pages/send-files.js' },
  { html: 'receive-files.html', module: 'assets/js/pages/receive-files.js' },
];

for (const { html, module } of PAGES) {
  const htmlPath = path.join(FRONTEND, html);
  const outPath = path.join(FRONTEND, module);
  console.log(`Would extract ${html} → ${module}`);
  console.log(`  html exists: ${fs.existsSync(htmlPath)}, out exists: ${fs.existsSync(outPath)}`);
}
