# Transfer benchmarks (TO-0)

Baseline measurements for **`relay-disk`** before enabling stream/buffered modes.

## How to run

1. Start server: `npm start` (from repo root).
2. Create a session on the host page and note `sessionId` from the URL or network tab.
3. Run:

```bash
node backend/scripts/benchmark-transfer.mjs \
  --base-url https://localhost:4000 \
  --session-id YOUR_SESSION_ID \
  --file-mb 100
```

Append the printed markdown row to the table below.

## Results

| Date | File size | Mode | Upload Mbps | Download Mbps | TTFB (ms) | Notes |
|------|-----------|------|-------------|---------------|-----------|-------|
| _pending_ | 100 MB | relay-disk | — | — | — | Run script on reference LAN |

## Environment template

- **Machine:**
- **OS:**
- **Network:** Wi‑Fi / Ethernet, approximate link speed
- **Node version:**
