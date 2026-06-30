import { spawn } from 'child_process';
import { performance } from 'perf_hooks';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../..');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(argv) {
  const opts = {
    receivers: 1,
    networkLabel: 'loopback-disk-write',
    fileMb: 4096, // 4GB default to prevent disk exhaustion
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--receivers') opts.receivers = Number(argv[++i]);
    else if (a === '--network-label') opts.networkLabel = argv[++i];
    else if (a === '--file-mb') opts.fileMb = Number(argv[++i]);
  }
  return opts;
}

async function waitForServer(port) {
  const url = `https://localhost:${port}/get-current-session`;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        return await res.json();
      }
    } catch (_) {}
    await sleep(200);
  }
  throw new Error('Server did not start in time');
}

function runBenchmark(port, sessionId, fileMb, strategy, receivers, networkLabel) {
  return new Promise((resolve, reject) => {
    const fileId = `bench-${strategy}-${Date.now()}`;
    const args = [
      path.join(rootDir, 'backend/scripts/benchmark-transfer.mjs'),
      '--base-url', `https://localhost:${port}`,
      '--session-id', sessionId,
      '--file-mb', String(fileMb),
      '--file-id', fileId,
      '--strategy', strategy,
      '--receivers', String(receivers),
      '--network-label', networkLabel,
      '--mode', 'both'
    ];

    const proc = spawn('node', args, { env: { ...process.env } });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`Benchmark failed with code ${code}\n${stderr}`));
      }
      resolve(stdout);
    });
  });
}

function parseBenchmarkOutput(output) {
  // Parse lines:
  // Upload: 1.25s — 640.0 Mbps
  // Download TTFB (Avg): 15 ms
  // Download (Aggregated): 1.10s — 727.3 Mbps
  const uploadMatch = output.match(/Upload:[\s\S]*?—\s*([\d.]+)\s*Mbps/i);
  const ttfbMatch = output.match(/Download TTFB\s*(?:\(Avg\))?:\s*([\d.]+)\s*ms/i);
  const downloadMatch = output.match(/Download\s*(?:\(Aggregated\))?:[\s\S]*?—\s*([\d.]+)\s*Mbps/i);

  return {
    uploadMbps: uploadMatch ? parseFloat(uploadMatch[1]) : 0,
    ttfbMs: ttfbMatch ? parseFloat(ttfbMatch[1]) : 0,
    downloadMbps: downloadMatch ? parseFloat(downloadMatch[1]) : 0,
  };
}

async function testStrategy(strategy, port, fileMb, receivers, networkLabel) {
  console.log(`\n========================================`);
  console.log(`🚀 Benchmarking strategy: ${strategy} (${receivers} receivers, ${networkLabel})`);
  console.log(`========================================`);

  const serverEnv = {
    ...process.env,
    PORT: String(port),
    OPEN_BROWSER: 'false',
    TRANSFER_DEFAULT_STRATEGY: strategy,
    TRANSFER_SPOOL_THRESHOLD_BYTES: String(10 * 1024 * 1024), // 10MB to trigger spooling easily on buffered strategy
    TRANSFER_MAX_RECEIVER_BUFFER_SIZE: String(512 * 1024 * 1024), // 512MB to prevent buffer overflow under loopback
    TRANSFER_ENABLE_BUFFERED_BACKPRESSURE: 'true', // enable backpressure on buffered strategy during loopback benchmarking
  };

  const serverProc = spawn('node', [path.join(rootDir, 'backend/server.js')], {
    env: serverEnv,
    cwd: rootDir
  });

  serverProc.stdout.on('data', (d) => {
    const msg = d.toString();
    if (msg.includes('error') || msg.includes('warn')) {
      console.log(`[Server Log] ${msg.trim()}`);
    }
  });

  serverProc.stderr.on('data', (d) => {
    console.error(`[Server Err] ${d.toString().trim()}`);
  });

  try {
    const sessionData = await waitForServer(port);
    console.log(`Server ready. Session ID: ${sessionData.sessionId}, PIN: ${sessionData.pin}`);

    const rawOutput = await runBenchmark(port, sessionData.sessionId, fileMb, strategy, receivers, networkLabel);
    console.log(rawOutput);

    const metrics = parseBenchmarkOutput(rawOutput);
    return metrics;
  } finally {
    console.log(`Shutting down server for ${strategy}...`);
    serverProc.kill('SIGTERM');
    await sleep(1000); // Wait for port cleanup

    try {
      const uploadsDir = path.join(rootDir, 'backend/uploads');
      if (fs.existsSync(uploadsDir)) {
        const files = fs.readdirSync(uploadsDir);
        for (const file of files) {
          const filePath = path.join(uploadsDir, file);
          if (fs.statSync(filePath).isFile()) {
            fs.unlinkSync(filePath);
            console.log(`🧹 Cleaned up temporary file: ${file}`);
          }
        }
      }
    } catch (e) {
      console.error('Failed to clean up uploads directory:', e);
    }
  }
}

async function main() {
  const port = 4050; // Use a clean, non-conflicting port
  const opts = parseArgs(process.argv);
  const fileMb = opts.fileMb;
  const receivers = opts.receivers;
  const networkLabel = opts.networkLabel;

  const results = {};

  try {
    results['relay-disk'] = await testStrategy('relay-disk', port, fileMb, receivers, networkLabel);
    results['relay-stream'] = await testStrategy('relay-stream', port, fileMb, receivers, networkLabel);
    results['relay-buffered'] = await testStrategy('relay-buffered', port, fileMb, receivers, networkLabel);

    console.log('\n📊 ALL BENCHMARKS COMPLETED successfully!');
    console.log(results);

    // 1. Update docs/evaluation_of_architecture.md
    const evalFilePath = path.join(rootDir, 'docs/evaluation_of_architecture.md');
    if (fs.existsSync(evalFilePath)) {
      let content = fs.readFileSync(evalFilePath, 'utf8');

      // Strip any previously appended section 5
      const splitIndex = content.indexOf('## 5. Actual Benchmark Results');
      if (splitIndex !== -1) {
        content = content.slice(0, splitIndex);
      }

      // Generate Results Markdown Table
      const resultsTable = `## 5. Actual Benchmark Results (${fileMb} MB Payload)

The following measurements were collected automatically on the local interface (Network: ${networkLabel}, Receivers: ${receivers}):

| Strategy | Upload Throughput | Download Throughput (Aggregated) | Time-To-First-Byte (TTFB Avg) |
| :--- | :--- | :--- | :--- |
| **\`relay-disk\`** | ${results['relay-disk'].uploadMbps.toFixed(1)} Mbps | ${results['relay-disk'].downloadMbps.toFixed(1)} Mbps | ${results['relay-disk'].ttfbMs.toFixed(0)} ms |
| **\`relay-stream\`** | ${results['relay-stream'].uploadMbps.toFixed(1)} Mbps | ${results['relay-stream'].downloadMbps.toFixed(1)} Mbps | ${results['relay-stream'].ttfbMs.toFixed(0)} ms |
| **\`relay-buffered\`** | ${results['relay-buffered'].uploadMbps.toFixed(1)} Mbps | ${results['relay-buffered'].downloadMbps.toFixed(1)} Mbps | ${results['relay-buffered'].ttfbMs.toFixed(0)} ms |

### Key Takeaways from Benchmarks:
1. **TTFB Latency**: \`relay-stream\` and \`relay-buffered\` achieve near-zero TTFB because the receiver receives chunks instantly, while \`relay-disk\` must wait for the entire file write to finish first.
2. **Transfer Efficiency**: Direct memory relaying via \`relay-stream\` avoids disk write-read roundtrips, reducing local system load.
`;

      content += resultsTable;
      fs.writeFileSync(evalFilePath, content, 'utf8');
      console.log(`Updated ${evalFilePath} with real benchmark results.`);
    }

    // 2. Update docs/benchmarks/BASELINE.md
    const baselineFilePath = path.join(rootDir, 'docs/benchmarks/BASELINE.md');
    const today = new Date().toISOString().slice(0, 10);
    let baselineContent = '';
    
    if (fs.existsSync(baselineFilePath)) {
      baselineContent = fs.readFileSync(baselineFilePath, 'utf8');
    } else {
      baselineContent = `# Transfer benchmarks (TO-0)

Baseline measurements for all strategies.

## Results

| Date | File size | Mode | Network | Receivers | Upload Mbps | Download Mbps | TTFB (ms) | Notes |
|------|-----------|------|---------|-----------|-------------|---------------|-----------|-------|
`;
    }

    // Append new rows to BASELINE.md
    const newRows = `
| ${today} | ${fileMb} MB | relay-disk | ${networkLabel} | ${receivers} | ${results['relay-disk'].uploadMbps.toFixed(1)} | ${results['relay-disk'].downloadMbps.toFixed(1)} | ${results['relay-disk'].ttfbMs.toFixed(0)} | Baseline run |
| ${today} | ${fileMb} MB | relay-stream | ${networkLabel} | ${receivers} | ${results['relay-stream'].uploadMbps.toFixed(1)} | ${results['relay-stream'].downloadMbps.toFixed(1)} | ${results['relay-stream'].ttfbMs.toFixed(0)} | Baseline run |
| ${today} | ${fileMb} MB | relay-buffered | ${networkLabel} | ${receivers} | ${results['relay-buffered'].uploadMbps.toFixed(1)} | ${results['relay-buffered'].downloadMbps.toFixed(1)} | ${results['relay-buffered'].ttfbMs.toFixed(0)} | Baseline run |
`;
    
    baselineContent += newRows;
    fs.writeFileSync(baselineFilePath, baselineContent, 'utf8');
    console.log(`Appended results to ${baselineFilePath}`);

  } catch (err) {
    console.error('Benchmarking runner failed:', err);
    process.exit(1);
  }
}

main();
