const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

let currentLevel = LEVELS.info;

export function setLogLevel(level) {
  if (LEVELS[level] !== undefined) {
    currentLevel = LEVELS[level];
  }
}

function log(level, ...args) {
  if (LEVELS[level] >= currentLevel) {
    const fn = level === 'error' ? console.error : console.log;
    fn(...args);
  }
}

export const logger = {
  debug: (...args) => log('debug', ...args),
  info: (...args) => log('info', ...args),
  warn: (...args) => log('warn', ...args),
  error: (...args) => log('error', ...args),
};
