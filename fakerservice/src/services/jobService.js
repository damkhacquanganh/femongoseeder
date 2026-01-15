/**
 * @fileoverview Job tracking service
 * Tracks active requests and provides abort functionality
 */

class JobService {
  constructor() {
    // Track active requests
    this.activeRequests = new Map();
    this.requestIdCounter = 0;
  }

  /**
   * Register a new request
   * @param {string} jobId - External job ID (from Spring Boot)
   * @param {AbortController} abortController - Abort controller
   * @param {number} count - Record count
   * @returns {number} Internal request ID
   */
  registerRequest(jobId, abortController, count) {
    const requestId = ++this.requestIdCounter;
    this.activeRequests.set(requestId, {
      requestId,
      jobId,
      abortController,
      count,
      startTime: Date.now(),
    });

    // Also map by jobId for easy lookup
    if (jobId) {
      this.activeRequests.set(`job:${jobId}`, requestId);
    }

    return requestId;
  }

  /**
   * Unregister a completed request
   * @param {number} requestId - Internal request ID
   */
  unregisterRequest(requestId) {
    const request = this.activeRequests.get(requestId);
    if (request) {
      if (request.jobId) {
        this.activeRequests.delete(`job:${request.jobId}`);
      }
      this.activeRequests.delete(requestId);
    }
  }

  /**
   * Abort a request by internal ID
   * @param {number} requestId - Internal request ID
   * @returns {boolean} Whether request was found and aborted
   */
  abortByRequestId(requestId) {
    const request = this.activeRequests.get(requestId);
    if (request && request.abortController) {
      request.abortController.abort();
      this.unregisterRequest(requestId);
      return true;
    }
    return false;
  }

  /**
   * Abort a request by job ID
   * @param {string} jobId - External job ID
   * @returns {boolean} Whether request was found and aborted
   */
  abortByJobId(jobId) {
    const requestId = this.activeRequests.get(`job:${jobId}`);
    if (requestId) {
      return this.abortByRequestId(requestId);
    }
    return false;
  }

  /**
   * Abort all active requests
   * @returns {number} Number of aborted requests
   */
  abortAll() {
    let count = 0;
    for (const [key, value] of this.activeRequests.entries()) {
      if (typeof key === 'number' && value.abortController) {
        value.abortController.abort();
        count++;
      }
    }
    this.activeRequests.clear();
    this.requestIdCounter = 0;
    return count;
  }

  /**
   * Get list of active requests
   * @returns {Array} Active request info
   */
  getActiveRequests() {
    const requests = [];
    for (const [key, value] of this.activeRequests.entries()) {
      if (typeof key === 'number') {
        requests.push({
          requestId: value.requestId,
          jobId: value.jobId,
          count: value.count,
          startTime: value.startTime,
          runningTime: Date.now() - value.startTime,
        });
      }
    }
    return requests;
  }

  /**
   * Get request count
   * @returns {number}
   */
  getActiveCount() {
    let count = 0;
    for (const key of this.activeRequests.keys()) {
      if (typeof key === 'number') count++;
    }
    return count;
  }
}

// Export singleton
module.exports = new JobService();
