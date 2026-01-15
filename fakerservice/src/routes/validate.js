/**
 * @fileoverview Validate route - Schema validation endpoint
 */

const { schemaService } = require('../services');

// Request schema
const validateSchema = {
  body: {
    type: 'object',
    required: ['schema'],
    properties: {
      schema: { type: 'object' },
    },
  },
};

async function validateRoutes(fastify) {
  /**
   * POST /validate - Validate JSON Schema
   */
  fastify.post('/validate', { schema: validateSchema }, async (request, reply) => {
    const { schema } = request.body;

    const result = schemaService.validateSchema(schema);

    if (result.valid) {
      return {
        success: true,
        valid: true,
        message: 'Schema is valid',
        schemaInfo: {
          type: schema.type || 'object',
          propertiesCount: schema.properties ? Object.keys(schema.properties).length : 0,
          requiredFields: schema.required || [],
        },
      };
    }

    return {
      success: false,
      valid: false,
      message: 'Schema validation failed',
      errors: result.errors,
    };
  });
}

module.exports = validateRoutes;
