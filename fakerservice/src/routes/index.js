/**
 * @fileoverview Route registration
 */

const generateRoutes = require('./generate');
const streamRoutes = require('./stream'); // NEW: Streaming routes
const validateRoutes = require('./validate');
const healthRoutes = require('./health');
const managementRoutes = require('./management');

/**
 * Register all routes
 * @param {FastifyInstance} fastify - Fastify instance
 * @param {Object} options - Options including generatorPool
 */
async function registerRoutes(fastify, options) {
  // Register route modules
  await fastify.register(generateRoutes, options);
  await fastify.register(streamRoutes, options); // NEW: Streaming endpoints
  await fastify.register(validateRoutes, options);
  await fastify.register(healthRoutes, options);
  await fastify.register(managementRoutes, options);
}

module.exports = registerRoutes;
