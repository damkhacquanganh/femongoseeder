/**
 * @fileoverview Generate route - Main data generation endpoint
 */

const config = require('../config');
const { schemaService, generatorService, jobService } = require('../services');
const { ValidationError, GenerationError } = require('../errors');

// Request schema for validation
const generateSchema = {
  body: {
    type: 'object',
    properties: {
      schema: { type: 'object' },
      schemas: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            schema: { type: 'object' },
            collection: { type: 'string' },
            count: { type: 'integer', minimum: 1 },
          },
        },
      },
      count: { 
        type: 'integer', 
        minimum: 1, 
        maximum: config.generation.maxCount,
        default: config.generation.defaultCount,
      },
      validateData: { type: 'boolean', default: false },
      randomMode: { type: 'boolean', default: false },
      streaming: { type: 'boolean', default: false },
      batchSize: {
        type: 'integer',
        minimum: config.generation.minBatchSize,
        maximum: config.generation.maxBatchSize,
        nullable: true, // Allow null for small previews
      },
    },
  },
};

async function generateRoutes(fastify, options) {
  const { generatorPool } = options;

  /**
   * POST /generate - Generate fake data
   */
  fastify.post('/generate', { schema: generateSchema }, async (request, reply) => {
    const {
      schema,
      schemas,
      count = config.generation.defaultCount,
      validateData = false,
      randomMode = false,
      streaming = false,
      batchSize = config.generation.defaultBatchSize,
    } = request.body;

    // Get job ID from header (from Spring Boot)
    const jobId = request.headers['x-job-id'] || request.headers['x-jobid'];

    // Validate input
    if (!schema && !schemas) {
      throw new ValidationError('Either schema or schemas is required');
    }

    // Normalize schemas input
    const schemasToProcess = Array.isArray(schemas)
      ? schemas.map(s => ({
          schema: s.schema || s,
          collection: s.collection,
          count: s.count || count,
        }))
      : [{ schema, collection: null, count }];

    // Register request for abort tracking
    const abortController = new AbortController();
    const requestId = jobService.registerRequest(jobId, abortController, count);

    // Handle client disconnect
    request.raw.on('close', () => {
      if (!request.raw.complete) {
        abortController.abort();
        jobService.unregisterRequest(requestId);
        request.log.info({ requestId, jobId }, 'Client disconnected, aborting request');
      }
    });

    try {
      // Process each schema
      const results = [];
      let totalGenerated = 0;

      for (const { schema: schemaItem, collection, count: itemCount } of schemasToProcess) {
        // Validate schema
        const validation = schemaService.validateSchema(schemaItem);
        if (!validation.valid) {
          throw new ValidationError('Invalid schema', validation.errors);
        }

        // Check abort signal
        if (abortController.signal.aborted) {
          throw new Error('Request aborted');
        }

        // Generate data
        const genOptions = {
          jobId,
          randomMode,
          streaming,
          streamBufferSize: batchSize,
        };

        let result;
        if (generatorService.shouldUseWorkers(itemCount)) {
          // Use worker pool for large counts
          request.log.info({ itemCount, jobId }, 'Using worker pool for generation');
          result = await generatorPool.generate(
            schemaService.prepareSchema(schemaItem),
            itemCount,
            genOptions
          );
        } else {
          // Use main thread for small counts
          result = await generatorService.generateBatch(schemaItem, itemCount, genOptions);
        }

        // Validate generated data if requested
        if (validateData && result.data) {
          const invalidRecords = [];
          for (let i = 0; i < result.data.length; i++) {
            const dataValidation = schemaService.validateData(result.data[i], schemaItem);
            if (!dataValidation.valid) {
              invalidRecords.push({ index: i, errors: dataValidation.errors });
            }
          }
          if (invalidRecords.length > 0) {
            result.validationErrors = invalidRecords;
          }
        }

        results.push({
          collection,
          data: result.data,
          stats: result.stats,
          ...(result.validationErrors && { validationErrors: result.validationErrors }),
        });

        totalGenerated += result.data?.length || 0;
      }

      // Build response
      // For backward compatibility with Spring Boot:
      // - Single schema without collection: return simple array as 'results' (and 'valid' for Spring)
      // - Multiple schemas or with collection: return structured results
      const isSimpleMode = results.length === 1 && !results[0].collection;
      const dataArray = isSimpleMode ? results[0].data : results;
      
      const response = {
        success: true,
        totalRecordsGenerated: totalGenerated,
        schemasProcessed: results.length,
        results: dataArray,
        // ✅ For Spring Boot compatibility
        valid: dataArray,  // Spring Boot expects 'valid' field
        invalid: [],       // Spring Boot expects 'invalid' field
        stats: results.length === 1 
          ? results[0].stats 
          : results.map(r => r.stats),
      };

      return response;

    } finally {
      jobService.unregisterRequest(requestId);
    }
  });

  /**
   * POST /benchmark - Performance benchmark
   */
  fastify.post('/benchmark', async (request, reply) => {
    const { count = 1000, iterations = 3 } = request.body || {};

    const testSchema = {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        name: { type: 'string', minLength: 5, maxLength: 50 },
        email: { type: 'string', format: 'email' },
        age: { type: 'integer', minimum: 18, maximum: 99 },
        active: { type: 'boolean' },
        createdAt: { type: 'string', format: 'date-time' },
        tags: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 5 },
      },
      required: ['id', 'name', 'email', 'age', 'active', 'createdAt'],
    };

    const results = [];

    for (let i = 0; i < iterations; i++) {
      const startTime = Date.now();
      const result = await generatorService.generateBatch(testSchema, count);
      const duration = Date.now() - startTime;
      const rps = Math.round((count / duration) * 1000);

      results.push({
        iteration: i + 1,
        duration,
        recordsPerSecond: rps,
      });
    }

    const avgRps = Math.round(results.reduce((sum, r) => sum + r.recordsPerSecond, 0) / iterations);

    return {
      benchmark: 'complete',
      config: { count, iterations },
      results,
      average: {
        recordsPerSecond: avgRps,
        estimatedFor10K: `${Math.round(10000 / avgRps)}s`,
        estimatedFor100K: `${Math.round(100000 / avgRps)}s`,
        estimatedFor1M: `${Math.round(1000000 / avgRps / 60)}min`,
      },
      poolStats: generatorPool.getStats(),
      cacheStats: schemaService.getCacheStats(),
    };
  });
}

module.exports = generateRoutes;
