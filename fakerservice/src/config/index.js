/**
 * @fileoverview Main configuration module
 * Centralizes all configuration with environment variable support
 */

const os = require('os');

const config = {
  // Server
  server: {
    port: parseInt(process.env.PORT, 10) || 4000,
    host: process.env.HOST || '0.0.0.0',
    bodyLimit: 50 * 1024 * 1024, // 50MB
  },

  // Worker Pool
  workers: {
    cpuCount: os.cpus().length,
    // Aggressive threading for maximum CPU usage
    get minThreads() {
      return this.cpuCount; // Start with all cores
    },
    get maxThreads() {
      return this.cpuCount * 2; // 2x for hyperthreading + queue depth
    },
    idleTimeout: 60000, // 1 minute
    taskTimeout: 300000, // 5 minutes max per task
  },

  // Redis
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    password: process.env.REDIS_PASSWORD || null,
    enabled: process.env.REDIS_ENABLED !== 'false',
    keyPrefix: 'faker:',
    abortKeyTTL: 3600, // 1 hour
  },

  // Generation defaults
  generation: {
    defaultCount: 1,
    maxCount: 10000000, // 10M max
    defaultBatchSize: 1000,
    minBatchSize: 10,
    maxBatchSize: 10000,
    streamBufferSize: 500, // Match old version
    workerThreshold: 300, // Lowered from 500 - use workers earlier
    workerChunkSize: 200, // Reduced from 250 for more parallelism
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    prettyPrint: process.env.NODE_ENV !== 'production',
  },
};

// Freeze config to prevent accidental modifications
Object.freeze(config.server);
Object.freeze(config.redis);
Object.freeze(config.generation);
Object.freeze(config.logging);

module.exports = config;
