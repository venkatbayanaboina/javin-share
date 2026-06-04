#!/usr/bin/env node
/**
 * Measure relay-disk upload/download throughput and time-to-first-byte.
 *
 * Usage:
 *   node backend/scripts/benchmark-transfer.mjs --base-url https://localhost:4000 --session-id ABC --file-mb 50
 *
 * Requires an active session (create via host UI or test helper).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { performance } from 'perf_hooks';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const opts = {
    baseUrl: 'https://localhost:4000',
    sessionId: '',
    fileMb: 10,
    fileId: `bench-${Date.now()}`,
    insecure: true,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--base-url') opts.baseUrl = argv[++i];
    else if (a === '--session-id') opts.sessionId = argv[++i];
    else if (a === '--file-mb') opts.fileMb = Number(argv[++i]);
    else if (a === '--file-id') opts.fileId = argv[++i];
    else if (a === '--secure') opts.insecure = false;
  }
  return opts;
}

function mbps(bytes, seconds) {
  if (seconds <= 0) return 0;
  return (bytes * 8) / (seconds * 1_000_000);
}

function buildMultipartBody(buffer, boundary, filename) {
  const header = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
  );
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
  return Buffer.concat([header, buffer, footer]);
}

async function main() {
  const opts = parseArgs(process.argv);
  if (!opts.sessionId) {
    console.error('Missing --session-id (active session from host flow)');
    process.exit(1);
  }

  if (opts.insecure) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  }

  const sizeBytes = Math.floor(opts.fileMb * 1024 * 1024);
  const buffer = Buffer.alloc(sizeBytes, 0x61);
  const boundary = `bench-${Date.now()}`;
  const body = buildMultipartBody(buffer, boundary, 'benchmark.bin');
  const uploadUrl = `${opts.baseUrl}/upload/${opts.sessionId}?fileId=${opts.fileId}`;
  const downloadUrl = `${opts.baseUrl}/download/${opts.sessionId}/${opts.fileId}`;

  console.log(`Benchmark relay-disk`);
  console.log(`  Session: ${opts.sessionId}`);
  console.log(`  File: ${opts.fileMb} MB (${sizeBytes} bytes)`);
  console.log(`  File ID: ${opts.fileId}`);

  const uploadStart = performance.now();
  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'X-File-Id': opts.fileId,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': String(body.length),
    },
    body,
  });
  const uploadSec = (performance.now() - uploadStart) / 1000;
  if (!uploadRes.ok) {
    console.error('Upload failed:', uploadRes.status, await uploadRes.text());
    process.exit(1);
  }
  const uploadJson = await uploadRes.json();
  console.log(`Upload: ${uploadSec.toFixed(2)}s — ${mbps(sizeBytes, uploadSec).toFixed(2)} Mbps`);

  const downloadStart = performance.now();
  let ttfbMs = null;
  let downloaded = 0;
  const downloadRes = await fetch(downloadUrl);
  if (!downloadRes.ok) {
    console.error('Download failed:', downloadRes.status);
    process.exit(1);
  }
  const reader = downloadRes.body?.getReader();
  if (!reader) {
    const text = await downloadRes.text();
    downloaded = text.length;
    ttfbMs = performance.now() - downloadStart;
  } else {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (ttfbMs === null) ttfbMs = performance.now() - downloadStart;
      downloaded += value.length;
    }
  }
  const downloadSec = (performance.now() - downloadStart) / 1000;
  console.log(`Download TTFB: ${ttfbMs?.toFixed(0) ?? 'n/a'} ms`);
  console.log(`Download: ${downloadSec.toFixed(2)}s — ${mbps(downloaded, downloadSec).toFixed(2)} Mbps (${downloaded} bytes)`);
  console.log(`Upload response:`, uploadJson);

  const row = `| ${new Date().toISOString().slice(0, 10)} | ${opts.fileMb} MB | disk | ${mbps(sizeBytes, uploadSec).toFixed(1)} | ${mbps(downloaded, downloadSec).toFixed(1)} | ${ttfbMs?.toFixed(0) ?? 'n/a'} |`;
  console.log('\nMarkdown row for docs/benchmarks/BASELINE.md:\n' + row);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
