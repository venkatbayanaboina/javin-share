#!/usr/bin/env node
/**
 * Measure upload/download throughput and time-to-first-byte across JAVIN Share strategies.
 *
 * Usage:
 *   node backend/scripts/benchmark-transfer.mjs \
 *     --base-url https://localhost:4000 \
 *     --session-id ABC \
 *     --file-mb 50 \
 *     --strategy relay-stream \
 *     --receivers 4
 */

import { fileURLToPath } from 'url';
import path from 'path';
import { performance } from 'perf_hooks';
import { Readable } from 'stream';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const opts = {
    baseUrl: 'https://localhost:4000',
    sessionId: '',
    fileMb: 10,
    fileId: `bench-${Date.now()}`,
    insecure: true,
    strategy: 'relay-disk',
    receivers: 1,
    networkLabel: 'loopback',
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--base-url') opts.baseUrl = argv[++i];
    else if (a === '--session-id') opts.sessionId = argv[++i];
    else if (a === '--file-mb') opts.fileMb = Number(argv[++i]);
    else if (a === '--file-id') opts.fileId = argv[++i];
    else if (a === '--secure') opts.insecure = false;
    else if (a === '--strategy') opts.strategy = argv[++i];
    else if (a === '--receivers') opts.receivers = Number(argv[++i]);
    else if (a === '--network-label') opts.networkLabel = argv[++i];
  }
  return opts;
}

function mbps(bytes, seconds) {
  if (seconds <= 0) return 0;
  return (bytes * 8) / (seconds * 1_000_000);
}

function createMultipartStream(sizeBytes, boundary, filename) {
  const header = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
  );
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
  const totalLength = header.length + sizeBytes + footer.length;

  let bytesSent = 0;
  const chunkSize = 1024 * 1024; // 1MB chunk size
  const dummyChunk = Buffer.alloc(chunkSize, 0x61);

  const stream = new Readable({
    read() {
      if (bytesSent === 0) {
        this.push(header);
        bytesSent += header.length;
        return;
      }

      const remainingFileBytes = sizeBytes - (bytesSent - header.length);
      if (remainingFileBytes > 0) {
        const toSend = Math.min(chunkSize, remainingFileBytes);
        if (toSend === chunkSize) {
          this.push(dummyChunk);
        } else {
          this.push(Buffer.alloc(toSend, 0x61));
        }
        bytesSent += toSend;
        return;
      }

      if (bytesSent < totalLength) {
        this.push(footer);
        bytesSent += footer.length;
        return;
      }

      this.push(null);
    }
  });

  return { stream, totalLength };
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
  const boundary = `bench-${Date.now()}`;
  const uploadUrl = `${opts.baseUrl}/upload/${opts.sessionId}?fileId=${opts.fileId}`;
  
  const isStreaming = opts.strategy === 'relay-stream' || opts.strategy === 'relay-buffered';

  console.log(`Benchmark strategy execution`);
  console.log(`  Session: ${opts.sessionId}`);
  console.log(`  Strategy: ${opts.strategy}`);
  console.log(`  File: ${opts.fileMb} MB (${sizeBytes} bytes)`);
  console.log(`  File ID: ${opts.fileId}`);
  console.log(`  Expected Receivers: ${opts.receivers}`);
  console.log(`  Network Interface: ${opts.networkLabel}`);

  if (isStreaming) {
    // 1. Pre-register streaming session on the server with N receivers
    const regUrl = `${opts.baseUrl}/api/benchmark/register-session/${opts.sessionId}/${opts.fileId}?size=${sizeBytes}&receivers=${opts.receivers}`;
    console.log(`Pre-registering stream session on server: ${regUrl}`);
    const regRes = await fetch(regUrl);
    if (!regRes.ok) {
      console.error('Pre-registration failed:', regRes.status, await regRes.text());
      process.exit(1);
    }
    console.log('Stream session registered successfully.');

    // 2. Connect N download streams concurrently (they block waiting for upload bytes)
    let uploadStart = null;
    const downloadPromises = [];

    for (let i = 1; i <= opts.receivers; i++) {
      const receiverId = `receiver-bench-peer-${i}`;
      const downloadUrl = `${opts.baseUrl}/download/${opts.sessionId}/${opts.fileId}?receiver=${receiverId}`;
      const downloadStart = performance.now();

      const p = (async () => {
        console.log(`Connecting receiver ${i} stream to ${downloadUrl}...`);
        const downloadRes = await fetch(downloadUrl);
        if (!downloadRes.ok) {
          throw new Error(`Receiver ${i} download stream failed: status ${downloadRes.status}`);
        }
        const reader = downloadRes.body?.getReader();
        let downloaded = 0;
        let ttfbMs = null;
        if (!reader) {
          const text = await downloadRes.text();
          downloaded = text.length;
          const now = performance.now();
          ttfbMs = uploadStart !== null ? (now - uploadStart) : (now - downloadStart);
        } else {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (ttfbMs === null) {
              const now = performance.now();
              ttfbMs = uploadStart !== null ? (now - uploadStart) : (now - downloadStart);
            }
            downloaded += value.length;
          }
        }
        const downloadSec = (performance.now() - downloadStart) / 1000;
        return { downloadSec, ttfbMs, downloaded };
      })();
      downloadPromises.push(p);
    }

    const downloadPromise = Promise.all(downloadPromises).then((results) => {
      const totalSec = Math.max(...results.map(r => r.downloadSec));
      const avgTtfb = results.reduce((sum, r) => sum + (r.ttfbMs || 0), 0) / results.length;
      const sumBytes = results.reduce((sum, r) => sum + r.downloaded, 0);
      return { downloadSec: totalSec, ttfbMs: avgTtfb, downloaded: sumBytes };
    });

    // Wait a brief moment to let all download streams connect and pipe
    await new Promise((resolve) => setTimeout(resolve, 300));

    // 3. Start upload stream concurrently
    const { stream, totalLength } = createMultipartStream(sizeBytes, boundary, 'benchmark.bin');
    console.log(`Starting upload stream to ${uploadUrl}...`);
    uploadStart = performance.now();
    const uploadPromise = (async () => {
      const uploadRes = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'X-File-Id': opts.fileId,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': String(totalLength),
        },
        body: stream,
        duplex: 'half',
      });
      if (!uploadRes.ok) {
        throw new Error(`Upload stream failed: status ${uploadRes.status} - ${await uploadRes.text()}`);
      }
      const uploadJson = await uploadRes.json();
      const uploadSec = (performance.now() - uploadStart) / 1000;
      return { uploadSec, uploadJson };
    })();

    // 4. Wait for both to complete
    try {
      const [downloadRes, uploadRes] = await Promise.all([downloadPromise, uploadPromise]);
      console.log(`Upload: ${uploadRes.uploadSec.toFixed(2)}s — ${mbps(sizeBytes, uploadRes.uploadSec).toFixed(2)} Mbps`);
      console.log(`Download TTFB (Avg): ${downloadRes.ttfbMs?.toFixed(0) ?? 'n/a'} ms`);
      console.log(`Download (Aggregated): ${downloadRes.downloadSec.toFixed(2)}s — ${mbps(downloadRes.downloaded, downloadRes.downloadSec).toFixed(2)} Mbps (${downloadRes.downloaded} bytes)`);
      console.log(`Upload response:`, uploadRes.uploadJson);

      const row = `| ${new Date().toISOString().slice(0, 10)} | ${opts.fileMb} MB | ${opts.strategy} | ${opts.networkLabel} | ${opts.receivers} | ${mbps(sizeBytes, uploadRes.uploadSec).toFixed(1)} | ${mbps(downloadRes.downloaded, downloadRes.downloadSec).toFixed(1)} | ${downloadRes.ttfbMs?.toFixed(0) ?? 'n/a'} |`;
      console.log('\nMarkdown row for docs/benchmarks/BASELINE.md:\n' + row);
    } catch (err) {
      console.error('Concurrent streaming benchmark failed:', err);
      process.exit(1);
    }

  } else {
    // Standard sequential test for relay-disk with N receivers
    const { stream, totalLength } = createMultipartStream(sizeBytes, boundary, 'benchmark.bin');
    const uploadStart = performance.now();
    console.log(`Starting sequential upload...`);
    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'X-File-Id': opts.fileId,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': String(totalLength),
      },
      body: stream,
      duplex: 'half',
    });
    const uploadSec = (performance.now() - uploadStart) / 1000;
    if (!uploadRes.ok) {
      console.error('Upload failed:', uploadRes.status, await uploadRes.text());
      process.exit(1);
    }
    const uploadJson = await uploadRes.json();
    console.log(`Upload: ${uploadSec.toFixed(2)}s — ${mbps(sizeBytes, uploadSec).toFixed(2)} Mbps`);

    const downloadPromises = [];
    const downloadStart = performance.now();

    for (let i = 1; i <= opts.receivers; i++) {
      const downloadUrl = `${opts.baseUrl}/download/${opts.sessionId}/${opts.fileId}`;
      const p = (async () => {
        console.log(`Starting download client ${i} from ${downloadUrl}...`);
        const downloadRes = await fetch(downloadUrl);
        if (!downloadRes.ok) {
          throw new Error(`Receiver ${i} download failed: status ${downloadRes.status}`);
        }
        const reader = downloadRes.body?.getReader();
        let downloaded = 0;
        let ttfbMs = null;
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
        return { downloadSec, ttfbMs, downloaded };
      })();
      downloadPromises.push(p);
    }

    try {
      const results = await Promise.all(downloadPromises);
      const totalSec = Math.max(...results.map(r => r.downloadSec));
      const avgTtfb = results.reduce((sum, r) => sum + (r.ttfbMs || 0), 0) / results.length;
      const sumBytes = results.reduce((sum, r) => sum + r.downloaded, 0);

      console.log(`Download TTFB (Avg): ${avgTtfb.toFixed(0)} ms`);
      console.log(`Download (Aggregated): ${totalSec.toFixed(2)}s — ${mbps(sumBytes, totalSec).toFixed(2)} Mbps (${sumBytes} bytes)`);
      console.log(`Upload response:`, uploadJson);

      const row = `| ${new Date().toISOString().slice(0, 10)} | ${opts.fileMb} MB | ${opts.strategy} | ${opts.networkLabel} | ${opts.receivers} | ${mbps(sizeBytes, uploadSec).toFixed(1)} | ${mbps(sumBytes, totalSec).toFixed(1)} | ${avgTtfb.toFixed(0)} |`;
      console.log('\nMarkdown row for docs/benchmarks/BASELINE.md:\n' + row);
    } catch (err) {
      console.error('Concurrent disk downloads failed:', err);
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
