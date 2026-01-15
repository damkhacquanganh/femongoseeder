/**
 * @fileoverview Streaming route - NDJSON streaming for zero-RAM buffering
 * Architecture: Generate → Stream chunk → Spring Boot → Insert → Release
 */

const config = require('../config');
const { schemaService, jobService } = require('../services');
const { ValidationError } = require('../errors');

async function streamRoutes(fastify, options) {
  const { generatorPool } = options;

  /**
   * POST /generate-stream - True streaming generation
   * Returns NDJSON (Newline-Delimited JSON) stream
   * 
   * Response format:
   * {"chunk":0,"data":[{...},{...}],"progress":{"completed":250,"total":10000}}
   * {"chunk":1,"data":[{...},{...}],"progress":{"completed":500,"total":10000}}
   * ...
   * {"done":true,"stats":{"total":10000,"duration":1234}}
   */
  fastify.post('/generate-stream', async (request, reply) => {
    const {
      schema,
      count = config.generation.defaultCount,
      randomMode = false,
      chunkSize = 2000, // ✅ Increased to match Spring Boot default (was 500)
    } = request.body;

    const jobId = request.headers['x-job-id'] || request.headers['x-jobid'];

    if (!schema) {
      throw new ValidationError('Schema is required');
    }

    // Validate chunk size (increased for better throughput)
    const safeChunkSize = Math.max(500, Math.min(chunkSize, 5000)); // ✅ Min 500, max 5000 (was 250-1000)

    // Validate schema
    const validation = schemaService.validateSchema(schema);
    if (!validation.valid) {
      throw new ValidationError('Invalid schema', validation.errors);
    }

    // Register for abort tracking
    const abortController = new AbortController();
    const requestId = jobService.registerRequest(jobId, abortController, count);

    request.raw.on('close', () => {
      if (!request.raw.complete) {
        abortController.abort();
        jobService.unregisterRequest(requestId);
      }
    });

    // Set NDJSON streaming headers
    reply.raw.setHeader('Content-Type', 'application/x-ndjson');
    reply.raw.setHeader('Transfer-Encoding', 'chunked');
    reply.raw.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    reply.raw.setHeader('Cache-Control', 'no-cache');

    const startTime = Date.now();
    let totalSent = 0;
    let chunkIndex = 0;

    try {
      // Calculate number of chunks
      const numChunks = Math.ceil(count / safeChunkSize);
      
      request.log.info({ 
        jobId, 
        count, 
        chunkSize: safeChunkSize, 
        numChunks 
      }, '🌊 Starting streaming generation');

      // ✅ SIMPLE SEQUENTIAL: Generate → Stream → Release → Continue
      // With larger chunk size (2000), sequential is fast enough
      // Parallel pipeline caused OOM due to buffering multiple large chunks
      
      for (let i = 0; i < count; i += safeChunkSize) {
        // Check abort
        if (abortController.signal.aborted) {
          const abortMsg = JSON.stringify({ 
            error: 'aborted', 
            message: 'Job stopped by user',
            completed: totalSent 
          }) + '\n';
          reply.raw.write(abortMsg);
          break;
        }

        const thisChunkSize = Math.min(safeChunkSize, count - i);
        
        // Generate chunk using worker pool (workers still parallel internally)
        const result = await generatorPool.generate(
          schemaService.prepareSchema(schema),
          thisChunkSize,
          { jobId, randomMode, streaming: false }
        );

        // Stream chunk as NDJSON
        const chunkData = {
          chunk: chunkIndex++,
          data: result.data,
          progress: {
            completed: i + thisChunkSize,
            total: count,
            percentage: Math.round(((i + thisChunkSize) / count) * 100)
          },
          chunkStats: {
            size: thisChunkSize,
            duration: result.stats.duration
          }
        };

        const ndjsonLine = JSON.stringify(chunkData) + '\n';
        reply.raw.write(ndjsonLine);

        totalSent += thisChunkSize;

        // Log progress
        if (chunkIndex % 10 === 0 || totalSent === count) {
          request.log.info({ 
            jobId, 
            progress: `${totalSent}/${count}`,
            chunksStreamed: chunkIndex 
          }, '📦 Streaming progress');
        }
      }

      // Send completion
      const duration = Date.now() - startTime;
      const finalStats = {
        done: true,
        stats: {
          totalRecords: totalSent,
          chunksStreamed: chunkIndex,
          duration,
          recordsPerSecond: Math.round((totalSent / duration) * 1000),
          avgChunkDuration: Math.round(duration / chunkIndex)
        }
      };

      reply.raw.write(JSON.stringify(finalStats) + '\n');
      reply.raw.end();

      request.log.info({ 
        jobId, 
        totalSent, 
        duration,
        rps: finalStats.stats.recordsPerSecond 
      }, '✅ Streaming completed');

    } catch (error) {
      request.log.error({ jobId, error }, '❌ Streaming error');
      
      const errorMsg = JSON.stringify({ 
        error: 'generation_failed',
        message: error.message,
        completed: totalSent 
      }) + '\n';
      
      reply.raw.write(errorMsg);
      reply.raw.end();
    } finally {
      jobService.unregisterRequest(requestId);
    }
  });

  /**
   * POST /generate-stream-multi - Multi-schema streaming
   * Streams multiple collections sequentially
   */
  fastify.post('/generate-stream-multi', async (request, reply) => {
    const {
      schemas,
      chunkSize = 250,
    } = request.body;

    const jobId = request.headers['x-job-id'] || request.headers['x-jobid'];

    if (!schemas || !Array.isArray(schemas) || schemas.length === 0) {
      throw new ValidationError('schemas array is required');
    }

    // Normalize schemas
    const schemasToProcess = schemas.map(s => ({
      schema: s.schema || s,
      collection: s.collection,
      count: s.count || config.generation.defaultCount,
    }));

    // Validate all schemas first
    for (const { schema: schemaItem, collection } of schemasToProcess) {
      const validation = schemaService.validateSchema(schemaItem);
      if (!validation.valid) {
        throw new ValidationError(`Invalid schema for ${collection}`, validation.errors);
      }
    }

    const abortController = new AbortController();
    const requestId = jobService.registerRequest(jobId, abortController, 
      schemasToProcess.reduce((sum, s) => sum + s.count, 0));

    request.raw.on('close', () => {
      if (!request.raw.complete) {
        abortController.abort();
        jobService.unregisterRequest(requestId);
      }
    });

    // Set streaming headers
    reply.raw.setHeader('Content-Type', 'application/x-ndjson');
    reply.raw.setHeader('Transfer-Encoding', 'chunked');
    reply.raw.setHeader('X-Accel-Buffering', 'no');
    reply.raw.setHeader('Cache-Control', 'no-cache');

    const startTime = Date.now();
    let totalSent = 0;
    let globalChunkIndex = 0;

    try {
      // Process each schema sequentially
      for (const { schema: schemaItem, collection, count } of schemasToProcess) {
        if (abortController.signal.aborted) break;

        const safeChunkSize = Math.max(50, Math.min(chunkSize, 1000));
        let collectionSent = 0;

        // Stream chunks for this collection
        for (let i = 0; i < count; i += safeChunkSize) {
          if (abortController.signal.aborted) break;

          const thisChunkSize = Math.min(safeChunkSize, count - i);

          const result = await generatorPool.generate(
            schemaService.prepareSchema(schemaItem),
            thisChunkSize,
            { jobId, randomMode: false, streaming: false }
          );

          const chunkData = {
            chunk: globalChunkIndex++,
            collection,
            data: result.data,
            progress: {
              collection: {
                completed: i + thisChunkSize,
                total: count
              },
              overall: {
                completed: totalSent + (i + thisChunkSize),
                total: schemasToProcess.reduce((sum, s) => sum + s.count, 0)
              }
            }
          };

          reply.raw.write(JSON.stringify(chunkData) + '\n');
          collectionSent += thisChunkSize;
        }

        totalSent += collectionSent;

        // Send collection completion
        reply.raw.write(JSON.stringify({
          collectionComplete: true,
          collection,
          recordsSent: collectionSent
        }) + '\n');
      }

      // Send final completion
      const duration = Date.now() - startTime;
      reply.raw.write(JSON.stringify({
        done: true,
        stats: {
          totalRecords: totalSent,
          schemasProcessed: schemasToProcess.length,
          chunksStreamed: globalChunkIndex,
          duration,
          recordsPerSecond: Math.round((totalSent / duration) * 1000)
        }
      }) + '\n');

      reply.raw.end();

    } catch (error) {
      request.log.error({ jobId, error }, '❌ Multi-stream error');
      reply.raw.write(JSON.stringify({ 
        error: 'generation_failed',
        message: error.message,
        completed: totalSent 
      }) + '\n');
      reply.raw.end();
    } finally {
      jobService.unregisterRequest(requestId);
    }
  });
}

module.exports = streamRoutes;
