# Transfer benchmarks (TO-0)

Baseline measurements for all strategies under different network interfaces and client concurrencies.

## Results

| Date | File size | Strategy | Network | Receivers | Upload Mbps | Download Mbps | TTFB (ms) | Notes |
|:---|:---|:---|:---|:---|:---|:---|:---|:---|
| 2026-06-21 | 10240 MB | relay-disk | loopback | 1 | 4315.6 | 9693.1 | 15 | Loopback benchmark |
| 2026-06-21 | 10240 MB | relay-stream | loopback | 1 | 5044.0 | 4980.8 | 8 | Loopback benchmark |
| 2026-06-21 | 10240 MB | relay-buffered | loopback | 1 | 4936.1 | 4846.4 | 10 | Loopback benchmark |
| 2026-06-21 | 10240 MB | relay-stream | hotspot-2g | 1 | 4641.8 | 4564.0 | 17 | Local loopback run with hotspot tag |

| 2026-06-21 | 100 MB | relay-disk | loopback-disk-write | 1 | 3394.6 | 4632.0 | 6 | Baseline run |
| 2026-06-21 | 100 MB | relay-stream | loopback-disk-write | 1 | 3598.2 | 1493.4 | 9 | Baseline run |
| 2026-06-21 | 100 MB | relay-buffered | loopback-disk-write | 1 | 3247.8 | 1429.8 | 16 | Baseline run |

| 2026-06-21 | 100 MB | relay-disk | loopback-disk-write | 1 | 3002.1 | 4621.7 | 7 | Baseline run |
| 2026-06-21 | 100 MB | relay-stream | loopback-disk-write | 1 | 3444.0 | 1462.2 | 15 | Baseline run |
| 2026-06-21 | 100 MB | relay-buffered | loopback-disk-write | 1 | 3175.7 | 1405.5 | 7 | Baseline run |

| 2026-06-21 | 100 MB | relay-disk | loopback-disk-write | 1 | 3367.5 | 4548.8 | 6 | Baseline run |
| 2026-06-21 | 100 MB | relay-stream | loopback-disk-write | 1 | 3331.5 | 1439.2 | 14 | Baseline run |
| 2026-06-21 | 100 MB | relay-buffered | loopback-disk-write | 1 | 3358.9 | 1451.0 | 7 | Baseline run |
