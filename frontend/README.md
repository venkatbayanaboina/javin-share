# JAVIN FileShare — Frontend

Build-less vanilla ES modules: one HTML file per screen, no bundler, no
runtime framework, no CDN dependencies (everything is served by the backend,
works fully offline on the LAN).

## Pages

| File | Screen |
|---|---|
| `host.html` | Host console — device name, PIN, QR, connected devices |
| `join-pin.html` | Join via QR autofill or 6-digit PIN |
| `send-files.html` | Sender — staging, offers, upload progress |
| `receive-files.html` | Receiver — offers, download queue, progress, history |
| `session.html` | Central session hub / lock state |
| `history.html` | Transfer history |
| `session-ended.html` | Post-session screen |

## Structure

```
assets/
├── css/
│   ├── tokens.css        # design tokens — single source of truth (glassmorphism)
│   ├── base.css          # reset, typography, utilities
│   └── components.css    # cards, buttons, glass surfaces, dialogs, toasts…
│       └── pages/*.css   # one small sheet per page (linked individually)
└── js/
    ├── core/             # shared modules: dom, storage, format, validation,
    │                     #   errors, confirm, grace-timer, navigate, wake-lock…
    ├── pages/            # one module per page
    └── socket/client.js  # socket bootstrap
```

Each page links only `tokens.css`, `base.css`, `components.css` and its own
page sheet (no `@import` waterfall), and one ES module.

## Design system

Glassmorphism: translucent frosted panels (`backdrop-filter` with an opaque
`@supports` fallback) over an aurora gradient canvas. All colors, blur,
borders and shadows resolve to `tokens.css` — both themes (`:root` dark,
`html.light-theme`) define the full set. Keep class names and token names
stable; JS toggles visibility exclusively via the `.is-hidden` class.

## PWA

`manifest.json` + `sw.js` (network-first, cache fallback). **When renaming or
adding files, regenerate `STATIC_ASSETS` and bump `CACHE_NAME` in the same
commit** — `cache.addAll` is atomic and a stale list blocks future installs.

## Verify

```bash
npm run lint:frontend   # ESLint (from repo root)
npm run format:check    # Prettier
```
