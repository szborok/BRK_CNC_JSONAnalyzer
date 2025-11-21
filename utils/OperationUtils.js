/**
 * Operation and Tool Classification Utilities
 * Helper functions for identifying operation types and tool categories.
 */

const config = require("../config");

/**
 * Check if operation is helical drilling
 */
function isHelicalDrilling(operation) {
  return operation.operation === "openMIND Simple Helical Drilling Cycle";
}

/**
 * Check if operation is 2D contour
 */
function is2DContour(operation) {
  return operation.operation === "2D Contour";
}

/**
 * Check if operation uses finishing endmill
 */
function isFinishingEndmill(operation) {
  return config.toolCategories.endmill_finish.some(tool => 
    operation.toolName && operation.toolName.startsWith(tool)
  );
}

/**
 * Check if operation uses roughing endmill
 */
function isRoughingEndmill(operation) {
  return config.toolCategories.endmill_roughing.some(tool => 
    operation.toolName && operation.toolName.startsWith(tool)
  );
}

/**
 * Check if tool is a cleaning tool
 */
function isCleaningTool(toolName) {
  return config.toolCategories.cleaning.some(tool => 
    toolName && toolName.includes(tool)
  );
}

/**
 * Check if tool is a touch probe
 */
function isTouchProbeTool(toolName) {
  return config.toolCategories.touchprobe.some(tool => 
    toolName && toolName.includes(tool)
  );
}

/**
 * Check if tool is a gundrill
 */
function isGundrillTool(toolName) {
  return config.toolCategories.gundrill.some(tool => 
    toolName && toolName.startsWith(tool)
  );
}

/**
 * Check if operation requires M110 for helical drilling
 */
function isM110RequiredForHelicalDrilling(operation) {
  const opType = (operation.operationType || '').toLowerCase();
  const gCode = operation.gCode || '';
  
  return opType.includes('helical') || 
         opType.includes('spiral') ||
         gCode.includes('G02') || 
         gCode.includes('G03') || 
         (gCode.includes('G81') && gCode.includes('R'));
}

/**
 * Get tool category for a given tool name
 */
function getToolCategory(toolName) {
  for (const [category, tools] of Object.entries(config.toolCategories)) {
    if (tools.some(tool => toolName && toolName.startsWith(tool))) {
      return category;
    }
  }
  return 'unknown';
}

module.exports = {
  isHelicalDrilling,
  is2DContour,
  isFinishingEndmill,
  isRoughingEndmill,
  isCleaningTool,
  isTouchProbeTool,
  isGundrillTool,
  isM110RequiredForHelicalDrilling,
  getToolCategory
};