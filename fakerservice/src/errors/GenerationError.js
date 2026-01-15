/**
 * @fileoverview Generation error class
 */

const AppError = require('./AppError');

class GenerationError extends AppError {
  /**
   * @param {string} message - Error message
   * @param {string} stage - Generation stage where error occurred
   */
  constructor(message, stage = 'unknown') {
    super(message, 500, 'GENERATION_ERROR');
    this.stage = stage;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      stage: this.stage,
    };
  }
}

module.exports = GenerationError;
