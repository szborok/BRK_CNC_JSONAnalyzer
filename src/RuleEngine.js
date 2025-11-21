// path: src/RuleEngine.js
/**
 * RuleEngine automatically discovers and executes rule modules from /rules directory.
 * Integrates with config.rules to determine which rules should run for each project.
 * Works with the new Project structure containing CompoundJobs and ToolInfo.
 */

const fs = require("fs");
const path = require("path");
const { logInfo, logWarn, logError } = require("../utils/Logger");
const config = require("../config");

class RuleEngine {
  constructor() {
    this.rules = new Map(); // Map<ruleName, ruleFunction>
    this.rulesPath = path.join(__dirname, "..", "rules");
    this.loadRules();
  }

  /**
   * Automatically discovers and loads all rule files from /rules directory.
   * Each file should export exactly one rule function.
   */
  loadRules() {
    try {
      if (!fs.existsSync(this.rulesPath)) {
        logWarn(`Rules directory not found: ${this.rulesPath}`);
        return;
      }

      const files = fs.readdirSync(this.rulesPath);
      const jsFiles = files.filter((file) => file.endsWith(".js"));

      logInfo(`Discovering rules in ${this.rulesPath}`);

      for (const file of jsFiles) {
        const fullPath = path.join(this.rulesPath, file);
        const fileName = path.basename(file, ".js");
        
        try {
          // Clear require cache to allow hot reloading
          delete require.cache[require.resolve(fullPath)];
          const ruleModule = require(fullPath);
          
          // Extract the single rule function from the module
          const ruleFunction = this.extractRuleFunction(ruleModule, fileName, file);
          
          if (ruleFunction) {
            this.rules.set(fileName, ruleFunction);
            logInfo(`✓ Loaded rule: ${fileName} from ${file}`);
          } else {
            logWarn(`⚠ No valid rule function found in ${file}`);
          }
          
        } catch (err) {
          logError(`Failed to load rule file ${file}: ${err.message}`);
        }
      }

      logInfo(`Successfully loaded ${this.rules.size} rule(s) from ${jsFiles.length} file(s)`);
      this.listLoadedRules();
      
    } catch (err) {
      logError(`Failed to load rules directory: ${err.message}`);
    }
  }

  /**
   * Extracts the single rule function from a rule module.
   * Each file should export exactly one function.
   * @param {*} ruleModule - The loaded rule module
   * @param {string} fileName - Name of the rule file (without .js)
   * @param {string} fullFileName - Full filename for error reporting
   * @returns {Function|null} - The rule function or null if not found
   */
  extractRuleFunction(ruleModule, fileName, fullFileName) {
    // Pattern 1: Single function as module.exports
    if (typeof ruleModule === 'function') {
      return ruleModule;
    }
    
    // Pattern 2: Object with one exported function
    if (typeof ruleModule === 'object' && ruleModule !== null) {
      const functionKeys = Object.keys(ruleModule).filter(key => typeof ruleModule[key] === 'function');
      
      if (functionKeys.length === 1) {
        // Exactly one function - good!
        return ruleModule[functionKeys[0]];
      } else if (functionKeys.length > 1) {
        logWarn(`File ${fullFileName} exports ${functionKeys.length} functions. Expected exactly 1. Using first function: ${functionKeys[0]}`);
        return ruleModule[functionKeys[0]];
      } else {
        logError(`File ${fullFileName} exports no functions`);
        return null;
      }
    }
    
    logError(`File ${fullFileName} does not export a function or object with functions`);
    return null;
  }

  /**
   * Lists all loaded rules for debugging.
   */
  listLoadedRules() {
    const ruleNames = Array.from(this.rules.keys()).sort();
    logInfo(`Available rules: ${ruleNames.join(', ')}`);
  }

  /**
   * Executes all applicable rules on the given project.
   * @param {Project} project - Project instance with CompoundJobs and ToolInfo
   * @returns {Object} - Rule execution results
   */
  executeRules(project) {
    logInfo(`Executing rules for project: ${project.getFullName()}`);
    
    const results = {};
    let rulesRun = 0;
    let rulesSkipped = 0;

    // Execute each loaded rule
    for (const [ruleName, ruleFunction] of this.rules) {
      try {
        // Check if rule should run for this project
        const ruleConfig = config.rules[ruleName];
        const shouldRun = this.shouldRunRule(project, ruleName, ruleConfig);

        if (shouldRun) {
          logInfo(`Running rule: ${ruleName}`);
          const result = this.executeRule(project, ruleName, ruleFunction);
          results[ruleName] = result;
          rulesRun++;
        } else {
          logInfo(`Skipping rule: ${ruleName} (not applicable for this project)`);
          results[ruleName] = null; // Mark as not run
          rulesSkipped++;
        }
        
      } catch (err) {
        logError(`Rule ${ruleName} execution failed: ${err.message}`);
        results[ruleName] = {
          error: true,
          message: err.message,
          stack: err.stack
        };
      }
    }

    logInfo(`Rules execution completed: ${rulesRun} run, ${rulesSkipped} skipped`);
    return results;
  }

  /**
   * Determines if a rule should run for the given project.
   * @param {Project} project - Project instance
   * @param {string} ruleName - Name of the rule
   * @param {Object} ruleConfig - Rule configuration from config.rules
   * @returns {boolean} - True if rule should run
   */
  shouldRunRule(project, ruleName, ruleConfig) {
    if (!ruleConfig) {
      logWarn(`No configuration found for rule: ${ruleName}, skipping`);
      return false;
    }

    if (ruleConfig.logic && typeof ruleConfig.logic === 'function') {
      try {
        return ruleConfig.logic(project);
      } catch (err) {
        logError(`Error in rule logic for ${ruleName}: ${err.message}`);
        return false;
      }
    }

    // No logic defined, default to not running
    logWarn(`No logic defined for rule: ${ruleName}`);
    return false;
  }

  /**
   * Executes a single rule function with proper data extraction.
   * @param {Project} project - Project instance
   * @param {string} ruleName - Name of the rule (filename without .js)
   * @param {Function} ruleFunction - Rule function to execute
   * @returns {*} - Rule execution result
   */
  executeRule(project, ruleName, ruleFunction) {
    try {
      // Try with project first (modern rules like M110Helical, M110Contour expect this)
      return ruleFunction(project);
      
    } catch (err) {
      // If rule fails with project, try with operations array (legacy compatibility)
      logWarn(`Rule ${ruleName} failed with project parameter, trying with operations array`);
      
      try {
        const operations = this.extractOperationsArray(project);
        return ruleFunction(operations);
      } catch (err2) {
        // If both fail, try with enhanced project data
        logWarn(`Rule ${ruleName} failed with operations array, trying with enhanced project data`);
        
        try {
          const compoundJobs = Array.from(project.compoundJobs.values());
          const tools = Array.from(project.tools.values());
          return ruleFunction(project, compoundJobs, tools);
        } catch (err3) {
          throw new Error(`Rule execution failed with all parameter combinations: ${err.message}`);
        }
      }
    }
  }

  /**
   * Extracts a flat operations array from project CompoundJobs for legacy rules.
   * @param {Project} project - Project instance
   * @returns {Array} - Flat array of all operations
   */
  extractOperationsArray(project) {
    const operations = [];
    
    project.compoundJobs.forEach((compoundJob) => {
      if (compoundJob.operations && Array.isArray(compoundJob.operations)) {
        compoundJob.operations.forEach((operation) => {
          operations.push(operation);
        });
      }
    });
    
    return operations;
  }

  /**
   * Gets information about all available rules.
   * @returns {Array} - Array of rule information objects
   */
  getRulesInfo() {
    const rulesInfo = [];
    
    this.rules.forEach((ruleFunction, ruleName) => {
      const ruleConfig = config.rules[ruleName];
      rulesInfo.push({
        name: ruleName,
        description: ruleConfig?.description || 'No description available',
        failureType: ruleConfig?.failureType || 'unknown',
        hasConfig: !!ruleConfig,
        hasLogic: !!(ruleConfig?.logic)
      });
    });
    
    return rulesInfo.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Reloads all rules (useful for development/hot reloading).
   */
  reloadRules() {
    logInfo('Reloading all rules...');
    this.rules.clear();
    this.loadRules();
  }
}

module.exports = RuleEngine;