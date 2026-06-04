import { formatFileSize } from './format.js';

export function validateFile(file, maxSize = 50 * 1024 * 1024 * 1024) {
  const validations = {
    size: file.size <= maxSize,
    name: file.name && file.name.length > 0 && file.name.length <= 255,
    type: file.type !== undefined,
  };

  const errors = [];

  if (!validations.size) {
    errors.push(`File too large: ${formatFileSize(file.size)}. Maximum allowed: ${formatFileSize(maxSize)}`);
  }
  if (!validations.name) {
    errors.push('Invalid file name');
  }

  const problematicChars = /[<>:"/\\|?*\x00-\x1f]/;
  if (problematicChars.test(file.name)) {
    errors.push('File name contains invalid characters');
  }

  return { valid: errors.length === 0, errors, file };
}
