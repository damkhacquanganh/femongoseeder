/**
 * @fileoverview Centralized error handler plugin for Fastify
 */

const fp = require('fastify-plugin');
const { AppError } = require('../errors');

async function errorHandlerPlugin(fastify) {
  // Centralized error handler
  fastify.setErrorHandler((error, request, reply) => {
    const { log } = request;

    // Determine if operational error
    const isOperational = error.isOperational || error instanceof AppError;

    // Log appropriately
    if (isOperational) {
      log.warn({ err: error, requestId: request.id }, 'Operational error');
    } else {
      log.error({ err: error, requestId: request.id }, 'Unexpected error');
    }

    // Build response
    const statusCode = error.statusCode || 500;
    const response = {
      success: false,
      error: {
        code: error.code || 'INTERNAL_ERROR',
        message: isOperational ? error.message : 'An unexpected error occurred',
        ...(error.details && { details: error.details }),
        ...(error.stage && { stage: error.stage }),
        ...(error.jobId && { jobId: error.jobId }),
        ...(error.reason && { reason: error.reason }),
      },
      requestId: request.id,
      timestamp: new Date().toISOString(),
    };

    // In development, include stack trace
    if (process.env.NODE_ENV !== 'production' && error.stack) {
      response.error.stack = error.stack.split('\n').slice(0, 5);
    }

    reply.status(statusCode).send(response);
  });

  // 404 Not Found handler
  fastify.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Route ${request.method} ${request.url} not found`,
      },
      requestId: request.id,
      timestamp: new Date().toISOString(),
    });
  });
}

module.exports = fp(errorHandlerPlugin, {
  name: 'error-handler',
});
