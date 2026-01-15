/**
 * @fileoverview Entry point for Faker Service
 * High-performance fake data generator microservice
 */

const buildApp = require('./app');
const config = require('./config');
const { logger } = require('./utils');

// ASCII Art Banner
const BANNER = `
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   🚀 FAKER SERVICE v2.0.0                                     ║
║   High-Performance Fake Data Generator                        ║
║                                                               ║
║   Powered by: Fastify + Piscina + JSON Schema Faker           ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
`;

/**
 * Start the server
 */
async function start() {
  console.log(BANNER);

  try {
    // Build the application
    const app = await buildApp();

    // Start listening
    const address = await app.listen({
      port: config.server.port,
      host: config.server.host,
    });

    logger.success(`Server running at ${address}`);
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`Workers: ${config.workers.minThreads}-${config.workers.maxThreads}`);
    logger.info(`Redis: ${config.redis.enabled ? config.redis.url : 'disabled'}`);
    logger.info(`Security: ${require('./config/security').enabled ? 'enabled' : 'disabled'}`);

    // Log available endpoints
    console.log('\n📡 Available endpoints:');
    console.log('   POST /generate     - Generate fake data');
    console.log('   POST /validate     - Validate JSON Schema');
    console.log('   POST /benchmark    - Performance benchmark');
    console.log('   POST /stop-job/:id - Stop a running job');
    console.log('   POST /kill-all     - Stop all jobs');
    console.log('   POST /gc           - Force garbage collection');
    console.log('   GET  /health       - Health check');
    console.log('   GET  /metrics      - Performance metrics');
    console.log('   GET  /requests     - List active requests');
    console.log('');

    // Handle graceful shutdown
    const shutdown = async (signal) => {
      logger.info(`${signal} received, shutting down gracefully...`);
      try {
        await app.close();
        logger.success('Server closed');
        process.exit(0);
      } catch (err) {
        logger.error('Error during shutdown:', err);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle uncaught errors
    process.on('uncaughtException', (err) => {
      logger.error('Uncaught Exception:', err);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });

  } catch (err) {
    logger.error('Failed to start server:', err);
    process.exit(1);
  }
}

// Start the server
start();
