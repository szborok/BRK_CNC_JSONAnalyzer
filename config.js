/**
 * JSONAnalyzer Configuration
 * Loads from central BRK_CNC_CORE/config
 */

const { getServiceConfig } = require('../BRK_CNC_CORE/config');

// Load service-specific config from central system
const config = getServiceConfig('jsonAnalyzer');

// Export for backward compatibility
module.exports = config;

// Helper methods
config.getJsonScanPath = function() {
  return this.paths.jsonFiles;
};

config.getScanPath = function() {
  return this.paths.jsonFiles;
};
