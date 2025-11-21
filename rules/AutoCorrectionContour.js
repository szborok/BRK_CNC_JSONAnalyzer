/**
 * Auto Correction Contour Validation Rule
 * Validates the 6-step auto correction pattern for contour operations.
 * Conditions for when this rule runs are defined in config.js rules section.
 */

const config = require("../config");

/**
 * Main rule function - validates auto correction patterns for contour operations
 * @param {Project} project - The project instance
 * @returns {Object} Rule execution result with violations
 */
function autoCorrectionContour(project) {
  const violations = [];
  
  // Check each compound job (NC file)
  for (const [fileName, compoundJob] of project.compoundJobs) {
    // Group operations by program name
    const programs = {};
    compoundJob.operations.forEach((op) => {
      if (!programs[op.programName]) programs[op.programName] = [];
      programs[op.programName].push(op);
    });

    // Check each program for auto correction pattern
    Object.entries(programs).forEach(([progName, ops]) => {
      // Only check contour finishing operations
      if (!isContourFinishing(ops[0])) return;

      const violation = validateAutoCorrectionPattern(fileName, progName, ops);
      if (violation) {
        violations.push(violation);
      }
    });
  }

  return {
    ruleName: 'autoCorrectionContour',
    status: violations.length > 0 ? 'failed' : 'passed',
    violationCount: violations.length,
    violations: violations,
    summary: violations.length > 0 
      ? `${violations.length} contour program(s) have incorrect auto correction patterns`
      : 'All contour programs have correct auto correction patterns'
  };
}

/**
 * Validates the 6-step auto correction pattern for a contour program
 * @param {string} fileName - NC file name
 * @param {string} progName - Program name
 * @param {Array} ops - Operations in the program
 * @returns {Object|null} Violation object if pattern is incorrect
 */
function validateAutoCorrectionPattern(fileName, progName, ops) {
  // Auto correction requires exactly 6 operations
  if (ops.length < 6) {
    return {
      ncFile: fileName,
      program: progName,
      step: 'pattern',
      expected: '6 operations',
      actual: ops.length,
      message: `Contour auto correction pattern requires 6 operations, found ${ops.length}`
    };
  }

  // Step 1: Machining prefinish (sideStock > 0)
  if (!(ops[0].sideStock > 0)) {
    return {
      ncFile: fileName,
      program: progName,
      step: '1-prefinish',
      operation: ops[0].number,
      expected: 'sideStock > 0',
      actual: ops[0].sideStock,
      message: `Step 1 (prefinish): sideStock must be > 0, found ${ops[0].sideStock}`
    };
  }

  // Step 2: Cleaning
  if (!isCleaningTool(ops[1].toolName)) {
    return {
      ncFile: fileName,
      program: progName,
      step: '2-cleaning',
      operation: ops[1].number,
      tool: ops[1].toolName,
      message: `Step 2 (cleaning): must use cleaning tool, found ${ops[1].toolName}`
    };
  }

  // Step 3: Measure and adjust
  if (!isTouchProbeTool(ops[2].toolName)) {
    return {
      ncFile: fileName,
      program: progName,
      step: '3-measure',
      operation: ops[2].number,
      tool: ops[2].toolName,
      message: `Step 3 (measure): must use touch probe, found ${ops[2].toolName}`
    };
  }

  // Step 4: Machining finish (sideStock < prefinish)
  if (!(ops[3].sideStock < ops[0].sideStock)) {
    return {
      ncFile: fileName,
      program: progName,
      step: '4-finish',
      operation: ops[3].number,
      expected: `sideStock < ${ops[0].sideStock}`,
      actual: ops[3].sideStock,
      message: `Step 4 (finish): sideStock must be less than prefinish`
    };
  }

  // Step 5: Cleaning
  if (!isCleaningTool(ops[4].toolName)) {
    return {
      ncFile: fileName,
      program: progName,
      step: '5-cleaning',
      operation: ops[4].number,
      tool: ops[4].toolName,
      message: `Step 5 (cleaning): must use cleaning tool, found ${ops[4].toolName}`
    };
  }

  // Step 6: Final measurement
  if (!isTouchProbeTool(ops[5].toolName)) {
    return {
      ncFile: fileName,
      program: progName,
      step: '6-final-measure',
      operation: ops[5].number,
      tool: ops[5].toolName,
      message: `Step 6 (final measure): must use touch probe, found ${ops[5].toolName}`
    };
  }

  if (ops[5].sideStock !== ops[3].sideStock) {
    return {
      ncFile: fileName,
      program: progName,
      step: '6-final-measure',
      operation: ops[5].number,
      expected: `sideStock = ${ops[3].sideStock}`,
      actual: ops[5].sideStock,
      message: `Step 6 (final measure): sideStock must match finish operation`
    };
  }

  return null; // No violations
}

/**
 * Check if operation is contour finishing
 */
function isContourFinishing(operation) {
  const opType = (operation.operationType || '').toLowerCase();
  return (opType.includes('contour') || opType.includes('helical')) && 
         isFinishingEndmill(operation);
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

module.exports = autoCorrectionContour;