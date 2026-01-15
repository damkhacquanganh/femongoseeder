/**
 * @fileoverview Export all plugins
 */

const errorHandler = require('./errorHandler');
const security = require('./security');
const cors = require('./cors');

module.exports = {
  errorHandler,
  security,
  cors,
};
