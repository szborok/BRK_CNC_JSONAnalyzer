/**
 * M110 Contour Validation Rule
 * Validates that 2D contour operations have RL (radius left) compensation in NC code.
 * Conditions for when this rule runs are defined in config.js rules section.
 */

const fs = require("fs");
const path = require("path");

/**
 * Main rule function - checks RL compensation in 2D contour operations
 * @param {Project} project - The project instance
 * @returns {Object} Rule execution result with violations
 */
function M110Contour(project) {
  const violations = [];

  // Check each compound job (NC file)
  for (const [fileName, compoundJob] of project.compoundJobs) {
    // Group operations by program name
    const programs = {};
    compoundJob.operations.forEach((op) => {
      if (!programs[op.programName]) programs[op.programName] = [];
      programs[op.programName].push(op);
    });

    // Check each program for 2D contour operations
    Object.entries(programs).forEach(([progName, ops]) => {
      // Check if this is a 2D contour program
      if (!is2DContourProgram(ops[0])) return;

      // Get corresponding NC file path to check for RL compensation
      const ncFilePath = findCorrespondingNcFile(project, fileName);
      if (!ncFilePath) {
        violations.push({
          ncFile: fileName,
          program: progName,
          message: `Cannot find corresponding NC file to check RL compensation for program ${progName}`
        });
        return;
      }

      // Check if NC file contains RL compensation for this program
      const hasRLCompensation = checkRLCompensationInNcFile(ncFilePath, progName);
      if (!hasRLCompensation) {
        violations.push({
          ncFile: fileName,
          program: progName,
          ncFilePath: path.basename(ncFilePath),
          message: `Program ${progName} (2D contour) missing RL compensation in NC file`
        });
      }
    });
  }

  return {
    ruleName: 'M110Contour',
    status: violations.length > 0 ? 'failed' : 'passed',
    violationCount: violations.length,
    violations: violations,
    summary: violations.length > 0 
      ? `${violations.length} 2D contour program(s) missing RL compensation`
      : 'All 2D contour operations have proper RL compensation'
  };
}

/**
 * Check if operation is 2D contour milling
 * @param {Object} operation - Single operation object
 * @returns {boolean} True if operation is 2D contour
 */
function is2DContourProgram(operation) {
  const operationType = operation.operationType || operation.operation || '';
  return operationType === 'openMIND 2D Contour Milling Cycle';
}

/**
 * Find the corresponding NC file (.h file) for a JSON file
 * @param {Project} project - The project instance
 * @param {string} jsonFileName - Name of the JSON file
 * @returns {string|null} Path to NC file or null if not found
 */
function findCorrespondingNcFile(project, jsonFileName) {
  try {
    // Get the directory where the JSON file is located
    const jsonDir = path.dirname(project.jsonFilePath);
    
    // Extract base name (remove .json extension)
    const baseName = path.basename(jsonFileName, '.json');
    
    // Look for corresponding .h file
    const ncFilePath = path.join(jsonDir, `${baseName}.h`);
    
    if (fs.existsSync(ncFilePath)) {
      return ncFilePath;
    }
    
    return null;
  } catch (err) {
    return null;
  }
}

/**
 * Check if NC file contains RL compensation for the specified program
 * @param {string} ncFilePath - Path to NC file
 * @param {string} programName - Program name to search for
 * @returns {boolean} True if RL compensation found
 */
function checkRLCompensationInNcFile(ncFilePath, programName) {
  try {
    const ncContent = fs.readFileSync(ncFilePath, 'utf8');
    const lines = ncContent.split('\n');
    
    let inTargetProgram = false;
    let foundRLCompensation = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Check if we're entering the target program section
      if (line.includes(`JOB:`) && line.includes(programName)) {
        inTargetProgram = true;
        continue;
      }
      
      // Check if we're leaving the current program section
      if (inTargetProgram && line.includes(`JOB:`) && !line.includes(programName)) {
        break; // We've moved to a different program
      }
      
      // Look for RL compensation in the target program section
      if (inTargetProgram && line.includes(' RL ')) {
        foundRLCompensation = true;
        break;
      }
    }
    
    return foundRLCompensation;
  } catch (err) {
    // If we can't read the file, assume violation
    return false;
  }
}

module.exports = M110Contour;