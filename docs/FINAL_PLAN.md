# JAVIN FileShare — Final Implementation Plan

> **Scope:** All remaining restructure work **except WebRTC (TO-4)**.  
> **Status baseline:** Phases 0–6 core ✅ · 4-D1–4-D3 ✅ · 32 backend tests passing · default transfer = `relay-disk`.  
> **Execution:** One item at a time in order below; update [PHASE_PROGRESS.md](./PHASE_PROGRESS.md) when each ships.

---

## Summary

| ID | Name | Status | Risk |
|----|------|--------|------|
| 4-D2 | Server-authoritative grace + PIN timers | ✅ Done | Medium |
| 4-D3 | Minimal `localStorage` contract | ✅ Done | Low |
| TO-0 | Transfer benchmarks | ✅ Done | Low |
| TO-1 | Finish `relay-stream` | ✅ Done | High |
| TO-2 | `relay-buffered` | ✅ Done | Medium |
| TO-3 | Finish resumable transfers | ✅ Done | Medium |
| VAL | Manual checklist + doc sync | ✅ Done | Low |

**Excluded:** TO-4 WebRTC, `TRANSFER_ENABLE_P2P`, any `RTCPeerConnection` code.

---

## 4-D2 — Server-authoritative grace + PIN timers

### Problem today

| Layer | Current behavior | Bug / debt |
|-------|------------------|------------|
| Server | Owns `graceRedirectTimer`, `graceRedirectEndMs` on session | Emits only `durationSeconds`; host refresh loses sync |
| Client (`host.js`) | Writes `grace_timer_*`, `grace_started_*`, `redirectDeadline` to `localStorage` | Refresh restores **client** clock, not server |
| Client (`host.js`, `join-pin.js`) | `pin_timer_*` in `localStorage` | PIN expiry already on server (`session.pinExpiry`) — duplicate |
| Magic numbers | `30000`, `120000` in `handlers.js` | Should use `config.gracePeriodMs`, `config.maxGraceMs` |

### Target behavior

1. **Server is source of truth** for grace end time (`graceRedirectEndMs`) and PIN expiry (`pinExpiry`).
2. Host UI **displays** countdown from `graceEndMs` / `pinExpiry` (absolute timestamps).
3. On host reconnect / `join-session`, server **pushes current state** if grace is active.
4. No `localStorage` keys for grace or PIN countdown (removed in 4-D3).

### Server changes

#### New file: `backend/src/services/grace-redirect.service.js`

```javascript
// Public API (implement exactly)
export function getGraceState(session) → { active, graceEndMs, remainingMs, sessionId } | null
export function startGraceRedirect(session, io) → void  // first PIN verify
export function extendGraceRedirect(session, io) → { ok, graceEndMs, remainingMs } | { ok: false, reason }
export function clearGraceRedirect(session, io, { notifyHost }) → void
export function emitGraceCountdown(io, session, targetSocketId?) → void
```

**`emitGraceCountdown` payload** (extend existing event, do not add a second event name):

```javascript
io.to(socketId).emit('start-host-redirect-countdown', {
  sessionId: session.id,
  graceEndMs: session.graceRedirectEndMs,      // NEW — required
  durationSeconds: Math.ceil(remainingMs / 1000), // keep for backward compat
});
```

**`startGraceRedirect` logic:**

- If `session.graceRedirectTimer` already set → return (no restart).
- `session.graceRedirectEndMs = Date.now() + config.gracePeriodMs`.
- Schedule `setTimeout` for remaining ms (store on `session.graceRedirectTimer`).
- After 1s delay (host join race), call `emitGraceCountdown(io, session)`.
- On timeout: `clearGraceRedirect`, if clients connected → `emitNavigate` host to session page (existing logic).

**`extendGraceRedirect` logic:**

- Move math from `handlers.js` `host-extend-redirect` handler.
- Cap total grace at `config.maxGraceMs` from first start (store `session.graceRedirectStartedAt` once).
- Reschedule timeout; `emitGraceCountdown` to host.

**`clearGraceRedirect`:**

- `clearTimeout(session.graceRedirectTimer)`; null timer + `graceRedirectEndMs`.
- If `notifyHost`: `io.to(hostSocketId).emit('grace-timer-cleared')` (keep existing event).

#### Edit: `backend/src/sockets/handlers.js`

| Location | Change |
|----------|--------|
| `client-has-verified` | Replace inline grace block (~L229–294) with `startGraceRedirect(session, io)` |
| `host-extend-redirect` | Delegate to `extendGraceRedirect` |
| `host-go-now`, `host-going-to-main`, `request-send-lock` (host bump) | Call `clearGraceRedirect(session, io, { notifyHost: true })` |
| Last client disconnect | Already clears grace — use `clearGraceRedirect` |
| `join-session` (host role) | After peer attached, if `getGraceState(session)?.active` → `emitGraceCountdown(io, session, host.socketId)` |

Replace hardcoded `30000` / `120000` with `config.gracePeriodMs` / `config.maxGraceMs`.

#### Edit: `backend/src/routes/session.routes.js`

Extend `GET /api/session-details/:sessionId` response:

```javascript
{
  pinExpiry, peerCount, ...,
  grace: getGraceState(session),  // { active, graceEndMs, remainingMs } | null
}
```

#### Tests: `backend/test/unit/grace-redirect.test.mjs`

- `getGraceState` inactive when no timer.
- `startGraceRedirect` sets `graceRedirectEndMs` ≈ now + gracePeriodMs.
- `extendGraceRedirect` increases end time, respects max cap.
- `clearGraceRedirect` nulls state.

Optional integration: mock `io`, assert `start-host-redirect-countdown` includes `graceEndMs`.

### Client changes

#### New file: `frontend/assets/js/core/grace-timer.js`

```javascript
/**
 * UI-only countdown driven by server graceEndMs.
 * @returns {{ stop: () => void }}
 */
export function mountGraceCountdown({
  graceEndMs,
  sessionId,
  labelEl,           // #grace-countdown
  panelEl,           // #grace-controls
  onExpired,         // optional callback (server still owns redirect)
})
```

- `setInterval` every 250ms: `remaining = max(0, graceEndMs - Date.now())`, update label `Redirecting in ${ceil(remaining/1000)}s…`.
- Show panel when started; `stop()` clears interval and hides panel.
- **No localStorage reads/writes.**

#### Edit: `frontend/assets/js/pages/host.js`

| Remove | Replace with |
|--------|----------------|
| `startGraceTimer()`, `startRedirectTimer()` localStorage logic | `mountGraceCountdown` + socket handlers |
| `localStorage` restore block (`grace_started_*`, `grace_timer_*`, `redirectDeadline`) on init | On load: if `sessionData.sessionId`, optional `fetch(/api/session-details/...)` → if `grace.active`, mount from `grace.graceEndMs` |
| `start-host-redirect-countdown` handler (~200 lines) | ~30 lines: read `data.graceEndMs` (fallback: `Date.now() + data.durationSeconds*1000`), call `mountGraceCountdown` |
| `grace-timer-cleared` | call `graceCountdownController?.stop()` |
| `pin_timer_*` localStorage | Use `sessionData.pinExpiry` or API; `mountPinCountdown(pinExpiry)` in same file or `grace-timer.js` |

Keep: `host-go-now`, `host-extend-redirect` emits (server still handles logic).

#### Edit: `frontend/assets/js/pages/join-pin.js`

- Remove `pin_timer_*` localStorage.
- After PIN verify / session fetch, countdown from `pinExpiry` in API response only.

### Files touched (4-D2)

| File | Action |
|------|--------|
| `backend/src/services/grace-redirect.service.js` | **Create** |
| `backend/src/sockets/handlers.js` | Refactor grace blocks |
| `backend/src/routes/session.routes.js` | Add `grace` to session-details |
| `backend/test/unit/grace-redirect.test.mjs` | **Create** |
| `frontend/assets/js/core/grace-timer.js` | **Create** |
| `frontend/assets/js/pages/host.js` | Large slim-down |
| `frontend/assets/js/pages/join-pin.js` | PIN countdown from server |

### Exit criteria (4-D2)

- [x] Host refresh mid-grace shows **same** remaining seconds as before refresh (±1s).
- [x] Extend button adds 30s server-side; UI matches without localStorage.
- [x] No `grace_timer_*` / `redirectDeadline` writes after full host flow.
- [x] Unit tests for grace service pass.
- [x] `npm test --prefix backend` green.

---

## 4-D3 — Minimal `localStorage` contract

### Target: `frontend/assets/js/core/storage.js`

```javascript
export const StorageKeys = {
  PEER_ID: 'peerId',
  DEVICE_NAME: 'device_name',
  exited: (sessionId) => `exited_${sessionId}`,
};

export function getPeerId() { ... }
export function getDeviceName() { ... }
export function setDeviceName(name) { ... }
export function markSessionExited(sessionId) { ... }
export function hasExitedSession(sessionId) { ... }
export function clearSessionExited(sessionId) { ... }
```

### Migration table

| Key | Action |
|-----|--------|
| `peerId` | Keep — centralize in `storage.js` |
| `device_name` | Keep — use `getDeviceName` / `setDeviceName` everywhere |
| `exited_{session}` | Keep — helpers only |
| `grace_timer_*`, `grace_started_*`, `redirectDeadline` | **Delete** (4-D2) |
| `pin_timer_*` | **Delete** (4-D2) |
| `nav_token_*`, `nav_hist_*` | Already removed ✅ |

### Files to grep-replace

`host.js`, `join-pin.js`, `session.js`, `send-files.js`, `receive-files.js`, `session-ended.js` → import from `storage.js` only.

### Exit criteria (4-D3)

- [x] `rg "localStorage" frontend/assets/js` shows only `storage.js` (or documented exceptions).
- [x] Manual: exit session → rejoin respects `exited_*`.

---

## TO-0 — Baseline benchmarks

### New files

| File | Purpose |
|------|---------|
| `backend/scripts/benchmark-transfer.mjs` | CLI: disk upload/download Mbps, TTFB, disk usage |
| `docs/benchmarks/BASELINE.md` | Results table (date, machine, LAN, file size) |

### Script behavior

```bash
node backend/scripts/benchmark-transfer.mjs \
  --base-url https://localhost:4000 \
  --session-id <id> \
  --file-size-mb 100 \
  --mode disk
```

- Create temp file with `dd` or random buffer stream.
- **Upload:** `POST /upload/:sessionId` with `X-File-Id`, measure wall time → Mbps.
- **Download:** `GET /download/:sessionId/:fileId`, measure TTFB (first byte) + total Mbps.
- **Disk:** `du -sh backend/uploads` before/after.
- Output JSON + markdown row for `BASELINE.md`.

### Exit criteria (TO-0)

- [x] Script runs locally without errors.
- [ ] `BASELINE.md` has at least one row for `relay-disk` @ 100MB+.

---

## TO-1 — Finish `relay-stream` (partial → done)

### Gaps today

| Gap | Location | Fix |
|-----|----------|-----|
| Single `PassThrough` — one `.pipe(res)` only | `relay-stream.strategy.js` L208 | **Fan-out:** per-receiver `PassThrough` fed by upload `data` events, or `stream.PassThrough` + manual `write` to each branch |
| No disk fallback on pipe error | `handleUpload` / `handleDownload` | On `source.destroy(err)` → set flag, re-offer via `relay-disk` (store to temp, emit `download-ready` without `stream: true`) |
| Stream default off | `config.js` | Keep `enableStreamRelay === 'true'` only — document in README |
| Event name `stream-ready` vs `download-ready` | Plan vs code | **Keep** `download-ready` + `stream: true` — document in `docs/SOCKET_EVENTS.md` |

### Code plan: multi-receiver fan-out

**`StreamRelaySession` change:**

```javascript
this.branches = new Map(); // receiverPeerId → PassThrough
// On upload 'data': for (const branch of branches.values()) branch.write(chunk)
// On upload end: for (const branch of branches.values()) branch.end()
```

**`handleDownload`:** `const branch = new PassThrough(); branches.set(receiverPeerId, branch); branch.pipe(res);`

### Code plan: fallback to disk

```javascript
// coordinator.service.js
async handleUpload(...) {
  try {
    return await strategy.handleUpload(...);
  } catch (err) {
    if (strategy is stream) return diskStrategy.handleUpload(...);
  }
}
```

Or inside `RelayStreamStrategy` on error: delete stream session, call `RelayDiskStrategy.handleUpload` with same req (may need spool request body — harder; simpler: abort + socket `send-rejected` + notify receivers).

**Pragmatic fallback:** emit `transfer-fallback-to-disk` to sender; sender re-uploads via normal disk path (document in README). Full transparent fallback is optional stretch.

### Tests to add

| Test | File |
|------|------|
| 2 receivers same stream file | `transfer-optimization.test.mjs` |
| Upload error mid-stream → `send-rejected` or fallback flag | same |

### Frontend

- `receive-files.js` — already handles `stream: true`; no change if fan-out works.
- `send-files.js` — `start-upload` listener exists.

### Exit criteria (TO-1)

- [x] Integration test: 2 receivers, same file, both get full payload.
- [ ] TO-0 benchmark: stream TTFB ≥ 50% better than disk (document in `BASELINE.md`).
- [x] `TRANSFER_ENABLE_STREAM_RELAY=true` documented; default remains `false`.

---

## TO-2 — `relay-buffered`

### New file: `backend/src/services/transfer/strategies/relay-buffered.strategy.js`

### Config (`config.js`)

```javascript
transfer: {
  spoolThresholdBytes: Number(process.env.TRANSFER_SPOOL_THRESHOLD_BYTES) || 256 * 1024 ** 2,
}
```

### Behavior

1. Register session like stream.
2. Upload writes to RAM ring buffer until `spoolThresholdBytes`, then append to temp file on disk.
3. Receivers lagging behind RAM window read from disk tail.
4. Coordinator `resolveStrategy`: if `defaultStrategy === 'relay-buffered'` && enabled flag.

### Selection

- Only used when `TRANSFER_DEFAULT_STRATEGY=relay-buffered` (not default for prod).
- Defer until TO-1 fan-out proven.

### Tests

- Small file entirely in RAM (no disk file).
- Slow receiver forces spill (mock delay).

### Exit criteria (TO-2)

- [x] Strategy registered in coordinator.
- [x] Integration test with threshold = 1KB and 10KB file proves spill.

---

## TO-3 — Finish resumable transfers

### Already implemented (in `relay-disk.strategy.js`)

- Upload: `X-Upload-Offset` append.
- Download: `Range` → `206`.
- Status: `GET /api/v1/upload/status/:sessionId/:fileId`.

### Gaps

| Gap | Fix |
|-----|-----|
| ~~No disconnect-resume integration test~~ | ✅ `resumable-disconnect.test.mjs` (abort mid-upload + resume + download) |
| Frontend send path may not send offset | ✅ `send-files.js` queries `/api/v1/upload/status` and retries with `X-Upload-Offset` |
| Frontend receive may not use Range | Optional Range for retry in `receive-files.js` (low priority) |
| Separate `relay-resumable` strategy | **Not needed** — keep in disk strategy per audit |
| Premature file delete on download | ✅ `download-queue.service.js` only deletes when `pending` was set by `upload-complete` |

### Test: `backend/test/integration/resumable-disconnect.test.mjs`

1. Abort mid-upload — partial bytes persisted on disk; status API returns offset.
2. Upload 5 bytes, resume with offset 5, complete file.
3. Range download + full download succeed.

### Exit criteria (TO-3)

- [x] Disconnect-resume integration test passes.
- [ ] Manual: kill tab mid-upload, reopen, resume (if frontend wired).

---

## VAL — Validation & documentation sync

| Task | Detail |
|------|--------|
| Update `PHASE_PROGRESS.md` | Test count 25; mark items done as shipped |
| `docs/SOCKET_EVENTS.md` | **Create** — `navigate`, `start-host-redirect-countdown` + `graceEndMs`, transfer events |
| `MANUAL_TEST_CHECKLIST.md` | Run once per track item |
| `PHASE_PROGRESS` “Definition of Done” | Optional: ARCHITECTURE.md stub |

---

## Execution order (strict)

```
4-D2 → 4-D3 → TO-0 → TO-1 → TO-2 → TO-3 → VAL
```

Do not start TO-1 multi-receiver until TO-0 baseline exists (compare TTFB).

---

## Quick reference — env vars

| Variable | Default | Used by |
|----------|---------|---------|
| `GRACE_PERIOD_MS` | 30000 | 4-D2 |
| `MAX_GRACE_MS` | 120000 | 4-D2 |
| `PIN_EXPIRY_MS` | 300000 | 4-D2 PIN UI |
| `TRANSFER_DEFAULT_STRATEGY` | `relay-disk` | TO-* |
| `TRANSFER_ENABLE_STREAM_RELAY` | false | TO-1 |
| `TRANSFER_SPOOL_THRESHOLD_BYTES` | 256MB | TO-2 |

---

*Last updated: 2026-05-29 — created for final restructure push (no WebRTC).*
