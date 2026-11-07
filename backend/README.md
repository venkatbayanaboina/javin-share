# JAVIN FileShare — Backend

Node.js 18+ server: Express (HTTPS) for file transport, Socket.IO for session
control. All file bytes travel over streaming HTTP; the WebSocket channel
carries only coordination events.

## Run

```bash
npm install        # from the repo root (delegates here)
npm run dev        # node --watch server.js
npm start          # node server.js
```

The server listens on `https://0.0.0.0:4000` by default (see `../.env.example`).
Local TLS certs are generated and trusted by the platform launchers in
`../launchers/`.

## Architecture

```
server.js               → boots src/index.js (TLS server, Socket.IO, sweeps)
src/
├── index.js            # wiring: HTTPS, Socket.IO tuning, process handlers, intervals
├── create-app.js       # express app (compression, routes, error middleware)
├── config.js           # loads ../.env, all tunables
├── routes/             # session, upload, download, pages, health
├── sockets/            # control plane (see below)
├── services/           # session, peer-page, transfer coordinator + strategies,
│                       #   pin rate limit, device names, mDNS, grace redirect
├── state/store.js      # in-memory session/transfer state (single source of truth)
├── jobs/               # abandoned-sender check, maintenance sweep (expired
│                       #   sessions, orphaned upload files)
├── utils/              # ids (safe-id regex), filename sanitizing, request IP
└── views/              # error pages
```

### Socket control plane

| Module | Responsibility |
|---|---|
| `handlers.js` | Thin assembler — one `connection` entry point |
| `session.lifecycle.js` | join/leave, device names, disconnect handling, shutdown |
| `transfer.handlers.js` | send locks, file offers, accept/reject, progress, cancel |
| `page.handlers.js` | page navigation state (host/pin/send/receive/main) |
| `transfer.helpers.js` | shared offer settlement, host emits, sender-departure routine |
| `sender-grace.js` | defers "sender left" disruptions so a page refresh never scatters receivers |

### Transfer strategies (`src/services/transfer/`)

| Strategy | Behavior | Default |
|---|---|---|
| `relay-disk` | Upload to temp file → atomic rename; Range-based resumable downloads | ✅ |
| `relay-stream` | Cut-through in-memory pipe (single receiver) | opt-in |
| `relay-buffered` | RAM under threshold, spools to disk beyond it, serves via Range | opt-in |

The coordinator authorizes every download against the session's peer list and
re-validates all client-supplied ids (`[a-zA-Z0-9_-]{1,64}`) at each layer.

## Verify

```bash
npm test            # 65 tests: unit + integration + security regression
npm run test:unit
npm run test:integration
npm run test:opt    # transfer strategy suite
npm run lint        # ESLint
npm run format:check
npm run benchmark   # scripts/run-all-benchmarks.mjs (see ../docs/benchmarks/)
```

Security model and rate-limit details: [../docs/SECURITY.md](../docs/SECURITY.md).
Socket event contract: [../docs/SOCKET_EVENTS.md](../docs/SOCKET_EVENTS.md).
