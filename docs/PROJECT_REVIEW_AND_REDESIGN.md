# JAVIN FileShare — Project Review & Redesign Plan

> Full review performed 2026-11-07 against `main` (commit `465272a`).
> Scope: backend architecture, frontend UI/CSS/JS, launchers, CI, docs, repo hygiene.
> Guiding constraints: **no breaking changes**, keep the build-less frontend, keep the test suite green at every step.
>
> **Implementation status:** Phases 1-3 and the Phase-4 quick wins are **complete and committed**
> (62/62 tests green): security hardening, error/process handling, sweeps, bug fixes, dead-code
> purge, glassmorphism redesign, gzip + static caching + per-page CSS. Peer-page legacy fields
> fully migrated (single source of truth: `peer.page`). Strategy layer consolidated
> (`releaseTransferLock`, 1 MiB branch buffer, 32 MiB spool default). Socket handlers split into
> `session.lifecycle` / `transfer.handlers` / `page.handlers` with shared `transfer.helpers`.
> Phase 5 tooling/CI/docs complete: Node 18/20/22 CI matrix, `npm audit` gate, frontend ESLint,
> `.env.example` regenerated, planning docs archived, launchers fixed (PORT from env, desktop
> entries outside the repo tree, Windows browser-after-server).

---

## 0. Executive summary

| Area | Verdict |
|---|---|
| Backend architecture | **Good bones** — clean routes → services → state layering, real strategy pattern for transfers, strong path-traversal defense. Weakened by a 1,755-line socket god-module, ~200 duplicated lines across transfer strategies, and unbounded memory/disk growth. |
| Security | **3 high-severity holes** (trusted `X-Forwarded-For`, client-controlled socket `role`, unauthorized downloads) plus DoS-friendly config. Must fix before any polish work. |
| Frontend architecture | **Surprisingly glass-ready (7.5/10)** — single-source design tokens, real component classes, dual themes. But the monolith split is only ~80% complete: JS still renders dead monolith-era classes, and there are **4 runtime bugs introduced by the split** (features silently broken today). |
| UI style | Currently a flat, solid-surface dark UI. Zero `backdrop-filter`, opaque panels, failing contrast tokens. Glassmorphism is achievable almost entirely through `tokens.css` + one new glass layer — not a rewrite. |
| Hygiene | No secrets tracked ✓. Stray dirs, a tracked-but-ignored runtime file, 2,400 lines of completed planning docs, launchers with drifted duplicate logic, no frontend linting. |

**Recommended order: Phase 1 (stability/security) → Phase 2 (bug fixes + dead code) → Phase 3 (glassmorphism) → Phase 4 (performance + architecture) → Phase 5 (tooling/CI).** Each phase is independently shippable.

---

## 1. Critical — fix first (stability & security)

These are live problems; a few crash the server or expose it to any device on the LAN.

### 1.1 Server can crash from a single request (HIGH)
`backend/src/routes/session.routes.js:118` and `:145` — `await QRCode.toDataURL()` inside an Express 4 async handler with **no try/catch**. Express 4 does not catch async rejections → unhandled rejection → **process dies** (Node ≥15 default). Only the `createSession` call is wrapped.
- **Fix:** wrap the handler bodies, or add a tiny `asyncHandler(fn)` wrapper used by all async routes.

### 1.2 No global error / 404 middleware (HIGH)
`backend/src/create-app.js` registers routers and stops. Thrown errors fall through to Express's dev-mode handler → **stack traces returned to LAN clients** (because `NODE_ENV` is never set anywhere, grep-confirmed).
- **Fix:** add error middleware + JSON 404 catch-all; set `NODE_ENV=production` default in `src/index.js`.

### 1.3 `X-Forwarded-For` trusted unconditionally (HIGH — security)
`backend/src/utils/request.js:6-12` — any LAN device can send `X-Forwarded-For: 127.0.0.1` and be treated as the local host. This unlocks host-page access (`pages.routes.js:57-67`), session creation (`session.routes.js:160-163`), and **defeats PIN rate limiting entirely** (spoof a fresh IP per request → fresh bucket, `pin-rate-limit.service.js:7-9`). The app has no proxy by design.
- **Fix:** use `req.socket.remoteAddress` directly; never honor XFF.

### 1.4 Socket role is client-controlled (HIGH — security)
`backend/src/sockets/handlers.js:200-297` — `join-session` accepts `{ role }` verbatim. Any client that learns a `sessionId` (handed to every PIN-verified client) can join as `role:'host'` and then call **`/api/shutdown`** (`session.routes.js:83-108`, "protected" only by `role === 'host'` in `peer-auth.service.js:12-13`) — a remote kill switch. Related: peer actions (`accept-file`, `reject-file`, `leave-session`) trust the payload's `peerId`, so one peer can act on behalf of another (handlers.js:821-827, 1606-1612).
- **Fix (non-breaking):** bind the host role server-side — first peer joining from a local request becomes host; reject `role:'host'` from non-local sockets. Look up peers via `socket.data.peerId`, not payload.

### 1.5 Downloads have no receiver authorization (HIGH — security)
`relay-disk.strategy.js:300-313` / `relay-stream.strategy.js:117-127` — the `?receiver=` param on `/download/:sessionId/:fileId` is echoed, never validated. Anyone on the LAN who sees the URL (it's broadcast in plaintext socket events and lands in browser history) can fetch the file.
- **Fix:** validate `receiverPeerId` against `session.peers` / `acceptedReceivers` before streaming.

### 1.6 Process-hardening gaps (MEDIUM)
- No `server.on('error')` → EADDRINUSE crashes with no message (`src/index.js:27`).
- No `unhandledRejection` / `uncaughtException` handlers → a stray rejection in any socket callback kills the server mid-transfer.
- `gracefulShutdown` (`src/shutdown.js:9-35`) can hang forever — no `closeAllConnections()`, no force-exit timeout.
- **Fix:** all three are ~15 lines total in `index.js` / `shutdown.js`.

### 1.7 Unbounded memory & disk growth (HIGH over time)
- `store.sessions` and `store.transferHistory` are **never swept** — expired sessions stay in RAM forever (`session.routes.js:134-156` creates replacements without deleting old ones).
- Orphaned `tmp-*` / spool files leak on disk; no periodic sweep of `uploadsDir`.
- **Fix:** add a sweep to the existing 5-minute interval (`src/index.js:48-54`); `unref()` both intervals.

### 1.8 Socket.IO mis-tuned for its real workload (MEDIUM)
`src/index.js:35-41`: `maxHttpBufferSize: 1e9` (files go over HTTP, not WS — this is a 1GB-per-message memory-DoS vector), `pingTimeout: 120000` (zombie peers hold send locks for ~2 min), `cors: { origin: '*' }` (any web page can open a cross-site WebSocket and emit events).
- **Fix:** `maxHttpBufferSize: 1e6`, `pingTimeout: 25000`, drop/restrict CORS.

### 1.9 Misc security (MEDIUM)
- PINs use `Math.random()` (`utils/network.js:15-17`) → `crypto.randomInt`.
- PIN logged in plaintext (`session.service.js:87`).
- Unauthenticated benchmark endpoint shipped in prod: `GET /api/benchmark/register-session/...` (`session.routes.js:174-203`) — gate behind an env flag.
- `update-device-name` writes uncapped client strings to `device_names.json` on every event (`handlers.js:335-354`) — clamp to 64 chars + debounce.
- Failed stream uploads never clear the send lock (`relay-stream.strategy.js:75-79`, `relay-buffered.strategy.js:185-200`) → session stuck locked until disconnect. Clear `activeTransfer` + emit `transfer-unlocked` in the error paths.

---

## 2. Glassmorphism UI redesign (the modern look)

**The good news:** the recent token refactor makes this a *value swap + one new glass layer*, not a rewrite. Every surface, border, shadow and tint already resolves to `assets/css/tokens.css`; dual themes are token-mirrored; motion tokens and `prefers-reduced-motion` already exist.

### 2.1 The design system to introduce

Add to `tokens.css` (keep all existing names, change values):

```css
:root {
  /* NEW glass tokens */
  --glass-blur: 18px;
  --glass-saturate: 160%;
  --glass-bg: rgba(255, 255, 255, 0.07);         /* panels */
  --glass-bg-strong: rgba(255, 255, 255, 0.10);  /* modals, toasts */
  --glass-highlight: inset 0 1px 0 rgba(255, 255, 255, 0.08);
  --glass-border: rgba(255, 255, 255, 0.14);

  /* CHANGED values */
  --surface: var(--glass-bg);            /* was solid #111a2c */
  --surface-2: var(--glass-bg-strong);   /* was solid #16203a */
  --border: var(--glass-border);         /* was rgba(148,163,184,0.16) */
  --overlay: rgba(4, 9, 20, 0.40);       /* was 0.66 — glass modals need lightness */
  --shadow-md: 0 8px 32px rgba(0, 0, 0, 0.35);
  --shadow-lg: 0 24px 64px rgba(0, 0, 0, 0.45);

  /* NEW: vibrant background aurora (3 fixed radial blobs) */
  --bg-accent:
    radial-gradient(900px 500px at 15% -10%, rgba(59, 130, 246, 0.18), transparent 60%),
    radial-gradient(800px 500px at 110% 20%, rgba(139, 92, 246, 0.14), transparent 55%),
    radial-gradient(700px 500px at 50% 120%, rgba(34, 211, 238, 0.10), transparent 60%);

  /* Contrast fixes BEFORE adding translucency (current values fail WCAG AA) */
  --text-2: #b6c2d4;   /* was #a3b0c2 */
  --text-3: #7d8ca3;   /* was #64748b ≈ 3.6:1 on surface */
}
html.light-theme {
  --glass-bg: rgba(255, 255, 255, 0.60);
  --glass-bg-strong: rgba(255, 255, 255, 0.75);
  --glass-border: rgba(15, 23, 42, 0.08);
  /* mirror everything */
}
```

Apply blur in **one** place with a utility + fallback:

```css
.glass {
  background: var(--glass-bg);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  box-shadow: var(--glass-highlight), var(--shadow-md);
}
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .glass { background: var(--surface-fallback); } /* opaque color */
}
```

Then add `.glass` (or the properties directly) to the 12 existing surfaces: `.card` (components.css:110), `.toast` (:410), `.dialog-card` (:540), `.modal-card` (:595), `.error-card` (:652), `.banner` (:301), `.page-status` (:344), `.drop-zone` (:927), `.device-item` (:761), `.log-console` (:1031), `.url-value`/`.url-chip` (:820-846), `.pill` (:247).

**Keep opaque (scanability):** `.qr-frame` (components.css:800) — explicit `backdrop-filter: none; background: #fff`.

**Polish layer:** bigger hero display sizes on `host.html` (PIN page deserves a `--text-3xl`), softer `.btn-primary` glow, icon sprite instead of emoji, `hover: none` media query for touch devices.

### 2.2 Enabling work the glass pass requires (do in this order)

| # | Task | Files | Why it blocks glass |
|---|---|---|---|
| 1 | Delete the duplicate `.is-hidden { display:none !important }` rule | `base.css:147-151` (conflicts with :116-118) | It **silently breaks 4 features today** (see §3.1) and fights the JS show/hide protocol |
| 2 | Convert **155 inline `style=""` attributes** into utility classes (`.stack-3`, `.row`, `.grid-2/.grid-3`, `.center`) | all 7 HTML pages (host 41, send 33, receive 31, session 23, session-ended 11, join-pin 10, history 6) | Inline styles bypass the token layer; also enables deleting the brittle `session.css:8` attribute-substring selector hack |
| 3 | Replace the 12 JS-injected error cards with one `core/fatal-page.js` builder | host.js:54-95, send-files.js:41-81, receive-files.js:47-93, session.js:136-182 | They use **dead classes** (`card-accent-rose`, `orb-pulse` keyframes) and **dead vars** (`--sub`, `--cyan`, `--indigo`) — glass redesign would never reach them |
| 4 | Rebuild JS-rendered dynamic UI on existing classes | send-files.js:499-535, 627-651; receive-files.js:292-313, 444-537 | The send-page upload progress and receive-page progress/history are currently **entirely unstyled** (dead `.stat-*`, `.progress-track`, `.file-row` classes from the monolith) |
| 5 | Replace emoji icons with the SVG sprite | session.js:192-193, receive-files.js:304-309, all error cards | Emoji ≠ modern; sprite already exists (and needs pruning: 28 of 39 symbols unused) |
| 6 | Extract the 6 duplicated theme-init `<head>` scripts → `core/theme-init.js`; update `<meta name="theme-color">` on toggle; fix `session-ended.html` (missing theme script); align `manifest.json` colors | 6 HTML files, core/index.js:108-112, manifest.json | Consistent theme behavior across the redesigned app |
| 7 | **Bump `sw.js` `CACHE_NAME` to `v4` and regenerate `STATIC_ASSETS`** in the same commit as any file changes | sw.js | `cache.addAll` is atomic — a stale list with a missing file would block all future SW installs |

### 2.3 Non-breaking strategy
- Network-first service worker means **online clients get the new CSS immediately**; bumping `CACHE_NAME` covers offline.
- Keep every class name and token *name*; only values and layers change → zero JS contract breaks.
- The 56-test suite + a quick manual pass over the 7 pages per phase is sufficient regression cover (no visual snapshot infra needed at this scale).

---

## 3. Redundant & legacy code — the delete/rebuild list

### 3.1 Actual bugs from the incomplete monolith split (fix before polishing!)
1. `base.css:148-151` `!important` kills `style.display` toggling → **send-page response timer and the entire Upload Progress card can never appear** (`send-files.html:64,81` + send-files.js:200,206); **join-pin form errors are never visible** (join-pin.js:49,55).
2. `join-pin.js:25` reads `#device-name-input` but the HTML id is `device-name` (join-pin.html:44) → **crash on prefill when a stored device name exists**.
3. `session.js:292` queries a `<span>` that doesn't exist in session.html:54 → **device count never updates on the session page**.
4. `session.js:487` overwrites `transferStatus.className` with two nonexistent classes → banner loses all styling after `transfer-unlocked`.

### 3.2 Delete list (zero-risk removals)
| Item | Location | Note |
|---|---|---|
| Stray dir | `backend/backend/` | only `.DS_Store` + empty `uploads/` |
| Empty dir | `backend/utils/` | only `.DS_Store`; real utils live in `src/utils/` |
| Legacy test-runner | `backend/test-runner.js` | superseded by `npm run test:opt`; sets `NODE_TLS_REJECT_UNAUTHORIZED=0` |
| Stale test artifacts | `backend/test/uploads-test/debug-abort*/` | leftover manual-debug upload files |
| Dead migration script | `scripts/extract-page-scripts.mjs` | monolith split done; it only dry-runs |
| Dead exports | `store.getSession`, `getCurrentHostSessionId` (`state/store.js:12-22`); `isPeerOnSend/isPeerOnReceive` (`peer-page.service.js:22-28`); `createPageSocket` (`socket/client.js:41-48`) | grep-verified zero callers |
| Dead state | `store.receiverDownloadFlags` (store.js:6) + its cleanup blocks (handlers.js:1653-1656, 1736-1740) | replaced by `receiverActiveDownloads` |
| Dead UI | `host.js:109 pinTimerInterval` (never assigned), `host.js:862-867 pendingGraceTimer` (never set), unused imports (host.js:14-21, join-pin.js:9-18), `session-ended.html:27` metrics-table, unused CSS (`.badge*`, `.field-hint`, `.pin-label`, `.toast-title`, `.rise-2..6`, `.card-success/.card-danger`), 28 unused sprite symbols | |
| **82 leftover `console.log`s** | 73 in host.js alone (incl. `=== BACKEND RESPONSE DEBUG ===`) | demote/remove |

### 3.3 Consolidations (behavior-preserving)
- **Transfer strategies:** ~200 lines duplicated between `relay-stream` / `relay-buffered` / `relay-disk` (busboy wiring, `handleDownload` scaffolding, `cleanupDownload`, drain backpressure duplicated in `base-stream.strategy.js:101-120` and `relay-buffered.strategy.js:104-123`). Hoist into `BaseStreamStrategy`; keep only the buffering delta in each strategy.
- **Socket god-module:** split `handlers.js` (1,755 lines) into `transfer.handlers.js` / `page.handlers.js` / `session.lifecycle.js`; extract the "all responses received → start or unlock" block copied **4×** (handlers.js:171-192, 751-780, 857-884, 928-952) into one `finalizeOffer()` helper.
- **Frontend helpers:** `logToConsole()` copied 3× (send-files.js:161-176, receive-files.js:201-216, session.js:214-229) → `core/log-console.js`; response-timer countdown duplicated 3× with 3 different globals → reuse `core/grace-timer.js`; native `alert()/confirm()` used ~25× despite `core/confirm.js` existing → wire it.
- **Legacy dual peer-page state:** `peer.currentPage`/`inMain`/`isMainPage` maintained alongside the new `peer.page` ("read by older code paths" per the comment) — but `handlers.js` still reads the legacy fields directly at :441, :468, :479-480, :519, :1538-1539. Finish the migration, drop the legacy fields.
- **Session payload** hand-built in 3 places (`session.routes.js:120-127, 147-154, 167`) → one `buildSessionPayload()` helper.
- **Launchers:** CUSTOM_HOST legacy-reset logic duplicated in `.sh` and `.vbs` and **missing from `.bat`**; port 4000 hardcoded in every launcher ignoring `PORT` in `.env`; `.bat` opens the browser **before** starting the server (bat:193-222 vs server start :222). Extract one shared env-normalization step (a small `launchers/setup-env.mjs` run via `node`).

---

## 4. Performance (fast architecture, no functional changes)

| # | Change | Where | Impact |
|---|---|---|---|
| P1 | Serve static with `maxAge: '1h'` (hashed assets `'30d'`, immutable) + `compression` for text assets | `pages.routes.js:52` | Removes per-load revalidation round-trips on every page |
| P2 | Replace the 9 chained `@import`s in `main.css:5-13` with per-page `<link>` tags (page CSS only on its page) | main.css + 7 HTML files | CSS currently discovered in ~10 serial round trips; also stops shipping all page CSS everywhere |
| P3 | Re-name `TRANSFER_CHUNK_SIZE_BYTES` → branch highWaterMark and resize 8MB → 256KB-1MB | config.js:54, base-stream.strategy.js:5 | Today it's 8MB × N receivers buffered before backpressure engages — ~8-30× more memory than needed |
| P4 | Cap `relay-buffered` RAM: global budget across in-flight buffers, lower default spool threshold (256MB → ~32MB), `pipe()` the late-receiver replay instead of a raw `for..of` loop | relay-buffered.strategy.js:24, :172, :351-353 | Prevents OOM with concurrent transfers |
| P5 | Enforce `MAX_CONCURRENT_DOWNLOADS` inside the download route, not just the socket event | relay-disk.strategy.js / download.routes.js | Direct URL hits bypass the limit; double-downloads delete files early |
| P6 | Free-disk check before accepting uploads (50GB cap with no space check = trivial disk exhaustion) | relay-disk.strategy.js:197 | Robustness |
| P7 | Cache `os.networkInterfaces()` result ~30s | utils/request.js:29-36 | Called on every host-page request |
| P8 | Cap `extend-response-timer` extensions (currently +30s forever, unlike `maxGraceMs`) | handlers.js:1109-1156 | Prevents infinite offer windows |

---

## 5. Tooling, CI & hygiene

1. **Untrack the runtime-written file:** `git rm --cached backend/device_names.json` — it's tracked but also `.gitignore`d, so it dirties every clone after first run.
2. **Commit the current launcher fixes** (localhost-open + readiness poll) — they exist only in the working tree.
3. **Regenerate `.env.example` from `src/config.js`:** add missing `CUSTOM_HOST`, `TRANSFER_CHUNK_SIZE_BYTES`, `TRANSFER_STREAM_RELAY_TIMEOUT_MS`, `TRANSFER_MAX_RECEIVER_BUFFER_SIZE`, `TRANSFER_ENABLE_BUFFERED_BACKPRESSURE`; drop dead `TRANSFER_ENABLE_P2P`.
4. **Frontend tooling:** no lint/format exists for 17 JS modules + `sw.js`. Add ESLint flat config + Prettier for `frontend/assets/js/**`; widen backend globs to `eslint .` (currently skips `server.js`, `scripts/`, `test-runner.js`).
5. **CI:** matrix Node 18/20/22 (engines says ≥18 but CI tests only 22), add `npm audit --omit=dev`, Dependabot, `shellcheck launchers/*.sh`, and a step running root-level scripts so delegation typos are caught.
6. **Docs:** archive ~2,400 lines of completed planning docs (`RESTRUCTURE_PLAN.md`, `FINAL_PLAN.md`, `PHASE_PROGRESS.md`, `POST_RESTRUCTURE_ROADMAP.md`) → `docs/archive/`. Refresh README (config table, benchmark dates).
7. **PWA:** add a real 192×192 icon + favicon link (pages currently have none), align `manifest.json` colors with the dark default.
8. **Launchers:** stop the `.sh` from rewriting the tracked `.desktop` file at runtime; commit `icon.ico` and drop the icons8 network downloads; consider deleting the `.app` bundle (its AppleScript orphans the server process and discards all output — the `.command` already covers it).

---

## 6. Suggested phase plan (each phase shippable, suite green after each)

| Phase | Contents | Rough size |
|---|---|---|
| **1. Stability & security** | §1.1-1.9: asyncHandler + error/404 middleware, XFF fix, socket role binding, download auth, process handlers, session/file sweeps, Socket.IO retune, PIN crypto | ~10 files, mostly small diffs |
| **2. Bug fixes + dead code** | §3.1 four runtime bugs, full §3.2 delete list, `console.log` purge | Mostly deletions |
| **3. Glassmorphism** | §2.1 design system + §2.2 enabling work in order; bump SW cache | tokens.css epicenter + HTML cleanup + 6 page JS files |
| **4. Performance & architecture** | §4 all items; strategy consolidation (§3.3); handlers.js split; peer-page migration | Largest phase, purely behavior-preserving |
| **5. Tooling, CI, docs** | §5 all items | Config/docs only |

Phases 1-2 are prerequisite hygiene (and fix real user-facing breakage). Phase 3 delivers the visual modernization. Phase 4 is the "most efficient architecture" pass — safe to do last because phases 1-2 shrink and stabilize the code it touches.
