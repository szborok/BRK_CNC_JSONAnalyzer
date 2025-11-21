/**
 * M110 Helical Drilling Validation Rule
 * Validates that M110 command is present for helical drilling operations.
 * Conditions for when this rule runs are defined in config.js rules section.
 */

/**
 * Main rule function - checks M110 command presence for helical drilling
 * @param {Project} project - The project instance
 * @returns {Object} Rule execution result with violations
 */
function M110Helical(project) {
  const violations = [];

  // Check each compound job (NC file)
  for (const [fileName, compoundJob] of project.compoundJobs) {
    const helicalPrograms = new Set();
    const programsWithM110 = new Set();

    // First pass: identify programs that require M110 for helical drilling
    compoundJob.operations.forEach((op) => {
      // Check if operation is helical drilling with required tools
      if (isHelicalDrillingOperation(op) && hasRequiredTool(op)) {
        helicalPrograms.add(op.programName);
      }
      
      // Check if operation contains M110 command
      if (op.gCode && op.gCode.includes('M110')) {
        programsWithM110.add(op.programName);
      }
    });

    // Second pass: find violations (programs that need M110 but don't have it)
    helicalPrograms.forEach((progName) => {
      if (!programsWithM110.has(progName)) {
        violations.push({
          ncFile: fileName,
          program: progName,
          message: `Program ${progName} requires M110 command for helical drilling but doesn't have it`
        });
      }
    });
  }

  return {
    ruleName: 'M110Helical',
    status: violations.length > 0 ? 'failed' : 'passed',
    violationCount: violations.length,
    violations: violations,
    summary: violations.length > 0 
      ? `${violations.length} helical drilling program(s) missing required M110 command`
      : 'All helical drilling operations have proper M110 commands'
  };
}

/**
 * Helper function to determine if operation is helical drilling
 * @param {Object} operation - Single operation object
 * @returns {boolean} True if operation is helical drilling
 */
function isHelicalDrillingOperation(operation) {
  const operationType = operation.operationType || operation.operation || '';
  return operationType === 'openMIND Simple Helical Drilling Cycle';
}

/**
 * Helper function to determine if operation uses required tools
 * @param {Object} operation - Single operation object
 * @returns {boolean} True if uses endmill finish, xfeed, or tgt tools
 */
function hasRequiredTool(operation) {
  const config = require("../config");
  const toolName = operation.toolName || '';
  
  return config.toolCategories.endmill_finish.some(tool => toolName.startsWith(tool)) ||
         config.toolCategories.xfeed.some(tool => toolName.startsWith(tool)) ||
         config.toolCategories.tgt.some(tool => toolName.startsWith(tool));
}

module.exports = M110Helical;
