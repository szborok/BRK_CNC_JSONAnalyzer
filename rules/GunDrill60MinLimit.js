/**
 * GunDrill 60-minute time limit rule
 * Checks if total gundrill operation time in each NC file exceeds 60 minutes.
 * Conditions for when this rule runs are defined in config.js rules section.
 */

const config = require("../config");

/**
 * Main rule function - checks gundrill 60-minute time limits per NC file
 * @param {Project} project - The project instance
 * @returns {Object} Rule execution result with violations
 */
function gunDrill60MinLimit(project) {
  const violations = [];
  const gundrillCodes = config.toolCategories.gundrill;

  // Check each compound job (NC file)
  for (const [fileName, compoundJob] of project.compoundJobs) {
    const programTimes = {};

    // Calculate total time per program for gundrill tools
    compoundJob.operations.forEach((op) => {
      const prog = op.programName;
      const tool = op.toolName;
      
      if (gundrillCodes.some((code) => tool && tool.startsWith(code))) {
        if (!programTimes[prog]) {
          programTimes[prog] = 0;
        }
        programTimes[prog] += op.operationTime || 0;
      }
    });

    // Check for violations in this NC file
    Object.entries(programTimes).forEach(([prog, totalTime]) => {
      if (totalTime > 3600) { // 60 minutes in seconds
        violations.push({
          ncFile: fileName,
          program: prog,
          actualTime: Math.round(totalTime / 60), // Convert to minutes
          limit: 60,
          message: `Program ${prog} uses gundrill tools for ${Math.round(totalTime / 60)} minutes (limit: 60 min)`
        });
      }
    });
  }

  return {
    ruleName: 'gunDrill60MinLimit',
    status: violations.length > 0 ? 'failed' : 'passed',
    violationCount: violations.length,
    violations: violations,
    summary: violations.length > 0 
      ? `${violations.length} program(s) exceed 60-minute gundrill limit`
      : 'All gundrill operations within time limits'
  };
}

module.exports = gunDrill60MinLimit;
