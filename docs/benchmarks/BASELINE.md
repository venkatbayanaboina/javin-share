# Transfer benchmarks (TO-0)

Baseline measurements for all strategies under different network interfaces and client concurrencies.

## Results

| Date | File size | Strategy | Network | Receivers | Upload Mbps | Download Mbps | TTFB (ms) | Notes |
|:---|:---|:---|:---|:---|:---|:---|:---|:---|
| 2026-06-21 | 10240 MB | relay-disk | loopback | 1 | 4315.6 | 9693.1 | 15 | Loopback benchmark |
| 2026-06-21 | 10240 MB | relay-stream | loopback | 1 | 5044.0 | 4980.8 | 8 | Loopback benchmark |
| 2026-06-21 | 10240 MB | relay-buffered | loopback | 1 | 4936.1 | 4846.4 | 10 | Loopback benchmark |
| 2026-06-21 | 10240 MB | relay-stream | hotspot-2g | 1 | 4641.8 | 4564.0 | 17 | Local loopback run with hotspot tag |
