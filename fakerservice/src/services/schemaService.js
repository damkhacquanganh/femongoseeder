/**
 * @fileoverview Schema preparation and caching service
 */

const { LRUCache } = require('lru-cache');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const cacheConfig = require('../config/cache');
const { ValidationError } = require('../errors');

// Schema cache
const schemaCache = new LRUCache(cacheConfig.schema);

// Validator cache
const validatorCache = new LRUCache(cacheConfig.validation);

// AJV instance for schema validation
const ajv = new Ajv({
  allErrors: false, // Performance: stop at first error
  strict: false,
  validateFormats: true,
  useDefaults: true,
  removeAdditional: false,
});
addFormats(ajv);

/**
 * Remove $id recursively from schema (in-place)
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
 * Prepare schema for generation (removes $id, caches result)
 * @param {Object} schema - JSON Schema
 * @returns {Object} Prepared schema
 */
function prepareSchema(schema) {
  if (!schema || typeof schema !== 'object') {
    return schema;
  }

  const cacheKey = JSON.stringify(schema);
  const cached = schemaCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Deep clone and remove $id
  const prepared = JSON.parse(JSON.stringify(schema));
  removeIdRecursive(prepared);

  schemaCache.set(cacheKey, prepared);
  return prepared;
}

/**
 * Validate JSON Schema
 * @param {Object} schema - Schema to validate
 * @returns {Object} Validation result { valid, errors }
 */
function validateSchema(schema) {
  if (!schema) {
    return {
      valid: false,
      errors: [{ message: 'Schema is required' }],
    };
  }

  if (typeof schema !== 'object') {
    return {
      valid: false,
      errors: [{ message: 'Schema must be an object' }],
    };
  }

  // Check for valid type
  const validTypes = ['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'];
  if (schema.type && !validTypes.includes(schema.type)) {
    return {
      valid: false,
      errors: [{ message: `Invalid schema type: ${schema.type}` }],
    };
  }

  // Try to compile schema
  try {
    const cacheKey = JSON.stringify(schema);
    let validate = validatorCache.get(cacheKey);

    if (!validate) {
      validate = ajv.compile(schema);
      validatorCache.set(cacheKey, validate);
    }

    return { valid: true, errors: [] };
  } catch (error) {
    return {
      valid: false,
      errors: [{ message: error.message }],
    };
  }
}

/**
 * Validate data against schema
 * @param {Object} data - Data to validate
 * @param {Object} schema - JSON Schema
 * @returns {Object} Validation result
 */
function validateData(data, schema) {
  try {
    const cacheKey = JSON.stringify(schema);
    let validate = validatorCache.get(cacheKey);

    if (!validate) {
      validate = ajv.compile(schema);
      validatorCache.set(cacheKey, validate);
    }

    const valid = validate(data);
    return {
      valid,
      errors: valid ? [] : validate.errors,
    };
  } catch (error) {
    return {
      valid: false,
      errors: [{ message: error.message }],
    };
  }
}

/**
 * Get cache statistics
 * @returns {Object} Cache stats
 */
function getCacheStats() {
  return {
    schemaCache: {
      size: schemaCache.size,
      max: cacheConfig.schema.max,
    },
    validatorCache: {
      size: validatorCache.size,
      max: cacheConfig.validation.max,
    },
  };
}

/**
 * Clear all caches
 */
function clearCaches() {
  schemaCache.clear();
  validatorCache.clear();
}

module.exports = {
  prepareSchema,
  validateSchema,
  validateData,
  getCacheStats,
  clearCaches,
};
