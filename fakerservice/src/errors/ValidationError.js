/**
 * @fileoverview Validation error class
 */

const AppError = require('./AppError');

class ValidationError extends AppError {
  /**
   * @param {string} message - Error message
   * @param {Array} details - Validation error details
   */
  constructor(message, details = []) {
    super(message, 400, 'VALIDATION_ERROR');
    this.details = details;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      details: this.details,
    };
  }
}

module.exports = ValidationError;
