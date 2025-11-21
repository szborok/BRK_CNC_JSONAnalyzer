/**
 * Auto Correction Plane Validation Rule
 * Validates the auto correction pattern for plane operations.
 * Conditions for when this rule runs are defined in config.js rules section.
 */

const config = require("../config");

/**
 * Main rule function - validates auto correction patterns for plane operations
 * @param {Project} project - The project instance
 * @returns {Object} Rule execution result with violations
 */
function autoCorrectionPlane(project) {
  const violations = [];
  
  // Check each compound job (NC file)
  for (const [fileName, compoundJob] of project.compoundJobs) {
    // Group operations by program name
    const programs = {};
    compoundJob.operations.forEach((op) => {
      if (!programs[op.programName]) programs[op.programName] = [];
      programs[op.programName].push(op);
    });

    // Check each program for plane auto correction pattern
    Object.entries(programs).forEach(([progName, ops]) => {
      // Only check plane operations
      if (!isPlaneOperation(ops[0])) return;

      const violation = validatePlaneAutoCorrectionPattern(fileName, progName, ops);
      if (violation) {
        violations.push(violation);
      }
    });
  }

  return {
    ruleName: 'autoCorrectionPlane',
    status: violations.length > 0 ? 'failed' : 'passed',
    violationCount: violations.length,
    violations: violations,
    summary: violations.length > 0 
      ? `${violations.length} plane program(s) have incorrect auto correction patterns`
      : 'All plane programs have correct auto correction patterns'
  };
}

/**
 * Validates the auto correction pattern for a plane program
 * @param {string} fileName - NC file name
 * @param {string} progName - Program name
 * @param {Array} ops - Operations in the program
 * @returns {Object|null} Violation object if pattern is incorrect
 */
function validatePlaneAutoCorrectionPattern(fileName, progName, ops) {
  // Plane auto correction requires at least 4 operations
  if (ops.length < 4) {
    return {
      ncFile: fileName,
      program: progName,
      step: 'pattern',
      expected: 'at least 4 operations',
      actual: ops.length,
      message: `Plane auto correction pattern requires at least 4 operations, found ${ops.length}`
    };
  }

  // Step 1: Rough machining
  if (!(ops[0].stepover > 0)) {
    return {
      ncFile: fileName,
      program: progName,
      step: '1-rough',
      operation: ops[0].number,
      expected: 'stepover > 0',
      actual: ops[0].stepover,
      message: `Step 1 (rough): stepover must be > 0 for roughing, found ${ops[0].stepover}`
    };
  }

  // Step 2: Semi-finish machining
  if (!(ops[1].stepover < ops[0].stepover)) {
    return {
      ncFile: fileName,
      program: progName,
      step: '2-semi-finish',
      operation: ops[1].number,
      expected: `stepover < ${ops[0].stepover}`,
      actual: ops[1].stepover,
      message: `Step 2 (semi-finish): stepover must be smaller than roughing`
    };
  }

  // Step 3: Cleaning
  if (!isCleaningTool(ops[2].toolName)) {
    return {
      ncFile: fileName,
      program: progName,
      step: '3-cleaning',
      operation: ops[2].number,
      tool: ops[2].toolName,
      message: `Step 3 (cleaning): must use cleaning tool, found ${ops[2].toolName}`
    };
  }

  // Step 4: Final measurement
  if (!isTouchProbeTool(ops[3].toolName)) {
    return {
      ncFile: fileName,
      program: progName,
      step: '4-measure',
      operation: ops[3].number,
      tool: ops[3].toolName,
      message: `Step 4 (measure): must use touch probe, found ${ops[3].toolName}`
    };
  }

  return null; // No violations
}

/**
 * Check if operation is a plane operation
 */
function isPlaneOperation(operation) {
  const opType = (operation.operationType || '').toLowerCase();
  return opType.includes('plane') || 
         opType.includes('face') ||
         opType.includes('2d contour');
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

module.exports = autoCorrectionPlane;