/**
 * Reconditioned Tool Validation Rule
 * Checks that no reconditioned endmill tools are used on specific machines.
 * Reconditioned tools have non-integer diameters (e.g., D6.6 vs D7).
 * Conditions for when this rule runs are defined in config.js rules section.
 */

const config = require("../config");

/**
 * Main rule function - checks for reconditioned endmill usage
 * @param {Project} project - The project instance
 * @returns {Object} Rule execution result with violations
 */
function reconditionedTool(project) {
  const violations = [];
  
  // Check each compound job (NC file)
  for (const [fileName, compoundJob] of project.compoundJobs) {
    compoundJob.operations.forEach((op) => {
      // Check only endmill finish and roughing tools
      const isFinish = config.toolCategories.endmill_finish.some(tool => 
        op.toolName && op.toolName.startsWith(tool)
      );
      const isRoughing = config.toolCategories.endmill_roughing.some(tool => 
        op.toolName && op.toolName.startsWith(tool)
      );
      
      if (isFinish || isRoughing) {
        // Extract diameter from toolName, expects format like 'D7' or 'D6.6'
        const match = op.toolName?.match(/D(\d+(\.\d+)?)/);
        if (match) {
          const diameter = match[1];
          // If diameter is not an integer, it's reconditioned
          if (!/^\d+$/.test(diameter)) {
            violations.push({
              ncFile: fileName,
              program: op.programName,
              operation: op.number,
              tool: op.toolName,
              diameter: diameter,
              message: `Operation ${op.number} in program ${op.programName} uses reconditioned tool "${op.toolName}" with diameter ${diameter}`
            });
          }
        }
      }
    });
  }

  return {
    ruleName: 'reconditionedTool',
    status: violations.length > 0 ? 'failed' : 'passed',
    violationCount: violations.length,
    violations: violations,
    summary: violations.length > 0 
      ? `${violations.length} operation(s) use prohibited reconditioned endmill tools`
      : 'No reconditioned endmill tools detected'
  };
}

module.exports = reconditionedTool;
