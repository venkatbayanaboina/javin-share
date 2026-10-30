/**
 * Base class for transfer strategies.
 * Defines the common interface for upload and download handlers.
 */
export class TransferStrategy {
  /**
   * Handle file upload from sender.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {Object} session
   * @param {string} fileId
   * @returns {Promise<void>}
   */
  async handleUpload(_req, _res, _session, _fileId) {
    throw new Error('handleUpload not implemented');
  }

  /**
   * Handle file download request from receiver.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {Object} session
   * @param {string} fileId
   * @param {string} receiverPeerId
   * @returns {Promise<void>}
   */
  async handleDownload(_req, _res, _session, _fileId, _receiverPeerId) {
    throw new Error('handleDownload not implemented');
  }
}
