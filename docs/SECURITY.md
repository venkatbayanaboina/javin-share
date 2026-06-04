# JAVIN FileShare — Security Model

This document describes the trust boundaries and controls implemented for the LAN file-sharing server.

## Threat model (summary)

| Asset | Risk | Mitigation |
|-------|------|------------|
| Host machine | Any peer stops the Node process | `POST /api/shutdown` and `announce-shutdown` require **host** `peerId` in an active session |
| Session PIN (6 digits) | Brute force on join | Per-IP (+ per-session) rate limit, lockout, `429` + `Retry-After` |
| Uploaded files | Disk exhaustion / path traversal | Busboy `fileSize` limit; sanitized filenames; storage path derived from server-side ids |
| Downloads | Path traversal / header injection | Resolve stored path under `uploads/`; safe `Content-Disposition` |
| Debug data | Queue state leak | `/debug/queues` **removed** |

## Trust assumptions

- Users are on a **trusted local network** (home/office Wi‑Fi). TLS uses a **self-signed** certificate; clients must accept the cert once.
- Anyone who can reach the server IP/port can attempt to join if they guess or obtain the PIN and session id.
- The **host** is trusted to run and stop the server.

## Controls

### Host-only shutdown

- **HTTP:** `POST /api/shutdown` body: `{ force: true, sessionId, peerId }` — server checks `peerId` is `role: 'host'` in `sessionId`.
- **Socket:** `announce-shutdown` with `{ sessionId, peerId }` — same check before `server-shutdown` broadcast.

### PIN rate limiting

Environment variables (see `.env.example`):

- `PIN_MAX_ATTEMPTS` (default 8) per window
- `PIN_RATE_WINDOW_MS` (default 15 minutes)
- `PIN_LOCKOUT_MS` (default 5 minutes)

Applies to `POST /api/verify-pin` and `POST /api/find-session-by-pin`.

### Upload limits

- `MAX_FILE_SIZE_BYTES` (default 50 GiB) enforced via Busboy `limits.fileSize` and stream byte counting.
- Single file per request (`limits.files: 1`).
- `fileId` must match `[a-zA-Z0-9_-]{1,64}`.

### Download safety

- `sessionId` and `fileId` validated as safe ids.
- On-disk path must equal `uploads/{sessionId}-{fileId}` (resolved, no `..`).
- Optional `?receiver=` must be a connected peer in the session.
- Filename sanitized for `Content-Disposition`.

## Out of scope (current release)

- Authentication beyond session PIN
- Encryption at rest for uploads
- Multi-tenant / internet exposure hardening
- WebRTC or P2P (relay-only transfer)

## Reporting

For security issues, contact the repository maintainer privately rather than opening a public issue with exploit details.
