/**
 * @fileoverview Security configuration
 */

const securityConfig = {
  // API Key - Must match Spring Boot config
  apiKey: process.env.FAKER_API_KEY || 'mongodb-seeder-internal-key-2026',

  // Enabled/disabled
  enabled: process.env.FAKER_SECURITY_ENABLED !== 'false',

  // Allowed hosts/IPs
  allowedHosts: [
    'localhost',
    '127.0.0.1',
    '::1',
    'backend',              // Docker service name
    'host.docker.internal',
    '172.17.0.1',           // Docker bridge gateway
    '172.18.0.1',
    '172.19.0.1',
    '172.20.0.1',
    '172.21.0.1',
    '172.22.0.1',
    '172.23.0.1',
  ],

  // Allow Docker internal networks (172.16.0.0 - 172.31.255.255)
  allowDockerNetwork: true,

  // Paths that don't require authentication
  publicPaths: ['/health'],
};

/**
 * Check if IP is in Docker internal network
 * @param {string} ip - IP address to check
 * @returns {boolean}
 */
function isDockerInternalIP(ip) {
  if (!ip) return false;

  // IPv4 Docker networks: 172.16.0.0 - 172.31.255.255
  const dockerRegex = /^172\.(1[6-9]|2[0-9]|3[0-1])\.\d{1,3}\.\d{1,3}$/;

  // Also allow 10.x.x.x (common Docker network)
  const privateRegex = /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

  return dockerRegex.test(ip) || privateRegex.test(ip);
}

/**
 * Extract real client IP from request
 * @param {object} request - Fastify request object
 * @returns {string}
 */
function getClientIP(request) {
  // Check X-Forwarded-For header (if behind proxy/load balancer)
  const forwarded = request.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  // Check X-Real-IP header
  const realIP = request.headers['x-real-ip'];
  if (realIP) {
    return realIP;
  }

  // Fallback to socket address
  return request.ip;
}

module.exports = {
  ...securityConfig,
  isDockerInternalIP,
  getClientIP,
};
