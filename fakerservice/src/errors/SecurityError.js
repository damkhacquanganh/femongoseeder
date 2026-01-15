/**
 * @fileoverview Security/Auth error class
 */

const AppError = require('./AppError');

class SecurityError extends AppError {
  /**
   * @param {string} message - Error message
   * @param {string} reason - Security failure reason
   */
  constructor(message, reason = 'unauthorized') {
    const statusCode = reason === 'forbidden' ? 403 : 401;
    const code = reason === 'forbidden' ? 'FORBIDDEN' : 'UNAUTHORIZED';
    super(message, statusCode, code);
    this.reason = reason;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      reason: this.reason,
    };
  }
}

module.exports = SecurityError;
