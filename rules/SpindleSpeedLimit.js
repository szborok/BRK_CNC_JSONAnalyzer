/**
 * Spindle Speed Limit Check
 * Validates that spindle speed doesn't exceed machine capability
 */

/**
 * Main rule function - checks spindle speed limits
 * @param {import('../src/Project.js')} project - The project instance
 * @returns {Object} Rule execution result with violations
 */
function spindleSpeedLimit(project) {
  const violations = [];

  // Check each operation for spindle speed violations
  project.compoundJobs.forEach((compoundJob, fileName) => {
    compoundJob.operations.forEach((op) => {
      const spindleSpeed = op.spindleSpeed || 0;
      const machineMaxSpeed = project.machine?.maxSpindleSpeed || 0;

      if (machineMaxSpeed > 0 && spindleSpeed > machineMaxSpeed) {
        violations.push({
          ncFile: fileName,
          program: op.programName,
          operation: op.operationName,
          tool: op.toolName,
          actualSpeed: spindleSpeed,
          maxSpeed: machineMaxSpeed,
          message: `Spindle speed ${spindleSpeed} RPM exceeds machine limit of ${machineMaxSpeed} RPM`
        });
      }
    });
  });

  return {
    ruleName: 'spindleSpeedLimit',
    status: violations.length > 0 ? 'failed' : 'passed',
    violationCount: violations.length,
    violations: violations,
    summary: violations.length > 0 
      ? `${violations.length} operation(s) exceed spindle speed limits`
      : 'All operations within spindle speed limits'
  };
}

spindleSpeedLimit.appliesTo = {
  machines: true,
  cycles: false,
  tools: false
};

module.exports = spindleSpeedLimit;
