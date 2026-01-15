/**
 * @fileoverview Generator worker for Piscina thread pool
 * Handles actual data generation using json-schema-faker
 */

const { faker } = require('@faker-js/faker');
const jsf = require('json-schema-faker');
const { LRUCache } = require('lru-cache');

// ============================================================
// Worker-level schema cache
// ============================================================
const workerSchemaCache = new LRUCache({
  max: 100,
  ttl: 1000 * 60 * 30, // 30 minutes
  updateAgeOnGet: true,
});

// ============================================================
// Configure json-schema-faker (CRITICAL - matches original)
// ============================================================
jsf.extend('faker', () => faker);

// Strict mode: Only generate fields defined in schema (randomMode = false)
const strictOptions = {
  alwaysFakeOptionals: true,     // Generate nested objects even if optional
  useDefaultValue: true,
  failOnInvalidTypes: false,
  random: Math.random,
  optionalsProbability: 1.0,     // Generate optional fields (but not extra ones)
  fixedProbabilities: true,
  requiredOnly: false,           // Can't use true - blocks nested objects
  useExamplesValue: false,
  minItems: 0,
  maxItems: 10,
  minLength: 1,
  maxLength: 100,
  maxRegexRetry: 100,
  defaultRandExpMax: 10,
};

// Random mode: Generate extra fields and variations (randomMode = true)
const randomOptions = {
  alwaysFakeOptionals: true,      // Generate all optional fields
  useDefaultValue: false,
  failOnInvalidTypes: false,
  random: Math.random,
  optionalsProbability: 1.0,      // 100% chance for optional fields
  fixedProbabilities: false,
  ignoreMissingRefs: true,
  requiredOnly: false,            // Generate both required and optional
  maxItems: 10,
  maxLength: 100,
  maxRegexRetry: 50,
};

jsf.option(strictOptions);

// Register common formats
jsf.format('email', () => faker.internet.email());
jsf.format('date-time', () => faker.date.recent().toISOString());
jsf.format('date', () => faker.date.past().toISOString().split('T')[0]);
jsf.format('uri', () => faker.internet.url());
jsf.format('url', () => faker.internet.url());
jsf.format('uuid', () => faker.string.uuid());
jsf.format('ipv4', () => faker.internet.ipv4());
jsf.format('ipv6', () => faker.internet.ipv6());

// ============================================================
// Schema preparation utilities
// ============================================================

/**
 * Remove $id recursively (in-place for speed)
 */
function removeIdRecursive(obj) {
  if (!obj || typeof obj !== 'object') return;

  delete obj.$id;

  if (obj.properties) {
    for (const key in obj.properties) {
      removeIdRecursive(obj.properties[key]);
    }
  }
  if (obj.items) {
    removeIdRecursive(obj.items);
  }
  if (obj.additionalProperties && typeof obj.additionalProperties === 'object') {
    removeIdRecursive(obj.additionalProperties);
  }
}

/**
 * Enforce additionalProperties based on mode
 * @param {Object} obj - Schema object
 * @param {boolean} randomMode - If true, allow extra properties
 */
function enforceAdditionalProperties(obj, randomMode) {
  if (!obj || typeof obj !== 'object') return;

  // Handle type array (e.g., ["object", "null"])
  const types = Array.isArray(obj.type) ? obj.type : [obj.type];
  const isObjectType = types.includes('object');

  // Set additionalProperties based on mode
  if (isObjectType && obj.properties) {
    // In strict mode: ALWAYS false to prevent extra fields
    // In random mode: Allow if not explicitly set
    if (randomMode) {
      if (obj.additionalProperties === undefined || obj.additionalProperties === false) {
        obj.additionalProperties = true; // Allow extra fields in random mode
      }
    } else {
      obj.additionalProperties = false; // Strict: no extra fields ever
    }
  }

  // Recurse into properties
  if (obj.properties) {
    for (const key in obj.properties) {
      enforceAdditionalProperties(obj.properties[key], randomMode);
    }
  }

  // Recurse into items
  if (obj.items) {
    enforceAdditionalProperties(obj.items, randomMode);
  }

  // Recurse into additionalProperties if it's an object
  if (obj.additionalProperties && typeof obj.additionalProperties === 'object') {
    enforceAdditionalProperties(obj.additionalProperties, randomMode);
  }
}

/**
 * Prepare schema for generation
 * @param {Object} schema - Original schema
 * @param {boolean} randomMode - Generation mode
 */
function prepareSchema(schema, randomMode) {
  if (!schema || typeof schema !== 'object') {
    return schema;
  }

  const cacheKey = `${randomMode ? 'random' : 'strict'}_${JSON.stringify(schema)}`;
  const cached = workerSchemaCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Deep clone and remove $id
  const prepared = JSON.parse(JSON.stringify(schema));
  removeIdRecursive(prepared);
  
  // Set additionalProperties based on mode
  enforceAdditionalProperties(prepared, randomMode);

  workerSchemaCache.set(cacheKey, prepared);
  return prepared;
}

// ============================================================
// Random mutations for fuzz testing
// ============================================================

/**
 * Remove properties not defined in schema (strict mode only)
 * @param {*} data - Generated data
 * @param {Object} schema - JSON Schema
 * @returns {*} Cleaned data
 */
function cleanExtraProperties(data, schema) {
  if (!data || typeof data !== 'object' || !schema || typeof schema !== 'object') {
    return data;
  }

  // Handle arrays
  if (Array.isArray(data)) {
    if (schema.items) {
      return data.map(item => cleanExtraProperties(item, schema.items));
    }
    return data;
  }

  // Handle type array (e.g., ["object", "null"])
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  const isObjectType = types.includes('object');

  if (!isObjectType || !schema.properties) {
    return data;
  }

  // Create cleaned object with only schema-defined properties
  const cleaned = {};
  const allowedProps = Object.keys(schema.properties);

  for (const key of allowedProps) {
    if (key in data) {
      const propSchema = schema.properties[key];
      // Recursively clean nested objects
      cleaned[key] = cleanExtraProperties(data[key], propSchema);
    }
  }

  return cleaned;
}

function getRandomValue() {
  const type = Math.random();
  if (type < 0.3) return faker.number.int({ min: -100000000, max: 100000000 });
  if (type < 0.5) return faker.datatype.boolean();
  if (type < 0.7) return faker.lorem.words(Math.floor(Math.random() * 3) + 1);
  if (type < 0.85) return faker.number.float({ min: -100000000, max: 100000000 });
  return null;
}

function applyRandomMutations(obj, addProb = 0.7, mutateProb = 0.5, removeProb = 0.4) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return obj;
  }

  const keys = Object.keys(obj);

  for (const key of keys) {
    if (Math.random() < mutateProb) {
      obj[key] = getRandomValue();
    } else if (Math.random() < removeProb) {
      delete obj[key];
    }
  }

  if (Math.random() < addProb) {
    const numNew = Math.floor(Math.random() * 6);
    for (let i = 0; i < numNew; i++) {
      obj[faker.lorem.word() + i] = getRandomValue();
    }
  }

  return obj;
}

// ============================================================
// Main worker export - Piscina entry point
// ============================================================

/**
 * Generate fake data records
 * @param {Object} params - Generation parameters
 * @param {Object} params.schema - JSON Schema
 * @param {number} params.count - Number of records to generate
 * @param {Object} params.options - Generation options
 * @returns {Promise<Object>} Generated data or streaming chunks
 */
module.exports = async function generate({ schema, count, options = {} }) {
  const { streaming = false, randomMode = false, streamBufferSize = 500 } = options;
  const startTime = Date.now();

  // Set JSF options based on mode
  jsf.option(randomMode ? randomOptions : strictOptions);

  // Prepare schema with mode-specific settings
  const prepared = prepareSchema(schema, randomMode);

  // Generate based on mode
  if (streaming) {
    return generateStreaming(prepared, count, randomMode, streamBufferSize, startTime);
  }

  return generateBatch(prepared, count, randomMode, startTime);
};

/**
 * Generate records in batch mode (returns all at once)
 */
async function generateBatch(schema, count, randomMode, startTime) {
  const results = [];
  // Increased from 50 to 100 for maximum parallelism per worker
  const PARALLEL_BATCH = Math.min(count, 100);

  for (let i = 0; i < count; i += PARALLEL_BATCH) {
    const batchCount = Math.min(PARALLEL_BATCH, count - i);
    const promises = [];

    for (let j = 0; j < batchCount; j++) {
      promises.push(
        (async () => {
          let generated = await jsf.resolve(schema);
          if (randomMode) {
            // Random mode: Add extra random fields
            generated = applyRandomMutations(generated);
          } else {
            // Strict mode: Remove any extra fields not in schema
            generated = cleanExtraProperties(generated, schema);
          }
          return generated;
        })()
      );
    }

    const batchResults = await Promise.all(promises);
    results.push(...batchResults);
  }

  const duration = Date.now() - startTime;
  return {
    data: results,
    stats: {
      recordsGenerated: count,
      duration,
      recordsPerSecond: Math.round((count / duration) * 1000),
    },
  };
}

/**
 * Generate records in streaming mode (returns chunks)
 */
async function generateStreaming(schema, count, randomMode, chunkSize, startTime) {
  const chunks = [];
  let buffer = [];

  for (let i = 0; i < count; i++) {
    let generated = await jsf.resolve(schema);
    if (randomMode) {
      generated = applyRandomMutations(generated);
    } else {
      generated = cleanExtraProperties(generated, schema);
    }
    buffer.push(generated);

    if (buffer.length >= chunkSize) {
      chunks.push({
        data: buffer,
        index: chunks.length,
        progress: { completed: i + 1, total: count },
      });
      buffer = [];
    }
  }

  // Remaining buffer
  if (buffer.length > 0) {
    chunks.push({
      data: buffer,
      index: chunks.length,
      progress: { completed: count, total: count },
    });
  }

  const duration = Date.now() - startTime;
  return {
    streaming: true,
    chunks,
    stats: {
      totalRecords: count,
      totalChunks: chunks.length,
      duration,
      recordsPerSecond: Math.round((count / duration) * 1000),
    },
  };
}
