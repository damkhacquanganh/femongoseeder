/**
 * @fileoverview Logger utility
 */

const LOG_LEVELS = {
  ERROR: '❌',
  WARN: '⚠️',
  INFO: 'ℹ️',
  DEBUG: '🔍',
  SUCCESS: '✅',
};

/**
 * Simple logger with emoji prefixes
 * @param {string} level - Log level
 * @param {string} message - Log message
 * @param {...any} args - Additional arguments
 */
function log(level, message, ...args) {
  const timestamp = new Date().toISOString();
  const prefix = LOG_LEVELS[level] || 'ℹ️';
  console.log(`[${timestamp}] ${prefix} ${message}`, ...args);
}

module.exports = {
  log,
  error: (message, ...args) => log('ERROR', message, ...args),
  warn: (message, ...args) => log('WARN', message, ...args),
  info: (message, ...args) => log('INFO', message, ...args),
  debug: (message, ...args) => log('DEBUG', message, ...args),
  success: (message, ...args) => log('SUCCESS', message, ...args),
};
