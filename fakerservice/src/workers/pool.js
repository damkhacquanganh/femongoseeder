/**
 * @fileoverview Piscina worker pool manager
 * Provides instant abort, auto-recovery, and Redis integration
 */

const Piscina = require('piscina');
const path = require('path');
const os = require('os');
const redis = require('redis');
const config = require('../config');
const { JobAbortedError, GenerationError } = require('../errors');

class GeneratorPool {
  constructor(options = {}) {
    const cpuCount = os.cpus().length;

    // Initialize Piscina pool - match old version performance
    this.pool = new Piscina({
      filename: path.join(__dirname, 'generator.worker.js'),
      minThreads: options.minThreads || cpuCount,
      maxThreads: options.maxThreads || cpuCount * 2, // 2x for hyperthreading
      idleTimeout: options.idleTimeout || 60000,
      maxQueue: 'auto',
      // Optimize for throughput
      concurrentTasksPerWorker: 1, // One task per worker for max speed
      useAtomics: true,
    });

    // Track active jobs for abort handling
    this.activeJobs = new Map();
    
    // Redis client for distributed abort signals
    this.redisClient = null;
    this.redisConfig = options.redis || { 
      url: config.redis.url,
      password: config.redis.password
    };
    this.redisEnabled = config.redis.enabled;

    // Stats tracking
    this.stats = {
      totalGenerated: 0,
      totalDuration: 0,
      completedJobs: 0,
      abortedJobs: 0,
    };

    console.log(`🔧 GeneratorPool: ${this.pool.options.minThreads}-${this.pool.options.maxThreads} workers (${cpuCount} CPU cores)`);
  }

  /**
   * Connect to Redis for distributed abort signals
   */
  async connectRedis() {
    if (!this.redisEnabled) {
      console.log('⚠️  Redis disabled - abort signals are local only');
      return;
    }

    try {
      this.redisClient = redis.createClient({
        url: this.redisConfig.url,
        password: this.redisConfig.password || undefined,
        socket: {
          reconnectStrategy: (retries) => {
            if (retries > 10) return new Error('Redis connection failed');
            return Math.min(retries * 100, 3000);
          },
        },
      });

      this.redisClient.on('error', (err) => {
        console.error('❌ Redis error:', err.message);
      });

      this.redisClient.on('reconnecting', () => {
        console.log('🔄 Redis reconnecting...');
      });

      await this.redisClient.connect();
      console.log('✅ Redis connected for abort signals');
    } catch (err) {
      console.error('❌ Failed to connect Redis:', err.message);
      this.redisClient = null;
    }
  }

  /**
   * Generate data with INSTANT abort support + PARALLEL WORKERS
   * Match old version performance: split across ALL workers simultaneously
   * @param {Object} schema - JSON Schema for generation
   * @param {number} count - Number of records to generate
   * @param {Object} options - Generation options
   * @returns {Promise<Object>} Generated data or streaming result
   */
  async generate(schema, count, options = {}) {
    const { jobId, streaming = false, randomMode = false, streamBufferSize = 500 } = options;
    const abortController = new AbortController();
    const startTime = Date.now();

    // Register job for abort tracking
    if (jobId) {
      this.activeJobs.set(jobId, {
        abortController,
        startTime,
        count,
        streaming,
      });
    }

    try {
      //  HIGH PERFORMANCE: Split across multiple workers for large counts
      if (count >= 50 && !streaming) {
        // Use ALL available threads + create more chunks for better distribution
        const availableThreads = this.pool.threads.length;
        const optimalChunkSize = 25; // Maximum parallelism - very small chunks
        const workerCount = Math.min(
          availableThreads * 5, // Allow 5x workers for maximum CPU saturation
          Math.ceil(count / optimalChunkSize)
        );
        const chunkSize = Math.ceil(count / workerCount);
        const chunks = [];

        console.log(` [Pool] Splitting ${count} records across ${workerCount} chunks of ~${chunkSize} (${availableThreads} threads available)`);

        // Create chunks
        for (let i = 0; i < count; i += chunkSize) {
          chunks.push(Math.min(chunkSize, count - i));
        }

        // Execute ALL chunks in parallel across workers
        const results = await Promise.all(
          chunks.map(chunkCount =>
            this.pool.run(
              {
                schema,
                count: chunkCount,
                options: { streaming: false, randomMode, streamBufferSize },
              },
              { signal: abortController.signal }
            )
          )
        );

        // Flatten results
        const allData = results.flatMap(r => r.data || []);
        const duration = Date.now() - startTime;
        const recordsPerSec = Math.round((allData.length / duration) * 1000);

        console.log(`✅ [Pool] Generated ${allData.length} records in ${duration}ms (${recordsPerSec} rec/s)`);

        this.stats.totalGenerated += allData.length;
        this.stats.totalDuration += duration;
        this.stats.completedJobs++;

        return {
          data: allData,
          stats: {
            recordsGenerated: allData.length,
            duration,
            recordsPerSecond: recordsPerSec,
          },
        };
      }

      // Single worker for small counts or streaming
      const result = await this.pool.run(
        {
          schema,
          count,
          options: { streaming, randomMode, streamBufferSize },
        },
        { signal: abortController.signal }
      );

      // Update stats
      this.stats.totalGenerated += count;
      this.stats.totalDuration += Date.now() - startTime;
      this.stats.completedJobs++;

      return result;
    } catch (error) {
      // Handle abort
      if (error.name === 'AbortError') {
        this.stats.abortedJobs++;
        throw new JobAbortedError(jobId || 'unknown');
      }

      // Handle other errors
      throw new GenerationError(error.message, 'generation');
    } finally {
      // Cleanup job tracking
      if (jobId) {
        this.activeJobs.delete(jobId);
      }
    }
  }

  /**
   * INSTANT ABORT - Piscina handles this natively
   * @param {string} jobId - Job ID to abort
   * @returns {boolean} Whether job was found and aborted
   */
  abortJob(jobId) {
    const job = this.activeJobs.get(jobId);
    if (job) {
      job.abortController.abort();
      console.log(`🛑 Job ${jobId} aborted instantly via Piscina`);
      return true;
    }
    console.log(`⚠️  Job ${jobId} not found (may already be completed)`);
    return false;
  }

  /**
   * Abort all active jobs
   * @returns {Array<string>} List of aborted job IDs
   */
  abortAllJobs() {
    const abortedJobs = [];
    for (const [jobId, job] of this.activeJobs.entries()) {
      job.abortController.abort();
      abortedJobs.push(jobId);
    }
    console.log(`🛑 Aborted ${abortedJobs.length} jobs`);
    return abortedJobs;
  }

  /**
   * Check Redis for abort signal (for distributed scenarios)
   * @param {string} jobId - Job ID to check
   * @returns {Promise<boolean>}
   */
  async checkAbortSignal(jobId) {
    if (!this.redisClient || !jobId) return false;

    try {
      const key = `${config.redis.keyPrefix}stop:${jobId}`;
      const abortFlag = await this.redisClient.get(key);
      return abortFlag === 'true';
    } catch (err) {
      console.error(` Failed to check abort signal for job ${jobId}:`, err.message);
      return false;
    }
  }

  /**
   * Set abort signal in Redis
   * @param {string} jobId - Job ID to signal
   */
  async setAbortSignal(jobId) {
    if (!this.redisClient) return;

    try {
      const key = `${config.redis.keyPrefix}stop:${jobId}`;
      await this.redisClient.set(key, 'true', { EX: config.redis.abortKeyTTL });
      console.log(` Abort signal set in Redis for job ${jobId}`);
    } catch (err) {
      console.error(`Failed to set abort signal for job ${jobId}:`, err.message);
    }
  }

  /**
   * Get pool statistics
   * @returns {Object} Pool stats
   */
  getStats() {
    return {
      threads: {
        min: this.pool.options.minThreads,
        max: this.pool.options.maxThreads,
        active: this.pool.threads?.length || 0,
      },
      queue: {
        waiting: this.pool.queueSize,
        completed: this.pool.completed,
      },
      jobs: {
        active: this.activeJobs.size,
        activeJobIds: Array.from(this.activeJobs.keys()),
      },
      performance: {
        totalGenerated: this.stats.totalGenerated,
        completedJobs: this.stats.completedJobs,
        abortedJobs: this.stats.abortedJobs,
        avgRecordsPerSecond: this.stats.totalDuration > 0
          ? Math.round((this.stats.totalGenerated / this.stats.totalDuration) * 1000)
          : 0,
      },
      redis: {
        connected: !!this.redisClient,
      },
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.log('🔄 GeneratorPool shutting down...');

    // Abort all active jobs
    this.abortAllJobs();

    // Destroy Piscina pool
    await this.pool.destroy();

    // Disconnect Redis
    if (this.redisClient) {
      try {
        await this.redisClient.quit();
        console.log('X Redis disconnected');
      } catch (err) {
        console.error(' X Redis disconnect error:', err.message);
      }
    }

    console.log(' GeneratorPool shutdown complete');
  }
}

module.exports = GeneratorPool;
