import express, { Router } from 'express';
import path from 'path';
import { config } from '../config.js';
import { PAGE_FILES } from '../config/pages.js';
import { store } from '../state/store.js';
import { accessDeniedPage, sessionExpiredPage, sessionNotFoundPage } from '../views/error-pages.js';

/** Legacy filenames → canonical (Phase 3/4 rename) */
const LEGACY_REDIRECTS = {
  'index.html': PAGE_FILES.host,
  'pin.html': PAGE_FILES.pin,
  'main.html': PAGE_FILES.session,
  'send.html': PAGE_FILES.send,
  'receive.html': PAGE_FILES.receive,
  'disconnected.html': PAGE_FILES.ended,
};

export function createPagesRouter() {
  const router = Router();

  router.get('/pin', (_req, res) => {
    res.redirect(`/${PAGE_FILES.pin}`);
  });

  router.use(express.static(config.frontendPath));

  Object.entries(LEGACY_REDIRECTS).forEach(([legacy, canonical]) => {
    router.get(`/${legacy}`, (req, res) => {
      const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
      res.redirect(301, `/${canonical}${qs}`);
    });
  });

  router.get('/', hostProtectedPage(PAGE_FILES.host));
  router.get(`/${PAGE_FILES.host}`, hostProtectedPage(PAGE_FILES.host));

  const sessionProtected = [
    PAGE_FILES.session,
    PAGE_FILES.pin,
    PAGE_FILES.send,
    PAGE_FILES.receive,
    PAGE_FILES.history,
  ];
  sessionProtected.forEach((page) => {
    router.get(`/${page}`, sessionProtectedPage(page));
  });

  router.get(`/${PAGE_FILES.ended}`, (_req, res) => {
    res.sendFile(path.join(config.frontendPath, PAGE_FILES.ended));
  });

  return router;
}

function hostProtectedPage(filename) {
  return (req, res) => {
    const sessionId = req.query.session;
    if (sessionId && store.currentHostSessionId && sessionId !== store.currentHostSessionId) {
      return res.status(403).send(accessDeniedPage());
    }
    res.sendFile(path.join(config.frontendPath, filename));
  };
}

function sessionProtectedPage(page) {
  return (req, res) => {
    const sessionId = req.query.session;

    if (!sessionId) {
      return res.sendFile(path.join(config.frontendPath, page));
    }

    const session = store.sessions.get(sessionId);
    if (!session) {
      return res.status(403).send(sessionNotFoundPage());
    }

    if (Date.now() > session.pinExpiry) {
      return res.status(403).send(sessionExpiredPage());
    }

    res.sendFile(path.join(config.frontendPath, page));
  };
}
