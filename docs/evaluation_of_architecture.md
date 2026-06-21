# Architecture Evaluation and Performance Benchmarking Report

This document provides a comprehensive evaluation of the JAVIN Share file transfer architecture. It describes the test methodologies, integration test verification, server resource profiling under load, and the CLI benchmarking suite.

---

## 1. Executive Summary

JAVIN Share implements three distinct transfer strategies designed to balance performance, memory usage, and client connection flexibility:

1. **`relay-disk` (Standard Disk Spool)**:
   - **Mechanism**: The sender uploads the file completely to disk; once finalized, the receiver downloads it.
   - **Best For**: Unreliable network connections, large files where sender and receiver cannot be online at the exact same time, and resumable downloads.
   - **Resource Footprint**: High disk I/O, low/flat memory usage.

2. **`relay-stream` (Direct Memory Relay)**:
   - **Mechanism**: Incoming stream chunks are piped directly to connected receivers via memory buffers, skipping disk writes.
   - **Best For**: Maximum throughput and minimum Time-to-First-Byte (TTFB) on fast networks.
   - **Resource Footprint**: Near-zero disk I/O, extremely low memory usage (~40–80 MB) regardless of the file size.

3. **`relay-buffered` (Hybrid Buffer with Disk Spill)**:
   - **Mechanism**: Stores incoming bytes in RAM up to a threshold (e.g., 50MB). If the size is exceeded, it spills (spools) remaining and future chunks to disk. Late receivers read from disk first before catching up to the live queue.
   - **Best For**: Multi-client sharing with differing network speeds or delayed start times.
   - **Resource Footprint**: Moderate memory usage (capped by threshold), moderate disk I/O only when exceeding the buffer cap.

---

## 2. Detailed Test Methodology (Phase 2 Scenarios)

### Test 1: Raw Speed & Backpressure Test (Using `curl`)
* **Objective**: Measure absolute network throughput and Time-to-First-Byte (TTFB) without frontend/browser UI overhead.
* **Setup**:
  1. Generate a dummy file (e.g., 5GB):
     - **macOS/Linux**: `dd if=/dev/zero of=testfile.bin bs=1M count=5000`
     - **Windows**: `fsutil file createnew testfile.bin 5368709120`
  2. Start the receiver curl stream:
     ```bash
     curl -k -N https://<SERVER_IP>:4000/api/download/<PIN> > /dev/null
     ```
  3. Start the sender upload stream:
     ```bash
     curl -k -T testfile.bin https://<SERVER_IP>:4000/api/upload/<PIN>
     ```
* **Evaluation Criteria**: Observe throughput and time to complete. `relay-stream` should match line bandwidth speed with near 0ms TTFB. `relay-disk` will show a delay equal to upload write duration before download bytes start flowing.

### Test 2: The `relay-buffered` Spill & Late-Receiver Test
* **Objective**: Verify that the hybrid logic correctly manages the RAM-to-disk transition and handles late-joining clients without out-of-order errors.
* **Setup**:
  1. Configure `spoolThresholdBytes` to a low value (e.g. 50MB).
  2. Start uploading a 2GB file from Client A.
  3. Allow 200MB to upload, then connect Client B (the late receiver).
* **Evaluation Criteria**: Monitor the server console logs. Client B must:
  - Read from the temporary disk spool (`fs.createReadStream`).
  - Queue live chunks to a local memory buffer (`catchingUp.queue`).
  - Flush the queue and switch to the live stream upon catching up.
  - The downloaded file hash must match the source file hash exactly.

### Test 3: Server Resource Profiling Under Load
* **Objective**: Confirm that memory usage does not leak or scale linearly with file size (ensuring Node.js streams backpressure handles memory consumption correctly).
* **Setup**:
  1. Monitor server resources using `htop` (Linux/macOS) or Performance Monitor (Windows).
  2. Perform a massive (20GB+) file transfer.
* **Evaluation Criteria**:
  - **`relay-stream`**: Server RAM must stay completely flat (constant between 40MB and 80MB) regardless of file progress.
  - **`relay-buffered`**: RAM must rise up to the configured `spoolThresholdBytes` threshold and immediately flatline (plateau) once disk spooling is triggered.

### Test 4: Simulated Network Degradation (Wi-Fi Emulation)
* **Objective**: Ensure that network failures are cleaned up gracefully or support resumes where applicable.
* **Setup**:
  1. Open Chrome DevTools -> Network -> Throttling -> Set to "Fast 3G" or custom.
  2. Start downloading a large file.
  3. Toggle to "Offline" for 5 seconds, then toggle back.
* **Evaluation Criteria**:
  - In **`relay-disk`** mode, the client must request the remaining chunk offset using HTTP Range headers (e.g. `Range: bytes=104857600-`), and the server must return `206 Partial Content`.
  - In **`relay-stream`** / **`relay-buffered`** modes, if all receivers disconnect, the server must automatically clean up the temporary session buffers and unlock the transmission slot (`transfer-unlocked` event).

---

## 3. Integration Test Results

The automated test suite runs comprehensive integration tests for all strategies, covering edge cases like timeout triggers, late receivers, and buffer stalls.

### Test Run Summary (2026-06-21)
* **Total Tests**: 44
* **Total Suites**: 18
* **Status**: 100% Passing (0 failures, 0 skipped)
* **Duration**: ~6.6 seconds

### Optimization Tests Covered:
- **`relay-stream` Direct Piping**: Verifies chunk-by-chunk real-time forwarding to receivers.
- **`relay-stream` Timeout fallback**: Checks if the server falls back to disk spooling if no receivers connect within the timeout window.
- **`relay-buffered` Disk Spill**: Verifies memory threshold boundary checks.
- **`relay-buffered` Late Receivers**: Validates spool catch-up mechanics and queuing.
- **Buffer Stall Safeguards**: Verifies that slow/stalled receivers exceeding the memory buffer limit (16MB cap) are disconnected to prevent heap exhaustion.

---

## 4. Benchmark Execution Guide

You can run automated baseline measurements using JAVIN Share's built-in benchmarking script:

```bash
# 1. Start JAVIN Share Server
npm start

# 2. Get a session ID from the host page
# 3. Run the transfer benchmark script (e.g., with a 100MB dummy payload)
node backend/scripts/benchmark-transfer.mjs \
  --base-url https://localhost:4000 \
  --session-id <ACTIVE_SESSION_ID> \
  --file-mb 100
```

### Benchmark Output Format:
The script measures the upload throughput, download TTFB, and download throughput, formatting a result row for documentation:

```text
Benchmark relay-disk
  Session: ABC
  File: 100 MB (104857600 bytes)
  File ID: bench-1782056696

Upload: 1.25s — 640.0 Mbps
Download TTFB: 15 ms
Download: 1.10s — 727.3 Mbps
```
