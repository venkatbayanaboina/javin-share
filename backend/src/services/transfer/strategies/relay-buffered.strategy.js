import { PassThrough } from 'node:stream';
import fs from 'node:fs';
import path from 'node:path';
import Busboy from 'busboy';
import { BaseStreamStrategy, BaseStreamSession, chunkHighWaterMark } from './base-stream.strategy.js';
import { config } from '../../../config.js';
import { logger } from '../../../logger.js';
import { contentDispositionAttachment, sanitizeFilename } from '../../../utils/filename.js';
import { decrementPendingDownloads, progressReceiverDownloadQueue } from '../../download-queue.service.js';

class BufferedRelaySession extends BaseStreamSession {
  constructor(fileId, fileMetadata, expectedReceivers, senderSocketId) {
    super(fileId, fileMetadata, expectedReceivers, senderSocketId);
    this.spooled = false;
    this.tempPath = null;
    this.writeStream = null;
    this.memoryBuffer = []; // array of Buffer chunks
    this.totalBytes = 0;
  }
}

export class RelayBufferedStrategy extends BaseStreamStrategy {
  constructor(deps) {
    super(deps);
  }

  initializeSession(fileId, fileMetadata, expectedReceivers, senderSocketId, session) {
    const streamSession = new BufferedRelaySession(fileId, fileMetadata, expectedReceivers, senderSocketId);
    this.activeSessions.set(fileId, streamSession);

    logger.info(
      `📦 Buffered session initialized for file ${fileId} with expected receivers:`,
      Array.from(expectedReceivers),
    );

    streamSession.timeoutTimer = setTimeout(() => {
      logger.info(`⏰ Buffered timeout fired for file ${fileId}. Triggering upload.`);
      this.triggerUpload(streamSession, session);
    }, config.transfer.streamRelayTimeoutMs || 30000);

    return streamSession;
  }

  async handleUpload(req, res, session, fileId) {
    const streamSession = this.activeSessions.get(fileId);
    if (!streamSession) {
      logger.error(`❌ Buffered session not found during upload of ${fileId}`);
      return res.status(404).json({ error: 'Buffered session not found' });
    }

    logger.info(`📤 Received upload POST request for buffered file ${fileId}`);

    const busboy = Busboy({
      headers: req.headers,
      limits: { files: 1, fileSize: config.maxUploadBytes },
    });

    let fileFound = false;
    let bytesReceived = 0;

    busboy.on('file', (_fieldname, file, info) => {
      fileFound = true;
      logger.info(`🌊 Spool-monitoring upload stream for: ${info.filename}`);

      file.on('data', (chunk) => {
        bytesReceived += chunk.length;
        streamSession.totalBytes = bytesReceived;

        const limit = config.transfer.spoolThresholdBytes || 256 * 1024 * 1024;
        if (!streamSession.spooled && bytesReceived > limit) {
          streamSession.spooled = true;
          streamSession.tempPath = path.join(
            config.uploadsDir,
            `spool-${session.id}-${fileId}`
          );
          logger.info(`💾 Spooling threshold reached (${limit} bytes). Spilling buffer to disk: ${streamSession.tempPath}`);
          try {
            streamSession.writeStream = fs.createWriteStream(streamSession.tempPath);
            for (const memChunk of streamSession.memoryBuffer) {
              streamSession.writeStream.write(memChunk);
            }
            streamSession.memoryBuffer = []; // clear RAM
          } catch (err) {
            logger.error('Failed to create spool disk write stream:', err);
          }
        }

        if (streamSession.spooled && streamSession.writeStream) {
          streamSession.writeStream.write(chunk);
        } else {
          streamSession.memoryBuffer.push(chunk);
        }

        this.writeChunkToBranches(streamSession, chunk, file, false);
      });

      file.on('end', () => {
        logger.info(`📥 Sender completed file chunks for buffered file ${fileId}. Bytes: ${bytesReceived}`);
      });

      file.on('error', (err) => {
        logger.error('Buffered upload chunk error:', err);
        this.destroyAllBranches(streamSession);
        if (streamSession.writeStream) {
          try { streamSession.writeStream.destroy(); } catch (_) {}
        }
        if (streamSession.tempPath && fs.existsSync(streamSession.tempPath)) {
          try { fs.unlinkSync(streamSession.tempPath); } catch (_) {}
        }
        this.activeSessions.delete(fileId);
        if (!res.headersSent) res.status(500).json({ error: 'Upload buffered streaming failed' });
      });
    });

    busboy.on('finish', () => {
      if (!fileFound) {
        this.destroyAllBranches(streamSession);
        this.activeSessions.delete(fileId);
        return res.status(400).json({ error: 'No file uploaded' });
      }

      logger.info(`🏁 Busboy upload finished for buffered session ${fileId}. Finalizing.`);

      const finalPath = streamSession.spooled ? streamSession.tempPath : 'in-memory-buffered';
      const finalMetadata = {
        id: fileId,
        name: sanitizeFilename(streamSession.fileMetadata.name),
        type: streamSession.fileMetadata.type || 'application/octet-stream',
        path: finalPath,
        size: bytesReceived,
        pending: streamSession.downloads.size,
      };
      session.activeFiles.set(fileId, finalMetadata);
      streamSession.fileMetadata = finalMetadata;
      streamSession.uploadCompleted = true;

      if (streamSession.writeStream) {
        streamSession.writeStream.end(() => {
          this.endAllBranches(streamSession);
        });
      } else {
        this.endAllBranches(streamSession);
      }

      res.json({ success: true, fileId, bytesReceived });
      this.activeSessions.delete(fileId);
    });

    req.on('error', (err) => {
      logger.error('Upload request stream error:', err);
      this.destroyAllBranches(streamSession);
      this.activeSessions.delete(fileId);
    });

    req.pipe(busboy);
  }

  async handleDownload(req, res, session, fileId, receiverPeerId) {
    const streamSession = this.activeSessions.get(fileId);
    if (!streamSession) {
      // Fallback: If upload completed and file was spooled on disk, serve it like a disk file
      const fileMetadata = session.activeFiles.get(fileId);
      if (fileMetadata && fileMetadata.path !== 'in-memory-buffered' && fs.existsSync(fileMetadata.path)) {
        logger.info(`📥 Lagging receiver ${receiverPeerId} downloading completed spooled file from disk`);
        return this.serveCompletedSpooledFile(req, res, session, fileMetadata, receiverPeerId);
      }

      logger.error(`❌ Buffered session not found during download of ${fileId}`);
      return res.status(404).json({ error: 'Buffered session not found' });
    }

    logger.info(`📥 Receiver ${receiverPeerId} connected to buffered download`);

    streamSession.connectedReceivers.add(receiverPeerId);
    streamSession.downloads.set(receiverPeerId, res);

    const branch = new PassThrough({ highWaterMark: chunkHighWaterMark() });
    streamSession.branches.set(receiverPeerId, branch);

    res.status(200);
    res.setHeader('Content-Type', streamSession.fileMetadata.type || 'application/octet-stream');
    res.setHeader('Content-Disposition', contentDispositionAttachment(streamSession.fileMetadata.name));
    if (typeof streamSession.fileMetadata.size === 'number' && Number.isFinite(streamSession.fileMetadata.size)) {
      res.setHeader('Content-Length', streamSession.fileMetadata.size);
    }
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');

    branch.pipe(res);

    // If spooled, feed existing spooled file chunks to this branch first
    if (streamSession.spooled && streamSession.tempPath && fs.existsSync(streamSession.tempPath)) {
      const fileStream = fs.createReadStream(streamSession.tempPath);
      fileStream.on('data', (chunk) => {
        branch.write(chunk);
      });
      fileStream.on('error', (err) => {
        logger.error('Error reading spooled chunks for lagging receiver:', err);
      });
    } else {
      // Feed memory buffer chunks directly to this branch
      for (const chunk of streamSession.memoryBuffer) {
        branch.write(chunk);
      }
    }

    let cleanedUp = false;
    const cleanupDownload = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      streamSession.downloads.delete(receiverPeerId);
      const b = streamSession.branches.get(receiverPeerId);
      if (b && !b.destroyed) {
        try { b.destroy(); } catch (_) {}
      }
      streamSession.branches.delete(receiverPeerId);

      try {
        const meta = session.activeFiles.get(fileId) || streamSession.fileMetadata;
        decrementPendingDownloads(meta, session, fileId);
        progressReceiverDownloadQueue(session.id, receiverPeerId, this.deps.io);
      } catch (err) {
        logger.error('Post-download cleanup error:', err);
      }
    };

    res.on('close', () => {
      logger.info(`Receiver ${receiverPeerId} download stream closed/aborted`);
      cleanupDownload();

      if (streamSession.downloads.size === 0 && streamSession.uploadStarted && !streamSession.uploadCompleted) {
        logger.warn(`⚠️ All active downloads closed during buffered upload of ${fileId}. Aborting.`);
        this.destroyAllBranches(streamSession);
        if (streamSession.writeStream) {
          try { streamSession.writeStream.destroy(); } catch (_) {}
        }
        if (streamSession.tempPath && fs.existsSync(streamSession.tempPath)) {
          try { fs.unlinkSync(streamSession.tempPath); } catch (_) {}
        }
        this.activeSessions.delete(fileId);
        session.activeTransfer = null;
        session.currentSenderPeerId = null;
        this.deps.io.in(session.id).emit('transfer-unlocked');
      }
    });

    res.on('finish', () => {
      logger.info(`Receiver ${receiverPeerId} download stream finished successfully`);
      cleanupDownload();
    });

    this.checkAndTriggerUpload(streamSession, session);
  }

  async serveCompletedSpooledFile(req, res, session, fileMetadata, receiverPeerId) {
    const stat = fs.statSync(fileMetadata.path);
    const fileSize = stat.size;

    res.status(200);
    res.setHeader('Content-Length', fileSize);
    res.setHeader('Content-Type', fileMetadata.type || 'application/octet-stream');
    res.setHeader('Content-Disposition', contentDispositionAttachment(fileMetadata.name));

    const readStream = fs.createReadStream(fileMetadata.path);
    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      try {
        decrementPendingDownloads(fileMetadata, session, fileMetadata.id);
        progressReceiverDownloadQueue(session.id, receiverPeerId, this.deps.io);
      } catch (e) {
        logger.error('Spooled download cleanup error:', e);
      }
    };

    res.on('finish', cleanup);
    res.on('close', () => {
      try { readStream.destroy(); } catch (_) {}
      cleanup();
    });

    readStream.pipe(res);
  }
}
