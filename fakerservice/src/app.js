/**
 * @fileoverview Fastify application builder
 * Creates and configures the Fastify instance with all plugins and routes
 */

const fastify = require('fastify');
const config = require('./config');
const { GeneratorPool } = require('./workers');
const plugins = require('./plugins');
const registerRoutes = require('./routes');
const { logger } = require('./utils');

/**
 * Build and configure Fastify application
 * @param {Object} options - Build options
 * @returns {Promise<FastifyInstance>}
 */
async function buildApp(options = {}) {
  logger.info('Building Fastify application...');

  // Create Fastify instance
  const app = fastify({
    logger: config.logging.prettyPrint
      ? {
          level: config.logging.level,
          transport: {
            target: 'pino-pretty',
            options: {
              translateTime: 'HH:MM:ss Z',
              ignore: 'pid,hostname',
            },
          },
        }
      : {
          level: config.logging.level,
        },
    requestIdHeader: 'x-request-id',
    bodyLimit: config.server.bodyLimit,
    trustProxy: true,
  });

  // Initialize worker pool
  const generatorPool = new GeneratorPool({
    minThreads: config.workers.minThreads,
    maxThreads: config.workers.maxThreads,
    idleTimeout: config.workers.idleTimeout,
    redis: config.redis,
  });

  // Connect Redis for abort signals
  await generatorPool.connectRedis();

  // Decorate app with generatorPool for access in routes
  app.decorate('generatorPool', generatorPool);

  // Register plugins
  logger.info('Registering plugins...');
  await app.register(plugins.errorHandler);
  await app.register(plugins.cors);
  await app.register(plugins.security);

  // Register routes
  logger.info('Registering routes...');
  await app.register(registerRoutes, { generatorPool });

  // Add response time header
  app.addHook('onSend', async (request, reply) => {
    const responseTime = reply.elapsedTime;
    reply.header('X-Response-Time', `${Math.round(responseTime)}ms`);
  });

  // Graceful shutdown hook
  app.addHook('onClose', async () => {
    logger.info('Shutting down worker pool...');
    await generatorPool.shutdown();
  });

  logger.success('Fastify application built successfully');

  return app;
}

module.exports = buildApp;
