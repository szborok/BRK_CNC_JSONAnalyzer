/**
 * Single Tool per NC Program Rule
 * Checks if all operations within the same program use the same tool.
 * Conditions for when this rule runs are defined in config.js rules section.
 */

/**
 * Main rule function - checks single tool usage per program
 * @param {Project} project - The project instance
 * @returns {Object} Rule execution result with violations
 */
function singleToolInNC(project) {
  const violations = [];

  // Check each compound job (NC file)
  for (const [fileName, compoundJob] of project.compoundJobs) {
    const programTools = {};

    // Group tools by program name
    compoundJob.operations.forEach((op) => {
      const prog = op.programName;
      const tool = op.toolName;
      
      // Skip AutoCorrection programs (they are allowed to use multiple tools)
      if (isAutoCorrectionProgram(op)) {
        return;
      }
      
      if (!programTools[prog]) {
        programTools[prog] = new Set();
      }
      programTools[prog].add(tool);
    });

    // Check for violations in this NC file
    Object.entries(programTools).forEach(([prog, tools]) => {
      if (tools.size > 1) {
        violations.push({
          ncFile: fileName,
          program: prog,
          toolCount: tools.size,
          tools: Array.from(tools),
          message: `Program ${prog} uses ${tools.size} different tools: ${Array.from(tools).join(', ')}`
        });
      }
    });
  }

  return {
    ruleName: 'singleToolInNC',
    status: violations.length > 0 ? 'failed' : 'passed',
    violationCount: violations.length,
    violations: violations,
    summary: violations.length > 0 
      ? `${violations.length} program(s) use multiple tools`
      : 'All programs use single tools correctly'
  };
}

/**
 * Check if operation is part of an AutoCorrection program
 * @param {Object} operation - Single operation object
 * @returns {boolean} True if operation is part of AutoCorrection
 */
function isAutoCorrectionProgram(operation) {
  const operationType = operation.operationType || operation.operation || '';
  const programName = (operation.programName || '').toLowerCase();
  
  // AutoCorrection operations typically have specific naming patterns
  return programName.includes('autocorrection') || 
         programName.includes('auto_correction') ||
         programName.includes('contour_correction') ||
         programName.includes('plane_correction') ||
         operationType.includes('correction');
}

module.exports = singleToolInNC;
