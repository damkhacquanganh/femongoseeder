/**
 * @fileoverview Job aborted error class
 */

const AppError = require('./AppError');

class JobAbortedError extends AppError {
  /**
   * @param {string} jobId - The aborted job ID
   */
  constructor(jobId) {
    super(`Job ${jobId} was aborted by user`, 499, 'JOB_ABORTED');
    this.jobId = jobId;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      jobId: this.jobId,
    };
  }
}

module.exports = JobAbortedError;
