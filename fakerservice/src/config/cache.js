/**
 * @fileoverview Cache configuration
 */

const cacheConfig = {
  // Schema cache - stores prepared schemas
  schema: {
    max: 200,
    ttl: 1000 * 60 * 60, // 1 hour
    updateAgeOnGet: true,
  },

  // Result template cache - stores first generated result as template
  template: {
    max: 100,
    ttl: 1000 * 60 * 5, // 5 minutes (shorter for variety)
    updateAgeOnGet: false,
  },

  // Validation cache - stores compiled validators
  validation: {
    max: 100,
    ttl: 1000 * 60 * 30, // 30 minutes
    updateAgeOnGet: true,
  },
};

module.exports = cacheConfig;
