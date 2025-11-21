// path: src/Project.js
/**
 * Represents a single machining project with its position-specific data.
 * Contains metadata, NC files (compound jobs), tools, and analysis results.
 */

const fs = require("fs");
const path = require("path");
const config = require("../config");
const { logInfo, logError, logWarn } = require("../utils/Logger");
const { ensureDirectory, getJsonFiles } = require("../utils/FileUtils");

class Project {
  constructor(projectPath) {
    this.projectPath = projectPath;
    this.name = path.basename(projectPath); // e.g., "W5270NS01003"
    this.position = null; // e.g., "A", "B" - extracted from JSON file name
    this.machine = null; // e.g., "DMU 100P duoblock Minus"
    this.operator = null; // e.g., "aszilagyi"

    // File paths and structure
    this.jsonFilePath = null; // Path to the target JSON file
    this.machineFolder = null; // Path to machine subfolder
    this.hypermillFilePath = null; // HyperMILL CAD file reference

    // NC files and jobs data structure
    // Each NC file is identified by programName (e.g., "W5270NS01003A1.h")
    // NC files contain multiple jobs (operations) that should use the same tool
    this.compoundJobs = new Map(); // Map<programName, CompoundJob> - NC files
    this.tools = new Map(); // Map<toolName, ToolInfo> - Tools used across all NC files
    this.totalOperationTime = 0; // Total time for all operations in this project

    // Analysis results (stored before writing to file)
    this.analysisResults = {
      rules: new Map(), // Map<ruleName, RuleResult> - Individual rule results
      summary: {
        totalRules: 0,
        rulesRun: 0,
        rulesPassed: 0,
        rulesFailed: 0,
        totalViolations: 0,
      },
      processedAt: null,
      status: "pending", // pending, completed, error
    };

    // Project status
    this.status = "initialized"; // initialized, ready, analyzing, completed, error
    this.isValid = false;
  }

  /**
   * Scans subdirectories to find target JSON files and loads project data.
   * Target files must match pattern: ProjectName + PositionLetter + .json
   * @returns {boolean} - True if initialization successful and files found
   */
  initialize() {
    try {
      // Extract project base name (e.g., "W5270NS01003" from full path)
      const projectBaseName = this.name;

      const subdirs = fs.readdirSync(this.projectPath, { withFileTypes: true });

      for (const dir of subdirs) {
        if (dir.isDirectory()) {
          // Look for position-specific subdirectories (e.g., W5270NS01003A, W5270NS01003B)
          const positionMatch = dir.name.match(
            new RegExp(`^(${projectBaseName}([A-Z]))$`)
          );

          if (positionMatch) {
            const positionName = positionMatch[1]; // W5270NS01003A
            this.position = positionMatch[2]; // A

            const positionFolder = path.join(this.projectPath, dir.name);
            const targetJsonPath = this.findTargetJsonFile(
              positionFolder,
              positionName
            );

            if (targetJsonPath) {
              this.jsonFilePath = targetJsonPath;
              this.machineFolder = path.dirname(targetJsonPath);

              // Load and parse JSON data
              const loaded = this.loadJsonData();
              if (loaded) {
                this.isValid = true;
                this.status = "ready";
                logInfo(
                  `Initialized project "${this.getFullName()}" - ${this.getTotalJobCount()} operations, ${
                    this.compoundJobs.size
                  } NC files`
                );
                return true;
              }
            }
          }
        }
      }

      this.status = "no_targets";
      // if (operatorFilter) {
      //   logInfo(
      //     `No valid files found for operator "${operatorFilter}" in project "${this.name}"`
      //   );
      // }
      return false;
    } catch (err) {
      // Most initialization errors are probably fatal (missing files, corrupt structure, etc.)
      this.markAsFatalError(`Initialization failed: ${err.message}`);
      this.status = "fatal_error";
      logError(`Failed to initialize project ${this.name}: ${err.message}`);
      return false;
    }
  }

  /**
   * Finds target JSON file in a position folder that matches the naming pattern.
   * @param {string} positionFolder - Path to position folder (e.g., W5270NS01003A)
   * @param {string} expectedName - Expected JSON filename (e.g., W5270NS01003A)
   * @returns {string|null} - Path to target JSON file or null if not found
   */
  findTargetJsonFile(positionFolder, expectedName) {
    try {
      // Look in machine subfolders for the target JSON file
      const machineDirs = fs.readdirSync(positionFolder, {
        withFileTypes: true,
      });

      for (const machineDir of machineDirs) {
        if (machineDir.isDirectory()) {
          const machineFolder = path.join(positionFolder, machineDir.name);
          const targetJsonPath = path.join(
            machineFolder,
            `${expectedName}.json`
          );

          // Check if target JSON file exists
          if (fs.existsSync(targetJsonPath)) {
            // Skip if it's a generated file
            if (
              targetJsonPath.includes("BRK_fixed") ||
              targetJsonPath.includes("BRK_result")
            ) {
              continue;
            }

            // No operator filter needed, return the file
            logInfo(`Found target JSON: ${path.basename(targetJsonPath)}`);
            return targetJsonPath;
          }
        }
      }
    } catch (err) {
      logError(
        `Error scanning position folder ${positionFolder}: ${err.message}`
      );
    }

    return null;
  }

  /**
   * Sanitizes JSON content by fixing common data quality issues
   * @param {string} jsonString - Raw JSON string content
   * @returns {string} - Sanitized JSON string
   */
  static sanitizeJsonContent(jsonString) {
    // Fix unquoted NaN values which are invalid JSON
    let sanitized = jsonString.replace(/:\s*NaN\s*,/g, ": null,");
    sanitized = sanitized.replace(/:\s*NaN\s*}/g, ": null}");

    // Fix any other common malformed JSON patterns if needed
    // Add more patterns here as they are discovered

    return sanitized;
  }

  /**
   * Loads and parses JSON data, populating project metadata and compound jobs.
   * @returns {boolean} - True if data loaded successfully
   */
  loadJsonData() {
    try {
      const rawJsonContent = fs.readFileSync(this.jsonFilePath, "utf8");
      const sanitizedJsonContent = Project.sanitizeJsonContent(rawJsonContent);
      const jsonContent = JSON.parse(sanitizedJsonContent);

      // Extract project metadata
      this.operator = jsonContent.operator || null;
      this.machine = jsonContent.machine || null;
      this.hypermillFilePath = jsonContent.cadPart || null;

      // Process operations into compound jobs
      if (jsonContent.operations && Array.isArray(jsonContent.operations)) {
        this.processOperations(jsonContent.operations);
      }

      logInfo(
        `Loaded JSON data: ${this.getTotalJobCount()} operations across ${
          this.compoundJobs.size
        } NC files`
      );
      return true;
    } catch (err) {
      logError(
        `Failed to load JSON data from ${this.jsonFilePath}: ${err.message}`
      );

      // Most JSON loading errors are probably fatal
      if (err instanceof SyntaxError) {
        // JSON parsing failed even after sanitization - definitely fatal
        this.markAsFatalError(`JSON parsing failed: ${err.message}`);
        this.status = "fatal_error";
      } else if (err.code === "ENOENT") {
        // File not found - fatal
        this.markAsFatalError(`JSON file not found: ${err.message}`);
        this.status = "fatal_error";
      } else if (err.code === "EACCES") {
        // Permission denied - fatal
        this.markAsFatalError(
          `Permission denied accessing JSON file: ${err.message}`
        );
        this.status = "fatal_error";
      } else {
        // Other errors - also treat as fatal for now
        this.markAsFatalError(`JSON loading failed: ${err.message}`);
        this.status = "fatal_error";
      }

      return false;
    }
  }

  /**
   * Processes operations array into compound jobs and tool information.
   * @param {Array} operations - Array of operations from JSON
   */
  processOperations(operations) {
    this.totalOperationTime = 0;

    operations.forEach((operation, index) => {
      const programName = operation.programName;
      const toolName = operation.toolName;
      const operationTime = operation.operationTime || 0;

      this.totalOperationTime += operationTime;

      // Create or update compound job
      if (!this.compoundJobs.has(programName)) {
        this.compoundJobs.set(programName, new CompoundJob(programName));
      }
      const compoundJob = this.compoundJobs.get(programName);
      compoundJob.addJob(operation);

      // Create or update tool info
      if (toolName && !this.tools.has(toolName)) {
        this.tools.set(toolName, new ToolInfo(toolName, operation.toolDetails));
      }
      const toolInfo = this.tools.get(toolName);
      if (toolInfo) {
        toolInfo.addUsage(
          programName,
          operationTime,
          operation.maxSpeed,
          operation.maxFeed
        );
      }
    });
  }

  /**
   * Generates the fixed JSON filename for the target JSON file.
   */
  getFixedFilePath() {
    if (!this.jsonFilePath) return null;
    const dir = path.dirname(this.jsonFilePath);
    const base = path.basename(this.jsonFilePath, config.files.jsonExtension);
    return path.join(
      dir,
      `${base}_${config.files.fixedSuffix}${config.files.jsonExtension}`
    );
  }

  /**
   * Checks if project has already been processed by looking for result file
   * @returns {boolean} - True if result file exists and is newer than source JSON
   */
  isAlreadyProcessed() {
    const resultPath = this.getResultFilePath();
    if (!resultPath || !fs.existsSync(resultPath)) {
      return false;
    }

    try {
      const jsonStats = fs.statSync(this.jsonFilePath);
      const resultStats = fs.statSync(resultPath);

      // Check if result file is newer than JSON file
      return resultStats.mtime >= jsonStats.mtime;
    } catch (err) {
      logError(`Failed to check file timestamps: ${err.message}`);
      return false;
    }
  }

  /**
   * Checks if project is marked as having fatal errors
   * @returns {boolean} - True if project has fatal errors and should be skipped
   */
  hasFatalErrors() {
    const errorMarkerPath = this.getErrorMarkerFilePath();
    return fs.existsSync(errorMarkerPath);
  }

  /**
   * Marks project as having fatal errors that prevent processing
   * @param {string} errorMessage - Description of the fatal error
   */
  markAsFatalError(errorMessage) {
    const errorMarkerPath = this.getErrorMarkerFilePath();
    const errorInfo = {
      timestamp: new Date().toISOString(),
      project: this.getFullName(),
      jsonFile: this.jsonFilePath,
      error: errorMessage,
      markedBy: "JSON Scanner v1.0",
    };

    try {
      const dir = path.dirname(errorMarkerPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(
        errorMarkerPath,
        JSON.stringify(errorInfo, null, 2),
        "utf8"
      );
      logError(`❌ Project marked as fatal error: ${this.getFullName()}`);
      logError(`❌ Error marker created: ${path.basename(errorMarkerPath)}`);
    } catch (err) {
      logError(`Failed to create error marker: ${err.message}`);
    }
  }

  /**
   * Gets the path for the error marker file
   * @returns {string} - Path to error marker file
   */
  getErrorMarkerFilePath() {
    if (!this.jsonFilePath) return null;
    const dir = path.dirname(this.jsonFilePath);
    const base = path.basename(this.jsonFilePath, config.files.jsonExtension);
    return path.join(dir, `${base}_FATAL_ERROR.json`);
  }

  /**
   * Removes the fatal error marker (for manual recovery)
   */
  clearFatalErrorMarker() {
    const errorMarkerPath = this.getErrorMarkerFilePath();
    if (fs.existsSync(errorMarkerPath)) {
      try {
        fs.unlinkSync(errorMarkerPath);
        logInfo(`✅ Fatal error marker cleared for: ${this.getFullName()}`);
      } catch (err) {
        logError(`Failed to clear error marker: ${err.message}`);
      }
    }
  }

  /**
   * Generates the result JSON filename for the target JSON file.
   */
  getResultFilePath() {
    if (!this.jsonFilePath) return null;
    const dir = path.dirname(this.jsonFilePath);
    const base = path.basename(this.jsonFilePath, config.files.jsonExtension);
    return path.join(
      dir,
      `${base}_${config.files.resultSuffix}${config.files.jsonExtension}`
    );
  }

  /**
   * Ensures that folders for fixed and result files exist.
   */
  prepareFolders() {
    if (this.machineFolder) {
      ensureDirectory(this.machineFolder);
    }
  }

  /**
   * Stores analysis results before writing to file.
   * @param {Object} ruleResults - Results from rule engine
   * @param {Object} customRuleConfig - Optional custom rule configuration (overrides default)
   */
  setAnalysisResults(ruleResults, customRuleConfig = null) {
    this.analysisResults.processedAt = new Date().toISOString();
    this.analysisResults.status = "completed";

    // Use custom config or default centralized config
    const ruleConfig = customRuleConfig || config.rules;

    // Process each rule result
    Object.entries(ruleResults).forEach(([ruleName, result]) => {
      const ruleConfigItem = ruleConfig[ruleName] || {};

      const ruleResult = {
        name: ruleName,
        shouldRun: this.shouldRunRule(ruleName, ruleConfigItem),
        run: result !== undefined && result !== null,
        passed: false,
        failureType: ruleConfigItem.failureType || "unknown", // 'job', 'ncfile', 'project'
        failures: [],
        violationCount: 0,
        description: ruleConfigItem.description || ruleName,
      };

      if (ruleResult.run && ruleResult.shouldRun) {
        if (Array.isArray(result)) {
          // Standard array result (list of failed items)
          ruleResult.passed = result.length === 0;
          ruleResult.failures = result.map((item) => ({
            item: item,
            type: ruleResult.failureType,
            details: this.getFailureDetails(ruleName, item),
          }));
          ruleResult.violationCount = result.length;
        } else if (typeof result === "object" && result.passed !== undefined) {
          // Enhanced result object with more details
          ruleResult.passed = result.passed;
          ruleResult.failures = result.failures || [];
          ruleResult.violationCount = result.failures
            ? result.failures.length
            : 0;
        } else {
          // Simple boolean or other result
          ruleResult.passed = !!result;
          ruleResult.violationCount = ruleResult.passed ? 0 : 1;
        }
      } else if (!ruleResult.shouldRun) {
        ruleResult.passed = null; // Not applicable for this project
      }

      this.analysisResults.rules.set(ruleName, ruleResult);
    });

    // Update summary
    this.updateAnalysisSummary();
  }

  /**
   * Determines if a rule should run based on project conditions.
   * @param {string} ruleName - Name of the rule
   * @param {Object} ruleConfig - Rule configuration object
   * @returns {boolean} - True if rule should run for this project
   */
  shouldRunRule(ruleName, ruleConfig) {
    // If rule has custom logic function, use it
    if (ruleConfig.logic && typeof ruleConfig.logic === "function") {
      try {
        return ruleConfig.logic(this);
      } catch (error) {
        logError(
          `Error evaluating rule logic for ${ruleName}: ${error.message}`
        );
        return false; // Default to not running if logic fails
      }
    }

    // Fallback: if no logic defined, don't run (safer default)
    logWarn(`No logic defined for rule: ${ruleName}`);
    return false;
  }

  /**
   * Checks if project uses tools from a specific category.
   * @param {string} category - Tool category to check
   * @returns {boolean} - True if project uses tools from this category
   */
  hasToolCategory(category) {
    for (const [toolName, toolInfo] of this.tools) {
      if (toolInfo.category === category) {
        return true;
      }
    }
    return false;
  }

  /**
   * Checks if project has operations of a specific type.
   * @param {string} operationType - Operation type to check (e.g., 'contour', 'plane')
   * @returns {boolean} - True if project has operations of this type
   */
  hasOperationType(operationType) {
    const searchType = operationType.toLowerCase();

    for (const [programName, compoundJob] of this.compoundJobs) {
      for (const operation of compoundJob.operations) {
        const opType = (
          operation.operationType ||
          operation.operation ||
          ""
        ).toLowerCase();

        // For exact matches (like specific openMIND operations)
        if (opType === searchType) {
          return true;
        }

        // For partial matches (like 'contour' matching various contour types)
        if (opType.includes(searchType)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Gets additional details for a specific failure.
   * @param {string} ruleName - Name of the rule
   * @param {string} failedItem - The item that failed (NC file, job, etc.)
   * @returns {Object} - Additional details about the failure
   */
  getFailureDetails(ruleName, failedItem) {
    const details = {
      item: failedItem,
      timestamp: new Date().toISOString(),
    };

    // Add context based on rule type and failed item
    if (this.compoundJobs.has(failedItem)) {
      // Failed item is an NC file
      const ncFile = this.compoundJobs.get(failedItem);
      details.type = "ncfile";
      details.jobCount = ncFile.jobs.length;
      details.totalTime = ncFile.totalTime;
      details.toolName = ncFile.toolName;
      details.hasMultipleTools = ncFile.hasMultipleTools;
    } else {
      // Failed item might be a job number or other identifier
      details.type = "job";
      // Try to find which NC file contains this job
      for (const [programName, ncFile] of this.compoundJobs) {
        const job = ncFile.jobs.find((j) => j.number === failedItem);
        if (job) {
          details.programName = programName;
          details.jobDescription = job.description;
          details.toolName = job.toolName;
          details.operationTime = job.operationTime;
          break;
        }
      }
    }

    return details;
  }

  /**
   * Updates the analysis summary based on current rule results.
   */
  updateAnalysisSummary() {
    let anyRuleRan = false;
    let allPassed = true;

    // Iterate through the Map of rules
    this.analysisResults.rules.forEach((ruleResult, ruleName) => {
      if (ruleResult.shouldRun && ruleResult.run) {
        anyRuleRan = true;
        if (!ruleResult.passed) {
          allPassed = false;
        }
      }
    });

    // Simple overall status
    let overallStatus;
    if (!anyRuleRan) {
      overallStatus = "no_rules_run";
    } else if (allPassed) {
      overallStatus = "passed";
    } else {
      overallStatus = "failed";
    }

    this.analysisResults.summary = {
      overallStatus: overallStatus,
      rulesRun: this.analysisResults.rules.size,
      rulesPassed: Array.from(this.analysisResults.rules.values()).filter(
        (r) => r.run && r.passed
      ).length,
      rulesFailed: Array.from(this.analysisResults.rules.values()).filter(
        (r) => r.run && !r.passed
      ).length,
      totalOperations: this.getTotalJobCount(),
      totalNCFiles: this.compoundJobs.size,
    };
  }

  /**
   * Gets analysis results for web app display.
   * @returns {Object} - Formatted results for frontend (Dashboard-ready format)
   */
  getAnalysisResults() {
    // Dashboard-ready format (ScanResult interface)
    const dashboardFormat = {
      id: `${this.getFullName()}_${Date.now()}`, // Generate unique ID
      filename: this.getFullName(),
      machine: this.machine,
      operator: this.operator,
      processedAt: this.analysisResults.processedAt,
      results: {
        rulesApplied: this.getRulesApplied(),
        violations: this.getViolations(),
        rules: this.getRulesForDisplay(),
      },
      status: this.analysisResults.summary.overallStatus,
      summary: {
        totalOperations: this.analysisResults.summary.totalOperations || 0,
        totalNCFiles: this.analysisResults.summary.totalNCFiles || 0,
      },
    };

    // Legacy format for backward compatibility (kept for reference)
    const legacyFormat = {
      project: this.getFullName(),
      operator: this.operator,
      machine: this.machine,
      position: this.position,
      hypermillFilePath: this.hypermillFilePath,
      summary: this.analysisResults.summary,
      rules: this.getRulesForDisplay(),
      processedAt: this.analysisResults.processedAt,
      status: this.analysisResults.status,
    };

    // Return dashboard format
    return dashboardFormat;
  }

  /**
   * Formats rule results for web app display.
   * @returns {Array} - Array of rule results for frontend
   */
  getRulesForDisplay() {
    const rulesArray = [];

    this.analysisResults.rules.forEach((ruleResult, ruleName) => {
      rulesArray.push({
        name: ruleResult.name,
        description: ruleResult.description,
        shouldRun: ruleResult.shouldRun,
        run: ruleResult.run,
        passed: ruleResult.passed,
        failureType: ruleResult.failureType,
        violationCount: ruleResult.violationCount,
        failures: ruleResult.failures,
        status: this.getRuleStatus(ruleResult),
      });
    });

    return rulesArray.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Gets list of rules that were actually executed.
   * @returns {Array<string>} - Array of rule names that ran
   */
  getRulesApplied() {
    const rulesApplied = [];

    this.analysisResults.rules.forEach((ruleResult) => {
      if (ruleResult.run) {
        rulesApplied.push(ruleResult.name);
      }
    });

    return rulesApplied.sort();
  }

  /**
   * Gets violations in dashboard-ready format.
   * @returns {Array} - Array of violation objects with rule, message, location
   */
  getViolations() {
    const violations = [];

    this.analysisResults.rules.forEach((ruleResult) => {
      // Only include rules that ran and failed
      if (ruleResult.run && !ruleResult.passed && ruleResult.failures) {
        ruleResult.failures.forEach((failure) => {
          violations.push({
            rule: ruleResult.name,
            message: failure.message || ruleResult.description,
            location: this.formatFailureLocation(failure),
          });
        });
      }
    });

    return violations;
  }

  /**
   * Formats failure location from failure object.
   * @param {Object} failure - Failure object from rule
   * @returns {string} - Formatted location string
   */
  formatFailureLocation(failure) {
    const parts = [];

    if (failure.ncFile) {
      parts.push(`NC: ${failure.ncFile}`);
    }
    if (failure.program) {
      parts.push(`Program: ${failure.program}`);
    }
    if (failure.item && typeof failure.item === "string") {
      parts.push(failure.item);
    }
    if (failure.type) {
      parts.push(`Type: ${failure.type}`);
    }

    return parts.length > 0 ? parts.join(", ") : "N/A";
  }

  /**
   * Gets a human-readable status for a rule.
   * @param {Object} ruleResult - Rule result object
   * @returns {string} - Status string
   */
  getRuleStatus(ruleResult) {
    if (!ruleResult.shouldRun) return "not_applicable";
    if (!ruleResult.run) return "not_run";
    if (ruleResult.passed === null) return "not_applicable";
    if (ruleResult.passed) return "passed";
    return "failed";
  }

  /**
   * Gets the default rule configuration for this project.
   * This defines rule logic and descriptions.
   * @returns {Object} - Rule configuration object
   */
  getDefaultRuleConfig() {
    return {
      gundrill60MinLimit: {
        description: "Gundrill tools should not exceed 60 minutes per NC file",
        failureType: "ncfile",
        // Custom logic: only run if project uses gundrill tools
        logic: (project) => project.hasToolCategory("gundrill"),
      },
      singleToolInNC: {
        description: "Each NC file should use only one tool",
        failureType: "ncfile",
        // Always run
        logic: (project) => true,
      },
      M110Check: {
        description: "M110 command required for helical drilling operations",
        failureType: "ncfile",
        // Only run for machines that support M110
        logic: (project) => project.machine && project.machine.includes("DMU"),
      },
      timeLimitsCheck: {
        description: "Operation time limits validation",
        failureType: "job",
        // Always run
        logic: (project) => true,
      },
      toolReconditionCheck: {
        description: "Tool reconditioning schedule validation",
        failureType: "tool",
        // Don't run for admin users
        logic: (project) => project.operator !== "admin",
      },
      autoCorrection: {
        description: "Automatic correction of common issues",
        failureType: "project",
        // Only run if operator has permission
        logic: (project) => project.operator && project.operator !== "readonly",
      },
    };
  }

  /**
   * Returns a summary of compound jobs for web display.
   */
  getCompoundJobsSummary() {
    const summary = [];
    this.compoundJobs.forEach((compoundJob, programName) => {
      summary.push({
        programName: programName,
        jobCount: compoundJob.jobs.length,
        totalTime: compoundJob.totalTime,
        toolName: compoundJob.toolName,
        hasIssues: compoundJob.hasIssues,
      });
    });
    return summary;
  }

  /**
   * Returns a summary of tools for web display.
   */
  getToolsSummary() {
    const summary = [];
    this.tools.forEach((toolInfo, toolName) => {
      summary.push({
        toolName: toolName,
        category: toolInfo.category,
        totalTime: toolInfo.totalUsageTime,
        programCount: toolInfo.usagePrograms.size,
        diameter: toolInfo.diameter,
        totalLength: toolInfo.totalLength,
      });
    });
    return summary;
  }

  /**
   * Returns full project name with position.
   */
  getFullName() {
    return this.position ? `${this.name}${this.position}` : this.name;
  }

  /**
   * Gets total number of individual jobs across all NC files.
   * @returns {number} - Total job count
   */
  getTotalJobCount() {
    let totalJobs = 0;
    this.compoundJobs.forEach((compoundJob) => {
      totalJobs += compoundJob.jobs.length;
    });
    return totalJobs;
  }

  /**
   * Returns a summary of this project for listing.
   */
  getSummary() {
    return {
      name: this.name,
      fullName: this.getFullName(),
      position: this.position,
      operator: this.operator,
      machine: this.machine,
      operationCount: this.getTotalJobCount(),
      ncFileCount: this.compoundJobs.size,
      toolCount: this.tools.size,
      totalTime: this.totalOperationTime,
      status: this.status,
      isValid: this.isValid,
      analysisStatus: this.analysisResults.summary.overallStatus,
    };
  }

  /**
   * Gets unique operators from this project (simplified since we have one JSON file now).
   * @returns {Array} - Array with operator name or empty array
   */
  getOperators() {
    return this.operator ? [this.operator] : [];
  }

  /**
   * Checks if this project has files for the specified operator.
   * @param {string} operatorName - Operator name to check
   * @returns {boolean} - True if operator matches
   */
  hasOperator(operatorName) {
    return this.operator === operatorName;
  }
}

/**
 * Represents a compound job (NC file) containing multiple individual jobs.
 * Each NC file is identified by programName (e.g., "W5270NS01003A1.h")
 * and should ideally contain operations that all use the same tool.
 */
class CompoundJob {
  constructor(programName) {
    this.programName = programName; // e.g., "W5270NS01003A1.h"
    this.jobs = []; // Array of individual jobs/operations in this NC file
    this.toolName = null; // Primary tool for this NC file (should be consistent)
    this.toolList = new Set(); // All tools used (to detect multiple tool violations)
    this.totalTime = 0; // Total operation time for all jobs in this NC file
    this.hasMultipleTools = false; // Rule violation: NC file should use only one tool
    this.hasIssues = false; // Any issues detected with this NC file
  }

  /**
   * Adds a job (operation) to this NC file.
   * @param {Object} operation - Operation data from JSON
   */
  addJob(operation) {
    // Create job object with the structure you specified
    const job = {
      number: operation.number, // Job number within the operation sequence
      programName: operation.programName, // Which NC file this job belongs to
      description: operation.description, // Name of the job (e.g., "1: KPF16 M9x1 LT ||| CYCL200")
      operation: operation.operation, // Strategy name (e.g., "openMIND Drilling Cycle")
      operationTime: operation.operationTime || 0, // How long this job runs/operates
      toolName: operation.toolName, // What tool this job uses
      maxSpeed: operation.maxSpeed,
      maxFeed: operation.maxFeed,
      operationArea: operation.operationArea,
    };

    this.jobs.push(job);
    this.totalTime += job.operationTime;

    // Track tool usage and detect violations
    if (job.toolName) {
      this.toolList.add(job.toolName);

      // Set primary tool (first tool encountered)
      if (!this.toolName) {
        this.toolName = job.toolName;
      }

      // Check for multiple tools in same NC file (rule violation)
      if (this.toolList.size > 1) {
        this.hasMultipleTools = true;
        this.hasIssues = true;
      }
    }
  }

  /**
   * Gets summary information for this NC file.
   */
  getSummary() {
    return {
      programName: this.programName, // NC file name
      jobCount: this.jobs.length, // Number of individual jobs in this NC file
      toolName: this.toolName, // Primary tool used
      toolList: Array.from(this.toolList), // All tools used (for violation detection)
      totalTime: this.totalTime, // Total operation time for this NC file
      hasMultipleTools: this.hasMultipleTools, // Rule violation flag
      hasIssues: this.hasIssues, // Any issues with this NC file
    };
  }

  /**
   * Getter for operations compatibility.
   * Returns the jobs array as operations for rules that expect this structure.
   */
  get operations() {
    return this.jobs;
  }

  /**
   * Check if project uses any tools from the specified category.
   * @param {string} category - Tool category name (from config.toolCategories)
   * @returns {boolean} - True if project uses tools from this category
   */
  hasToolCategory(category) {
    for (const tool of this.tools.values()) {
      if (tool.category === category) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if project has operations of specified type.
   * @param {string} operationType - Operation type to check (lowercase)
   * @returns {boolean} - True if project has this operation type
   */
  hasOperationType(operationType) {
    const searchTerm = operationType.toLowerCase();
    
    for (const compoundJob of this.compoundJobs.values()) {
      for (const job of compoundJob.jobs) {
        const jobType = (job.featureName || job.type || '').toLowerCase();
        
        // Match common operation type variations
        if (jobType.includes(searchTerm) ||
            searchTerm.includes(jobType) ||
            (searchTerm === 'helical drilling' && jobType.includes('helical')) ||
            (searchTerm === 'contour' && (jobType.includes('contour') || jobType.includes('kontur'))) ||
            (searchTerm === 'plane' && (jobType.includes('plane') || jobType.includes('surface')))) {
          return true;
        }
      }
    }
    return false;
  }
}

/**
 * Represents tool information and usage across the project.
 */
class ToolInfo {
  constructor(toolName, toolDetails = {}) {
    this.toolName = toolName;
    this.category = this.determineCategory(toolName);
    this.usagePrograms = new Set(); // Programs where this tool is used
    this.totalUsageTime = 0;
    this.usageCount = 0;

    // Tool specifications from toolDetails
    this.diameter = toolDetails.diameter || null;
    this.totalLength = toolDetails.totalLength || null;
    this.holder = toolDetails.holder || null;
    this.tool = toolDetails.tool || null;
  }

  /**
   * Determines tool category based on tool name.
   * @param {string} toolName - Tool name to categorize
   * @returns {string} - Tool category
   */
  determineCategory(toolName) {
    const { toolCategories } = require("../config");

    for (const [category, codes] of Object.entries(toolCategories)) {
      if (codes.some((code) => toolName && toolName.startsWith(code))) {
        return category;
      }
    }
    return "unknown";
  }

  /**
   * Adds usage information for this tool.
   * @param {string} programName - Program where tool is used
   * @param {number} operationTime - Time for this operation
   * @param {number} maxSpeed - Maximum speed for this operation
   * @param {number} maxFeed - Maximum feed for this operation
   */
  addUsage(programName, operationTime, maxSpeed, maxFeed) {
    this.usagePrograms.add(programName);
    this.totalUsageTime += operationTime || 0;
    this.usageCount++;
  }

  /**
   * Gets summary information for this tool.
   */
  getSummary() {
    return {
      toolName: this.toolName,
      category: this.category,
      totalUsageTime: this.totalUsageTime,
      usageCount: this.usageCount,
      programCount: this.usagePrograms.size,
      diameter: this.diameter,
      totalLength: this.totalLength,
    };
  }
}

module.exports = Project;
