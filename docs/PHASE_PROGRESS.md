# Restructure Progress

Track completion of [RESTRUCTURE_PLAN.md](./RESTRUCTURE_PLAN.md) phases.  
**Post-restructure queue:** [POST_RESTRUCTURE_ROADMAP.md](./POST_RESTRUCTURE_ROADMAP.md) (work one item at a time).

---

## Phase 0 — Preparation ✅

- [x] Git, `.gitignore`, `LICENSE`, `package.json`, `.env.example`

## Phase 1 — Backend extraction ✅

- [x] `backend/src/` modules, thin `server.js`, health route, handler dedup fixes

## Phase 2 — Frontend extraction ✅

- [x] `assets/js/core/`, page modules, thinned HTML shells

## Phase 3 — CSS & design system ✅

- [x] `assets/css/` layers, no inline `style=`, `confirm.js`

## Phase 4 — State machine simplification ✅ (core)

- [x] Functional page names (`host.html`, `session.html`, …)
- [x] `peer.page` + `setPeerPage()`
- [x] `navigate` event + `registerNavigateListener()` (navigate-only, 4-D1)
- [x] Abandoned-sender polling removed → transition hooks
- [x] Client `nav_token_*` / `nav_hist_*` removed
- [x] API `navToken` removed from PIN responses

### Phase 4 — Deferred (see roadmap items 4-D1 … 4-D3)

| ID | Task | Status |
|----|------|--------|
| 4-D1 | Navigate-only (no legacy redirect events) | ✅ Done |
| 4-D2 | Server-authoritative grace/PIN timers | ✅ Done |
| 4-D3 | Minimal `localStorage` contract | ✅ Done |

## Phase 5 — Security hardening ✅

- [x] Host-only shutdown, upload limits, PIN rate limit, sanitized downloads, `/debug/queues` removed, [SECURITY.md](./SECURITY.md)

## Phase 6 — Testing & CI ✅

- [x] 25+ tests (unit + integration), ESLint, Prettier, GitHub Actions CI, README architecture update

---

## Section 23 — Transfer optimization ✅ Done

> Detail: [RESTRUCTURE_PLAN.md §23](./RESTRUCTURE_PLAN.md#23-transfer-optimization-post-restructure) · Audit: [FINAL_PLAN.md](./FINAL_PLAN.md)

| ID | Task | Status |
|----|------|--------|
| TO-0 | Baseline benchmarks + `docs/benchmarks/BASELINE.md` | ✅ Done |
| TO-0b | `relay-disk.strategy.js` + coordinator | ✅ Done |
| TO-1 | `relay-stream` (multi-receiver fan-out) | ✅ Done |
| TO-2 | `relay-buffered` (disk-spool fallback) | ✅ Done |
| TO-3 | Resumable (range download + offset upload) | ✅ Done |

**Config fix:** `backend/src/config.js` defaults now match `.env.example` (`relay-disk`, stream off unless explicitly enabled).

---

## Current focus

**All restructuring and transfer optimization roadmap phases completed successfully.**

For a detailed analysis of code-level changes, core difficulties faced (e.g. test runner socket leaks, synchronous in-memory race conditions, parallel suite collisions), and their elegant solutions, see [Difficulties Faced & Solutions in POST_RESTRUCTURE_ROADMAP.md](./POST_RESTRUCTURE_ROADMAP.md#difficulties-faced--solutions).

```bash
npm test --prefix backend
npm run lint --prefix backend
```
