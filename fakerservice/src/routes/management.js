/**
 * @fileoverview Management routes - Job control, GC, and admin functions
 */

const { jobService, schemaService } = require('../services');

async function managementRoutes(fastify, options) {
  const { generatorPool } = options;

  /**
   * POST /stop-job/:jobId - INSTANT job abort
   * This is the critical endpoint for immediate job cancellation
   */
  fastify.post('/stop-job/:jobId', {
    schema: {
      params: {
        type: 'object',
        properties: {
          jobId: { type: 'string' },
        },
        required: ['jobId'],
      },
    },
  }, async (request, reply) => {
    const { jobId } = request.params;
    const startTime = Date.now();

    request.log.info({ jobId }, 'Stop job request received');

    // Step 1: Abort via Piscina (INSTANT - <1ms)
    const poolAborted = generatorPool.abortJob(jobId);

    // Step 2: Abort via jobService (backup)
    const serviceAborted = jobService.abortByJobId(jobId);

    // Step 3: Set Redis signal (for distributed scenarios)
    await generatorPool.setAbortSignal(jobId);

    const duration = Date.now() - startTime;
    const aborted = poolAborted || serviceAborted;

    request.log.info({ jobId, aborted, duration }, 'Stop job completed');

    return {
      success: true,
      jobId,
      aborted,
      message: aborted
        ? `Job ${jobId} stopped instantly (${duration}ms)`
        : `Job ${jobId} not found (may already be completed)`,
      duration: `${duration}ms`,
      details: {
        poolAborted,
        serviceAborted,
        redisSignalSet: generatorPool.redisClient !== null,
      },
    };
  });

  /**
   * GET /requests - List all active requests
   */
  fastify.get('/requests', async (request, reply) => {
    const activeRequests = jobService.getActiveRequests();
    const poolStats = generatorPool.getStats();

    return {
      success: true,
      activeRequests: activeRequests.length,
      poolActiveJobs: poolStats.jobs.active,
      requests: activeRequests,
      poolJobs: poolStats.jobs.activeJobIds,
    };
  });

  /**
   * POST /kill/:requestId - Kill specific request by ID
   */
  fastify.post('/kill/:requestId', {
    schema: {
      params: {
        type: 'object',
        properties: {
          requestId: { type: 'string' },
        },
        required: ['requestId'],
      },
    },
  }, async (request, reply) => {
    const { requestId } = request.params;
    const numericId = parseInt(requestId, 10);

    if (isNaN(numericId)) {
      return {
        success: false,
        message: 'Invalid request ID',
      };
    }

    const killed = jobService.abortByRequestId(numericId);

    return {
      success: killed,
      requestId: numericId,
      message: killed
        ? `Request ${numericId} killed`
        : `Request ${numericId} not found`,
    };
  });

  /**
   * POST /kill-all - Kill all active requests
   */
  fastify.post('/kill-all', async (request, reply) => {
    const serviceKilled = jobService.abortAll();
    const poolKilled = generatorPool.abortAllJobs();

    return {
      success: true,
      message: `Killed ${serviceKilled} requests, ${poolKilled.length} pool jobs`,
      details: {
        serviceKilled,
        poolKilled,
      },
    };
  });

  /**
   * POST /gc - Force garbage collection
   */
  fastify.post('/gc', async (request, reply) => {
    if (!global.gc) {
      return reply.status(400).send({
        success: false,
        error: 'GC not available. Restart with: node --expose-gc src/index.js',
      });
    }

    const before = process.memoryUsage();
    global.gc();
    const after = process.memoryUsage();

    const freedMB = Math.round((before.heapUsed - after.heapUsed) / 1024 / 1024);

    return {
      success: true,
      message: `Garbage collection completed, freed ${freedMB}MB`,
      memory: {
        before: {
          heapUsedMB: Math.round(before.heapUsed / 1024 / 1024),
          heapTotalMB: Math.round(before.heapTotal / 1024 / 1024),
        },
        after: {
          heapUsedMB: Math.round(after.heapUsed / 1024 / 1024),
          heapTotalMB: Math.round(after.heapTotal / 1024 / 1024),
        },
        freedMB,
      },
    };
  });

  /**
   * POST /clear-cache - Clear all caches
   */
  fastify.post('/clear-cache', async (request, reply) => {
    const before = schemaService.getCacheStats();
    schemaService.clearCaches();
    const after = schemaService.getCacheStats();

    return {
      success: true,
      message: 'Caches cleared',
      before,
      after,
    };
  });

  /**
   * GET /pool-stats - Get worker pool statistics
   */
  fastify.get('/pool-stats', async (request, reply) => {
    return {
      success: true,
      stats: generatorPool.getStats(),
    };
  });
}

module.exports = managementRoutes;
