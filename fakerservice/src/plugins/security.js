/**
 * @fileoverview Security middleware plugin for Fastify
 */

const fp = require('fastify-plugin');
const securityConfig = require('../config/security');
const { SecurityError } = require('../errors');

async function securityPlugin(fastify) {
  // Pre-handler hook for security checks
  fastify.addHook('preHandler', async (request, reply) => {
    // Skip if security is disabled
    if (!securityConfig.enabled) {
      return;
    }

    // Skip public paths
    if (securityConfig.publicPaths.includes(request.url.split('?')[0])) {
      return;
    }

    const clientIP = securityConfig.getClientIP(request);
    const apiKey = request.headers['x-api-key'] || 
                   request.headers['authorization']?.replace('Bearer ', '');
    const hostname = request.hostname || request.headers.host?.split(':')[0];

    request.log.debug({ clientIP, hostname, hasApiKey: !!apiKey }, 'Security check');

    // Check 1: API Key validation
    if (apiKey !== securityConfig.apiKey) {
      throw new SecurityError(
        'Invalid or missing API key',
        'unauthorized'
      );
    }

    // Check 2: IP/Host whitelist
    const isAllowedHost = securityConfig.allowedHosts.some(allowed => {
      return clientIP === allowed || 
             hostname === allowed || 
             clientIP?.includes(allowed);
    });

    const isDockerIP = securityConfig.allowDockerNetwork && 
                       securityConfig.isDockerInternalIP(clientIP);

    if (!isAllowedHost && !isDockerIP) {
      throw new SecurityError(
        `Access denied from ${clientIP}`,
        'forbidden'
      );
    }

    request.log.debug({ clientIP, isDockerIP }, 'Security check passed');
  });
}

module.exports = fp(securityPlugin, {
  name: 'security',
});
