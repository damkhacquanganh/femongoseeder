/**
 * @fileoverview Data generation service
 * Handles both single-thread and worker pool generation
 */

const { faker } = require('@faker-js/faker');
const jsf = require('json-schema-faker');
const config = require('../config');
const schemaService = require('./schemaService');
const { GenerationError } = require('../errors');

// Configure JSF
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

// Register formats
jsf.format('email', () => faker.internet.email());
jsf.format('date-time', () => faker.date.recent().toISOString());
jsf.format('date', () => faker.date.past().toISOString().split('T')[0]);
jsf.format('uri', () => faker.internet.url());
jsf.format('url', () => faker.internet.url());
jsf.format('uuid', () => faker.string.uuid());
jsf.format('ipv4', () => faker.internet.ipv4());
jsf.format('ipv6', () => faker.internet.ipv6());

/**
 * Random mutation helpers
 */

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

function applyRandomMutations(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return obj;
  }

  const keys = Object.keys(obj);

  for (const key of keys) {
    if (Math.random() < 0.5) {
      obj[key] = getRandomValue();
    } else if (Math.random() < 0.4) {
      delete obj[key];
    }
  }

  if (Math.random() < 0.7) {
    const numNew = Math.floor(Math.random() * 6);
    for (let i = 0; i < numNew; i++) {
      obj[faker.lorem.word() + i] = getRandomValue();
    }
  }

  return obj;
}

/**
 * Generate single record (main thread)
 * @param {Object} schema - Prepared schema
 * @param {boolean} randomMode - Apply random mutations
 * @returns {Promise<Object>} Generated record
 */
async function generateOne(schema, randomMode = false) {
  jsf.option(randomMode ? randomOptions : strictOptions);
  let generated = await jsf.resolve(schema);
  if (randomMode) {
    generated = applyRandomMutations(generated);
  } else {
    generated = cleanExtraProperties(generated, schema);
  }
  return generated;
}

/**
 * Generate multiple records (main thread, for small counts)
 * @param {Object} schema - Raw schema
 * @param {number} count - Number of records
 * @param {Object} options - Generation options
 * @returns {Promise<Object>} Generated data with stats
 */
async function generateBatch(schema, count, options = {}) {
  const { randomMode = false } = options;
  const startTime = Date.now();

  // Prepare schema
  const prepared = schemaService.prepareSchema(schema);

  // Generate records
  const results = [];
  const PARALLEL_BATCH = Math.min(count, 50);

  for (let i = 0; i < count; i += PARALLEL_BATCH) {
    const batchCount = Math.min(PARALLEL_BATCH, count - i);
    const promises = [];

    for (let j = 0; j < batchCount; j++) {
      promises.push(generateOne(prepared, randomMode));
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
 * Determine if request should use worker pool
 * @param {number} count - Record count
 * @returns {boolean}
 */
function shouldUseWorkers(count) {
  return count >= config.generation.workerThreshold;
}

/**
 * Generate with worker pool
 * @param {Object} generatorPool - Piscina pool instance
 * @param {Object} schema - Raw schema
 * @param {number} count - Number of records
 * @param {Object} options - Generation options
 * @returns {Promise<Object>} Generated data
 */
async function generateWithPool(generatorPool, schema, count, options = {}) {
  const prepared = schemaService.prepareSchema(schema);
  return generatorPool.generate(prepared, count, options);
}

/**
 * Smart generate - auto-selects main thread or worker pool
 * @param {Object} generatorPool - Piscina pool instance
 * @param {Object} schema - Raw schema
 * @param {number} count - Number of records
 * @param {Object} options - Generation options
 * @returns {Promise<Object>} Generated data
 */
async function smartGenerate(generatorPool, schema, count, options = {}) {
  if (shouldUseWorkers(count)) {
    return generateWithPool(generatorPool, schema, count, options);
  }
  return generateBatch(schema, count, options);
}

module.exports = {
  generateOne,
  generateBatch,
  generateWithPool,
  smartGenerate,
  shouldUseWorkers,
};
