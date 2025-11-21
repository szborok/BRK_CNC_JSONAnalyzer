// path: src/Results.js
/**
 * Handles saving of rule check results to disk and database.
 * Updated to use DataManager for dual storage support.
 */

const fs = require("fs");
const path = require("path");
const { logInfo, logError } = require("../utils/Logger");
const config = require("../config");

class Results {
  constructor(dataManager = null, tempManager = null) {
    this.dataManager = dataManager;
    this.tempManager = tempManager;
  }

  /**
   * Saves project analysis results to storage (database + temp file).
   * @param {import('./Project')} project - The project instance
   * @param {Object} analysisResults - Analysis results from project.getAnalysisResults()
   * @returns {Promise<string|null>} Storage ID or file path, null if failed
   */
  async saveProjectResults(project, analysisResults) {
    if (!project || typeof project.getFullName !== 'function') {
      throw new Error(`Invalid project object passed to saveProjectResults: ${typeof project}`);
    }
    
    try {
      // Save to modern storage (DataManager) - skip in test mode to avoid errors
      let storageId = null;
      if (this.dataManager && !config.app.testMode) {
        storageId = await this.dataManager.saveScanResult(
          project,
          analysisResults
        );
        await this.dataManager.saveProject(project);
        logInfo(`📊 Results saved to database: ${storageId}`);
      } else if (config.app.testMode) {
        logInfo(`📊 Database save skipped in test mode`);
      }

      // ALWAYS save to temp folder (not original location)
      const tempFilePath = this.saveTempFile(project, analysisResults);

      return storageId || tempFilePath;
    } catch (error) {
      logError(`Error saving results for ${project.getFullName()}:`, error);
      return null;
    }
  }

  /**
   * Saves results to temp folder (read-only approach)
   */
  saveTempFile(project, analysisResults) {
    try {
      if (!this.tempManager) {
        logError("No temp manager available for saving results");
        return null;
      }

      // Generate result filename based on project
      const originalResultPath = project.getResultFilePath();
      if (!originalResultPath) {
        logError(
          `Cannot generate result file path for project: ${project.getFullName()}`
        );
        return null;
      }

      // Create result file in organized temp folder
      const resultFileName = path.basename(originalResultPath);

      // Use TempFileManager's organized save method
      const tempResultPath = this.tempManager.saveToTemp(
        resultFileName,
        JSON.stringify(analysisResults, null, 2),
        "result"
      );

      logInfo(`✅ Result file saved to organized temp: ${resultFileName}`);

      return tempResultPath;
    } catch (err) {
      logError(
        `❌ Failed to save temp result file for ${project.getFullName()}: ${
          err.message
        }`
      );
      return null;
    }
  }

  /**
   * Traditional file-based saving (DEPRECATED - now redirects to temp)
   */
  saveTraditionalFile(project, analysisResults) {
    logInfo("⚠️ Traditional file saving redirected to temp folder for safety");
    return this.saveTempFile(project, analysisResults);
  }

  /**
   * Loads analysis results from disk.
   * @param {string} resultPath - Path to the result file
   * @returns {Object|null} - Parsed results or null if failed
   */
  loadProjectResults(resultPath) {
    try {
      if (!fs.existsSync(resultPath)) {
        return null;
      }

      const content = fs.readFileSync(resultPath, "utf8");
      return JSON.parse(content);
    } catch (err) {
      logError(`Failed to load result file ${resultPath}: ${err.message}`);
      return null;
    }
  }

  /**
   * Gets all result files in a directory.
   * @param {string} scanPath - Directory to scan for result files
   * @returns {Array} - Array of result file paths
   */
  getAllResultFiles(scanPath) {
    const resultFiles = [];

    const scanDirectory = (dirPath) => {
      try {
        const items = fs.readdirSync(dirPath, { withFileTypes: true });

        for (const item of items) {
          const fullPath = path.join(dirPath, item.name);

          if (item.isDirectory()) {
            scanDirectory(fullPath);
          } else if (item.isFile() && item.name.endsWith("_BRK_result.json")) {
            resultFiles.push(fullPath);
          }
        }
      } catch (err) {
        logError(`Cannot scan directory ${dirPath}: ${err.message}`);
      }
    };

    scanDirectory(scanPath);
    return resultFiles;
  }

  /**
   * Gets all generated files (both fixed and result files) in a directory.
   * @param {string} scanPath - Directory to scan for generated files
   * @returns {Array} - Array of generated file paths
   */
  getAllGeneratedFiles(scanPath) {
    const generatedFiles = [];

    const scanDirectory = (dirPath) => {
      try {
        const items = fs.readdirSync(dirPath, { withFileTypes: true });

        for (const item of items) {
          const fullPath = path.join(dirPath, item.name);

          if (item.isDirectory()) {
            scanDirectory(fullPath);
          } else if (
            item.isFile() &&
            (item.name.endsWith("_BRK_result.json") ||
              item.name.endsWith("_BRK_fixed.json"))
          ) {
            generatedFiles.push(fullPath);
          }
        }
      } catch (err) {
        logError(`Cannot scan directory ${dirPath}: ${err.message}`);
      }
    };

    scanDirectory(scanPath);
    return generatedFiles;
  }
}

module.exports = Results;
