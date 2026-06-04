import { Router } from 'express';
import { logger } from '../logger.js';
import { isSafeId } from '../utils/ids.js';
import { getTransferCoordinator } from '../services/transfer/coordinator.service.js';

export function createDownloadRouter(deps) {
  const router = Router();

  router.get('/download/:sessionId/:fileId', (req, res) => {
    const { sessionId, fileId } = req.params;
    const receiverPeerId = req.query.receiver;

    if (!isSafeId(sessionId) || !isSafeId(fileId)) {
      return res.status(400).json({ error: 'Invalid session or file id' });
    }
    if (receiverPeerId && !isSafeId(receiverPeerId)) {
      return res.status(400).json({ error: 'Invalid receiver id' });
    }

    getTransferCoordinator()
      .handleDownload(req, res)
      .catch((err) => {
        logger.error('Download route delegation error:', err);
        if (!res.headersSent) {
          res.status(500).end('Download delegation failed');
        }
      });
  });

  return router;
}
