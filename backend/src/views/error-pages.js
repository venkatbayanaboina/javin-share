export function accessDeniedPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Access Denied</title>
  <style>
    :root {
      --font-sans: 'Outfit', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      --bg-gradient: radial-gradient(circle at 50% 50%, #0b1528 0%, #030712 100%);
      --border-glass: 1px solid rgba(255, 255, 255, 0.08);
      --blur-glass: blur(16px);
      --radius-md: 16px;
      --radius-sm: 10px;
      --sub: #94a3b8;
    }
    body {
      margin: 0;
      padding: 20px;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bg-gradient);
      color: #fff;
      font-family: var(--font-sans);
      box-sizing: border-box;
    }
    .card {
      background: rgba(255, 255, 255, 0.02);
      backdrop-filter: var(--blur-glass);
      -webkit-backdrop-filter: var(--blur-glass);
      border: var(--border-glass);
      border-radius: var(--radius-md);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      max-width: 440px;
      width: 100%;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 18px;
      padding: 36px 28px;
      box-sizing: border-box;
      position: relative;
    }
    .card::before {
      content: '';
      position: absolute; top: 0; left: 0; right: 0; height: 2px;
      background: linear-gradient(90deg, transparent, rgba(244,63,94,.55), rgba(244,63,94,.40), transparent);
      border-radius: var(--radius-md) var(--radius-md) 0 0;
    }
    .icon {
      font-size: 2.2rem;
      width: 64px;
      height: 64px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(244, 63, 94, 0.12);
      border: 1px solid rgba(244, 63, 94, 0.28);
      margin-bottom: 6px;
    }
    h1 {
      font-size: 1.4rem;
      font-weight: 700;
      margin: 0;
      letter-spacing: -0.01em;
    }
    p {
      font-size: 0.9rem;
      color: var(--sub);
      margin: 0;
      line-height: 1.5;
    }
    .btn {
      width: 100%;
      height: 46px;
      border-radius: var(--radius-sm);
      border: none;
      font-family: var(--font-sans);
      font-size: 0.95rem;
      font-weight: 700;
      color: #fff;
      cursor: pointer;
      background: linear-gradient(135deg, #06b6d4 0%, #6366f1 100%);
      box-shadow: 0 4px 16px rgba(99, 102, 241, 0.35);
      transition: all 0.2s;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin-top: 8px;
      text-decoration: none;
    }
    .btn:hover {
      transform: translateY(-2px);
      filter: brightness(1.1);
      box-shadow: 0 8px 24px rgba(99, 102, 241, 0.45);
    }
  </style>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&display=swap" rel="stylesheet">
</head>
<body>
  <div class="card">
    <div class="icon">🔒</div>
    <h1>Access Denied</h1>
    <p>This session is not active or you are not the host. Only the current session host can access this page.</p>
    <a href="/" class="btn">Return to Main</a>
  </div>
</body>
</html>`;
}

export function sessionNotFoundPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Session Not Found</title>
  <style>
    :root {
      --font-sans: 'Outfit', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      --bg-gradient: radial-gradient(circle at 50% 50%, #0b1528 0%, #030712 100%);
      --border-glass: 1px solid rgba(255, 255, 255, 0.08);
      --blur-glass: blur(16px);
      --radius-md: 16px;
      --radius-sm: 10px;
      --sub: #94a3b8;
    }
    body {
      margin: 0;
      padding: 20px;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bg-gradient);
      color: #fff;
      font-family: var(--font-sans);
      box-sizing: border-box;
    }
    .card {
      background: rgba(255, 255, 255, 0.02);
      backdrop-filter: var(--blur-glass);
      -webkit-backdrop-filter: var(--blur-glass);
      border: var(--border-glass);
      border-radius: var(--radius-md);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      max-width: 440px;
      width: 100%;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 18px;
      padding: 36px 28px;
      box-sizing: border-box;
      position: relative;
    }
    .card::before {
      content: '';
      position: absolute; top: 0; left: 0; right: 0; height: 2px;
      background: linear-gradient(90deg, transparent, rgba(244,63,94,.55), rgba(244,63,94,.40), transparent);
      border-radius: var(--radius-md) var(--radius-md) 0 0;
    }
    .icon {
      font-size: 2.2rem;
      width: 64px;
      height: 64px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(244, 63, 94, 0.12);
      border: 1px solid rgba(244, 63, 94, 0.28);
      margin-bottom: 6px;
    }
    h1 {
      font-size: 1.4rem;
      font-weight: 700;
      margin: 0;
      letter-spacing: -0.01em;
    }
    p {
      font-size: 0.9rem;
      color: var(--sub);
      margin: 0;
      line-height: 1.5;
    }
    .btn {
      width: 100%;
      height: 46px;
      border-radius: var(--radius-sm);
      border: none;
      font-family: var(--font-sans);
      font-size: 0.95rem;
      font-weight: 700;
      color: #fff;
      cursor: pointer;
      background: linear-gradient(135deg, #06b6d4 0%, #6366f1 100%);
      box-shadow: 0 4px 16px rgba(99, 102, 241, 0.35);
      transition: all 0.2s;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin-top: 8px;
      text-decoration: none;
    }
    .btn:hover {
      transform: translateY(-2px);
      filter: brightness(1.1);
      box-shadow: 0 8px 24px rgba(99, 102, 241, 0.45);
    }
  </style>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&display=swap" rel="stylesheet">
</head>
<body>
  <div class="card">
    <div class="icon">⚠️</div>
    <h1>Session Not Found</h1>
    <p>This session does not exist or has expired. Please scan the QR code again to join a valid session.</p>
    <a href="/" class="btn">Return to Main</a>
  </div>
</body>
</html>`;
}

export function sessionExpiredPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Session Expired</title>
  <style>
    :root {
      --font-sans: 'Outfit', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      --bg-gradient: radial-gradient(circle at 50% 50%, #0b1528 0%, #030712 100%);
      --border-glass: 1px solid rgba(255, 255, 255, 0.08);
      --blur-glass: blur(16px);
      --radius-md: 16px;
      --radius-sm: 10px;
      --sub: #94a3b8;
    }
    body {
      margin: 0;
      padding: 20px;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bg-gradient);
      color: #fff;
      font-family: var(--font-sans);
      box-sizing: border-box;
    }
    .card {
      background: rgba(255, 255, 255, 0.02);
      backdrop-filter: var(--blur-glass);
      -webkit-backdrop-filter: var(--blur-glass);
      border: var(--border-glass);
      border-radius: var(--radius-md);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      max-width: 440px;
      width: 100%;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 18px;
      padding: 36px 28px;
      box-sizing: border-box;
      position: relative;
    }
    .card::before {
      content: '';
      position: absolute; top: 0; left: 0; right: 0; height: 2px;
      background: linear-gradient(90deg, transparent, rgba(244,63,94,.55), rgba(244,63,94,.40), transparent);
      border-radius: var(--radius-md) var(--radius-md) 0 0;
    }
    .icon {
      font-size: 2.2rem;
      width: 64px;
      height: 64px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(244, 63, 94, 0.12);
      border: 1px solid rgba(244, 63, 94, 0.28);
      margin-bottom: 6px;
    }
    h1 {
      font-size: 1.4rem;
      font-weight: 700;
      margin: 0;
      letter-spacing: -0.01em;
    }
    p {
      font-size: 0.9rem;
      color: var(--sub);
      margin: 0;
      line-height: 1.5;
    }
    .btn {
      width: 100%;
      height: 46px;
      border-radius: var(--radius-sm);
      border: none;
      font-family: var(--font-sans);
      font-size: 0.95rem;
      font-weight: 700;
      color: #fff;
      cursor: pointer;
      background: linear-gradient(135deg, #06b6d4 0%, #6366f1 100%);
      box-shadow: 0 4px 16px rgba(99, 102, 241, 0.35);
      transition: all 0.2s;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin-top: 8px;
      text-decoration: none;
    }
    .btn:hover {
      transform: translateY(-2px);
      filter: brightness(1.1);
      box-shadow: 0 8px 24px rgba(99, 102, 241, 0.45);
    }
  </style>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&display=swap" rel="stylesheet">
</head>
<body>
  <div class="card">
    <div class="icon">⚠️</div>
    <h1>Session Expired</h1>
    <p>This session has expired. Please scan the QR code again to join a new session.</p>
    <a href="/" class="btn">Return to Main</a>
  </div>
</body>
</html>`;
}
