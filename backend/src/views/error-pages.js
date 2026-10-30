/**
 * Server-rendered status pages (403 access-denied / not-found / expired).
 * Self-contained: no external fonts, no JS dependencies — must render
 * even under error conditions. Visual language matches the modern UI.
 */

const TONES = {
  danger: {
    iconBg: 'rgba(220, 38, 38, 0.10)',
    iconBorder: 'rgba(220, 38, 38, 0.25)',
    iconColor: '#dc2626',
  },
  warning: {
    iconBg: 'rgba(217, 119, 6, 0.10)',
    iconBorder: 'rgba(217, 119, 6, 0.25)',
    iconColor: '#b45309',
  },
};

/**
 * @param {{ tone: 'danger' | 'warning', icon: string, title: string, message: string }} opts
 */
function renderStatusPage({ tone, icon, title, message }) {
  const t = TONES[tone];
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="robots" content="noindex" />
  <title>${title}</title>
  <style>
    :root { color-scheme: light dark; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f4f6fb;
      color: #0f172a;
      -webkit-font-smoothing: antialiased;
    }
    @media (prefers-color-scheme: dark) {
      body { background: #0b1220; color: #f1f5f9; }
      .card { background: #111a2c; border-color: rgba(148, 163, 184, 0.16); box-shadow: 0 16px 48px rgba(0, 0, 0, 0.44); }
      .message { color: #a3b0c2; }
      .btn { background: #3b82f6; }
      .btn:hover { background: #2563eb; }
    }
    .card {
      width: 100%;
      max-width: 420px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      padding: 40px 32px;
      text-align: center;
      background: #ffffff;
      border: 1px solid rgba(15, 23, 42, 0.10);
      border-radius: 16px;
      box-shadow: 0 16px 48px rgba(15, 23, 42, 0.08);
    }
    .icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: ${t.iconBg};
      border: 1px solid ${t.iconBorder};
      color: ${t.iconColor};
    }
    .icon svg { width: 28px; height: 28px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    h1 { font-size: 1.35rem; font-weight: 650; letter-spacing: -0.01em; }
    .message { font-size: 0.925rem; line-height: 1.55; color: #475569; }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      margin-top: 8px;
      padding: 12px 20px;
      font: inherit;
      font-size: 0.925rem;
      font-weight: 600;
      color: #ffffff;
      background: #2563eb;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      text-decoration: none;
      transition: background 160ms ease;
    }
    .btn:hover { background: #1d4ed8; color: #ffffff; }
  </style>
</head>
<body>
  <main class="card">
    <div class="icon">${icon}</div>
    <h1>${title}</h1>
    <p class="message">${message}</p>
    <a href="/" class="btn">Back to home</a>
  </main>
</body>
</html>`;
}

const ICON_SEARCH_X =
  '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8.5" y1="8.5" x2="13.5" y2="13.5"/><line x1="13.5" y1="8.5" x2="8.5" y2="13.5"/></svg>';
const ICON_CLOCK =
  '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
const ICON_LOCK =
  '<svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';

export function accessDeniedPage() {
  return renderStatusPage({
    tone: 'danger',
    icon: ICON_LOCK,
    title: 'Access denied',
    message:
      'This page belongs to an active session host. Scan the QR code or use the session PIN to join instead.',
  });
}

export function sessionNotFoundPage() {
  return renderStatusPage({
    tone: 'warning',
    icon: ICON_SEARCH_X,
    title: 'Session not found',
    message:
      'This session does not exist or is no longer active. Scan the QR code again to join a valid session.',
  });
}

export function sessionExpiredPage() {
  return renderStatusPage({
    tone: 'warning',
    icon: ICON_CLOCK,
    title: 'Session expired',
    message: 'This session has ended. Ask the host for a new QR code or PIN to join again.',
  });
}
