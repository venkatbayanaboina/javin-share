import js from '@eslint/js';
import globals from 'globals';

/**
 * Lints the build-less frontend (ES modules in the browser + service worker).
 * Backend linting lives in backend/eslint.config.js (`npm run lint`).
 */
export default [
  js.configs.recommended,
  {
    files: ['frontend/assets/js/**/*.js', 'frontend/sw.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.serviceworker,
        // Socket.IO client global, served by the backend at /socket.io/socket.io.js
        io: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      // Empty catch blocks are an intentional pattern for best-effort cleanup
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-console': 'off',
      eqeqeq: ['error', 'smart'],
    },
    ignores: ['**/node_modules/**'],
  },
  {
    // Filenames are validated against control characters on purpose
    files: ['frontend/assets/js/core/validation.js'],
    rules: {
      'no-control-regex': 'off',
    },
  },
];
