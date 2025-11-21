/**
 * Data Manager for JSONScanner
 * Provides JSONScanner specific data operations using local JSON files
 */

const config = require("../config");
const { logInfo, logError, logWarn } = require("../utils/Logger");
const fs = require("fs");
const path = require("path");

class DataManager {
  constructor() {
    this.dataDir = config.app.testMode
      ? path.join(process.cwd(), "data", "test_processed_data")
      : path.join(process.cwd(), "data", "processed_data");
  }

  async initialize() {
    try {
      // Ensure data directory exists
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }

      logInfo(`📊 Data storage initialized: local JSON files`);
      return true;
    } catch (error) {
      logError("Failed to initialize data storage:", error);
      throw error;
    }
  }

  /**
   * Save scan results with metadata
   * @param {import('./Project')} project - Project instance
   * @param {Object} analysisResults - Analysis results object
   * @returns {Promise<Object>} Scan result object
   */
  async saveScanResult(project, analysisResults) {
    if (!project || typeof project.getFullName !== 'function') {
      throw new Error(`Invalid project object passed to saveScanResult: ${typeof project}`);
    }
    if (!project.projectPath) {
      throw new Error(`Project missing projectPath property: ${project.getFullName?.() || 'unknown'}`);
    }
    
    try {
      const scanResult = {
        projectPath: project.projectPath,
        projectName: project.getFullName(),
        analysisResults: analysisResults,
        timestamp: new Date().toISOString(),
        success: true,
        rulesApplied: analysisResults?.rules?.length || 0,
        issuesFound: analysisResults?.issues?.length || 0,
      };

      // Save to traditional result file
      await this.saveTraditionalResultFile(project, analysisResults);

      logInfo(`💾 Scan result saved: ${project.getFullName()}`);
      return scanResult;
    } catch (error) {
      logError(`Failed to save scan result for ${project.getFullName()}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Save traditional result file
   * @param {import('./Project')} project - Project instance
   * @param {Object} analysisResults - Analysis results object
   * @returns {Promise<string|null>} Path to saved file
   */
  async saveTraditionalResultFile(project, analysisResults) {
    try {
      const TempFileManager = require("../utils/TempFileManager");
      const tempManager = new TempFileManager();

      // Generate result filename based on project name
      const projectName = project.getFullName();
      const resultFileName = `${projectName}_BRK_result.json`;

      logInfo(`Attempting to save result: ${resultFileName}`);

      // Save to temp manager's results folder
      const tempResultPath = tempManager.saveToTemp(
        resultFileName,
        JSON.stringify(analysisResults, null, 2),
        "result"
      );

      logInfo(`✅ Result file saved to temp: ${tempResultPath}`);
      return tempResultPath;
    } catch (error) {
      logError(`Failed to save traditional result file for ${project.getFullName()}: ${error.message}`);
      logError(`Stack: ${error.stack}`);
      throw error;
    }
  }

  // API methods for retrieving stored data
  async getAllProjects() {
    try {
      const TempFileManager = require("../utils/TempFileManager");
      const tempManager = new TempFileManager();

      // Get the temp base path
      const tempBasePath = tempManager.getBasePath();

      if (!fs.existsSync(tempBasePath)) {
        return [];
      }

      const allProjects = [];
      let resultsDir;

      // Check for persistent folder structure (BRK CNC Management Dashboard/JSONScanner/results)
      if (config.app.usePersistentTempFolder) {
        resultsDir = path.join(tempBasePath, "JSONScanner", "results");

        if (fs.existsSync(resultsDir)) {
          const resultFiles = fs
            .readdirSync(resultsDir)
            .filter((file) => file.endsWith("_BRK_result.json"));

          for (const file of resultFiles) {
            try {
              const filePath = path.join(resultsDir, file);
              const data = JSON.parse(fs.readFileSync(filePath, "utf8"));

              const projectName = file.replace("_BRK_result.json", "");
              allProjects.push({
                id: projectName,
                name: projectName,
                machine: data.machine || null,
                operator: data.operator || null,
                status: this._determineStatus(data),
                operationCount: data.summary?.totalOperations || 0,
                ncFileCount: data.summary?.totalNCFiles || 0,
                timestamp:
                  data.timestamp || fs.statSync(filePath).mtime.toISOString(),
                violations: data.violations || [],
                rulesApplied: data.results?.rulesApplied || [],
              });
            } catch (error) {
              logWarn(`Failed to read result file ${file}:`, error.message);
            }
          }
        }
      } else {
        // Find all session directories (old structure)
        const sessions = fs
          .readdirSync(tempBasePath)
          .filter((file) =>
            fs.statSync(path.join(tempBasePath, file)).isDirectory()
          );

        // Scan each session for result files
        for (const session of sessions) {
          resultsDir = path.join(tempBasePath, session, "results");

          if (!fs.existsSync(resultsDir)) {
            continue;
          }

          const resultFiles = fs
            .readdirSync(resultsDir)
            .filter((file) => file.endsWith("_BRK_result.json"));

          for (const file of resultFiles) {
            try {
              const filePath = path.join(resultsDir, file);
              const data = JSON.parse(fs.readFileSync(filePath, "utf8"));

              const projectName = file.replace("_BRK_result.json", "");
              allProjects.push({
                id: projectName,
                name: projectName,
                machine: data.machine || null,
                operator: data.operator || null,
                status: this._determineStatus(data),
                operationCount: data.summary?.totalOperations || 0,
                ncFileCount: data.summary?.totalNCFiles || 0,
                timestamp:
                  data.timestamp || fs.statSync(filePath).mtime.toISOString(),
                violations: data.violations || [],
                rulesApplied: data.results?.rulesApplied || [],
                session: session,
              });
            } catch (error) {
              logWarn(`Failed to read result file ${file}:`, error.message);
            }
          }
        }
      }

      return allProjects.sort(
        (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
      );
    } catch (error) {
      logError("Failed to get all projects:", error);
      return [];
    }
  }

  async getProject(projectId) {
    try {
      const allProjects = await this.getAllProjects();
      const project = allProjects.find((p) => p.id === projectId);

      if (!project) {
        return null;
      }

      // Load full project details from result file
      const TempFileManager = require("../utils/TempFileManager");
      const tempManager = new TempFileManager();
      const tempBasePath = tempManager.getBasePath();
      
      let resultPath;
      if (config.app.usePersistentTempFolder) {
        resultPath = path.join(
          tempBasePath,
          "JSONScanner",
          "results",
          `${projectId}_BRK_result.json`
        );
      } else {
        resultPath = path.join(
          tempBasePath,
          project.session,
          "results",
          `${projectId}_BRK_result.json`
        );
      }

      if (fs.existsSync(resultPath)) {
        const fullData = JSON.parse(fs.readFileSync(resultPath, "utf8"));
        return {
          ...project,
          fullAnalysis: fullData,
        };
      }

      return project;
    } catch (error) {
      logError(`Failed to get project ${projectId}:`, error);
      return null;
    }
  }

  async getAnalysis(projectId) {
    try {
      const project = await this.getProject(projectId);
      return project?.fullAnalysis || null;
    } catch (error) {
      logError(`Failed to get analysis for ${projectId}:`, error);
      return null;
    }
  }

  _determineStatus(data) {
    if (!data.violations || data.violations.length === 0) {
      return "passed";
    }

    const hasErrors = data.violations.some((v) => v.severity === "error");
    if (hasErrors) {
      return "failed";
    }

    return "warning";
  }

  // Simplified methods for local file storage
  async getScanResults(filters = {}) {
    return await this.getAllProjects();
  }

  async getLatestScanResult(projectName) {
    const projects = await this.getAllProjects();
    return projects.find((p) => p.name === projectName) || null;
  }

  async saveProject(project) {
    return null;
  }

  async getProjects() {
    return await this.getAllProjects();
  }

  async saveRuleExecution(projectName, ruleName, result) {
    // Not implemented for local storage
  }

  async getAnalytics() {
    return {
      totalScans: 0,
      successfulScans: 0,
      totalProjects: 0,
      totalIssues: 0,
      storageType: "local",
      lastScan: null,
      recentScans: [],
    };
  }

  async cleanup() {
    // Not implemented for local storage
  }

  async createBackup() {
    return { status: "not_implemented" };
  }

  async healthCheck() {
    return {
      status: "ok",
      storageType: "local",
    };
  }

  async disconnect() {
    // Nothing to disconnect for local storage
  }
}

module.exports = DataManager;
