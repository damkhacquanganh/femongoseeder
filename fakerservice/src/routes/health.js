/**
 * @fileoverview Health and metrics routes
 */

const os = require('os');
const { schemaService, jobService } = require('../services');

async function healthRoutes(fastify, options) {
  const { generatorPool } = options;

  /**
   * GET /health - Basic health check
   */
  fastify.get('/health', async (request, reply) => {
    const memUsage = process.memoryUsage();
    const poolStats = generatorPool.getStats();

    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
      version: process.env.npm_package_version || '2.0.0',
      memory: {
        heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024),
        rssMB: Math.round(memUsage.rss / 1024 / 1024),
        externalMB: Math.round(memUsage.external / 1024 / 1024),
      },
      pool: {
        threads: poolStats.threads,
        activeJobs: poolStats.jobs.active,
        queueSize: poolStats.queue.waiting,
      },
      redis: poolStats.redis,
    };
  });

  /**
   * GET /metrics - Detailed performance metrics
   */
  fastify.get('/metrics', async (request, reply) => {
    const memUsage = process.memoryUsage();
    const poolStats = generatorPool.getStats();
    const cacheStats = schemaService.getCacheStats();
    const cpuUsage = os.loadavg();

    return {
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
      
      system: {
        platform: process.platform,
        nodeVersion: process.version,
        cpuCores: os.cpus().length,
        cpuModel: os.cpus()[0]?.model,
        loadAverage: {
          '1min': cpuUsage[0]?.toFixed(2),
          '5min': cpuUsage[1]?.toFixed(2),
          '15min': cpuUsage[2]?.toFixed(2),
        },
        totalMemoryGB: (os.totalmem() / 1024 / 1024 / 1024).toFixed(2),
        freeMemoryGB: (os.freemem() / 1024 / 1024 / 1024).toFixed(2),
      },

      process: {
        pid: process.pid,
        memory: {
          heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024),
          heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024),
          rssMB: Math.round(memUsage.rss / 1024 / 1024),
          externalMB: Math.round(memUsage.external / 1024 / 1024),
          arrayBuffersMB: Math.round((memUsage.arrayBuffers || 0) / 1024 / 1024),
        },
      },

      pool: poolStats,
      cache: cacheStats,

      activeRequests: {
        count: jobService.getActiveCount(),
        requests: jobService.getActiveRequests(),
      },
    };
  });

  /**
   * GET /ready - Readiness probe for Kubernetes
   */
  fastify.get('/ready', async (request, reply) => {
    const poolStats = generatorPool.getStats();

    // Check if pool has active threads
    if (poolStats.threads.active === 0) {
      reply.status(503);
      return {
        ready: false,
        reason: 'No active worker threads',
      };
    }

    return {
      ready: true,
      threads: poolStats.threads.active,
    };
  });

  /**
   * GET /live - Liveness probe for Kubernetes
   */
  fastify.get('/live', async (request, reply) => {
    return {
      alive: true,
      timestamp: new Date().toISOString(),
    };
  });
}

module.exports = healthRoutes;
