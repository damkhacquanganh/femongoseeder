/**
 * @fileoverview CORS plugin configuration for Fastify
 */

const fp = require('fastify-plugin');
const cors = require('@fastify/cors');

async function corsPlugin(fastify) {
  await fastify.register(cors, {
    origin: true, // Allow all origins (adjust for production)
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Job-Id', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'X-Response-Time'],
    credentials: true,
    maxAge: 86400, // 24 hours
  });
}

module.exports = fp(corsPlugin, {
  name: 'cors',
});
