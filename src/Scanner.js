// path: src/Scanner.js
/**
 * Handles automatic or manual scanning of project directories.
 * Detects new JSON files and initializes Project instances.
 * Uses TempFileManager for read-only operations on original files.
 */

const fs = require("fs");
const path = require("path");
const config = require("../config");
const { logInfo, logWarn, logError } = require("../utils/Logger");
const { getDirectories } = require("../utils/FileUtils");
const Project = require("./Project");

class Scanner {
  constructor() {
    this.projects = [];
    this.running = false;
    this.scannedPaths = new Set(); // Track what we've scanned

    logInfo("JSONAnalyzer reads directly from JSONScanner's fixed_jsons - no copying needed");
  }

  /**
   * Start the scanner.
   * In AUTO mode, the Executor will control scanning.
   * In MANUAL mode, this enables manual scanning capability.
   */
  start() {
    this.running = true;
    logInfo(
      `Scanner started in ${config.app.autorun ? "AUTO" : "MANUAL"} mode`
    );

    // In AUTO mode, the Executor controls scanning timing
    // In MANUAL mode, scanning happens on-demand
  }

  /**
   * Stop scanning after the current cycle.
   * @param {boolean} preserveResults - Whether to preserve result files
   */
  stop(preserveResults = false) {
    this.running = false;
    logWarn("Scanner stopped after finishing current project.");
    logInfo("JSONAnalyzer stopped - no cleanup needed (reads from JSONScanner output)");
  }

  /**
   * Perform one scan of the data directory.
   * Detects new project folders matching the naming pattern.
   * Uses temp file copies for read-only processing.
   * @param {string} customPath - Custom path for manual mode (optional)
   */
  async performScan(customPath = null) {
    try {
      // Get the appropriate scan path based on mode and test settings
      const scanPath = customPath || config.getScanPath();

      if (!scanPath) {
        logError("No scan path available. Manual mode requires a custom path.");
        return [];
      }

      logInfo(`🔍 Scanning: ${scanPath}`);

      if (!fs.existsSync(scanPath)) {
        if (config.app.testMode) {
          logWarn(`Test path does not exist: ${scanPath}`);
        } else {
          logError(
            `Production path does not exist: ${scanPath}. Creating directory...`
          );
          fs.mkdirSync(scanPath, { recursive: true });
          logInfo(`📁 Created production directory: ${scanPath}`);
        }
        return [];
      }

      // Check for changes in previously scanned paths
      if (this.scannedPaths.has(scanPath)) {
        logInfo(
          `🔄 Re-scanning: ${scanPath}`
        );
      } else {
        // First time scanning this path
        this.scannedPaths.add(scanPath);
        logInfo(`📂 First scan of path: ${scanPath}`);
      }

      const dirs = getDirectories(scanPath);

      // Recursively scan all directories to find JSON files
      const allJsonFiles = await this.findAllJsonFiles(scanPath);

      if (allJsonFiles.length === 0) {
        logWarn("No JSON files found in any subdirectories.");
        return;
      }

      logInfo(
        `Found ${allJsonFiles.length} JSON file(s) across all subdirectories.`
      );

      // Group JSON files by project and create Project instances
      const projectGroups = this.groupJsonFilesByProject(allJsonFiles);
      logInfo(`📦 Grouped into ${projectGroups.size} project group(s)`);
      let totalProjectsProcessed = 0;

      for (const [projectKey, jsonFiles] of projectGroups) {
        logInfo(`📂 Processing group "${projectKey}" with ${jsonFiles.length} file(s)`);
        for (const jsonFile of jsonFiles) {
          try {
            logInfo(`🔧 Processing: ${jsonFile?.projectName}`);
            
            // Create a project for each JSON file found (reads directly from JSONScanner output)
            const projectPath = this.getProjectPathFromJsonFile(jsonFile);
            
            if (!projectPath || typeof projectPath !== 'string') {
              logError(`Invalid project path for ${jsonFile.fileName}: ${projectPath} (type: ${typeof projectPath})`);
              continue;
            }
            
            const project = new Project(projectPath);

            // Set paths BEFORE any method calls that might use them
            project.jsonFilePath = jsonFile.fullPath;
            project.originalJsonFilePath = jsonFile.fullPath;
            project.machineFolder = path.dirname(jsonFile.fullPath);
            project.originalMachineFolder = path.dirname(jsonFile.fullPath);
            project.position = jsonFile.position;

            // Check if project has fatal errors and should be skipped
            try {
              if (project.hasFatalErrors()) {
                logWarn(
                  `⚠️  Skipping project "${jsonFile.projectName}" - marked as fatal error`
                );
                continue;
              }
            } catch (err) {
              logError(`Error checking fatal errors for ${jsonFile.projectName}: ${err.message}`);
              throw err;
            }

            // Load JSON data from temp copy
            let loaded;
            try {
              loaded = project.loadJsonData();
            } catch (err) {
              logError(`Error loading JSON data for ${jsonFile.projectName}: ${err.message}`);
              throw err;
            }
            if (loaded) {
              // Check if already processed (unless force reprocessing is enabled)
              if (project.isAlreadyProcessed() && !config.app.forceReprocess) {
                logInfo(
                  `⏭️  Skipping project "${jsonFile.projectName}" - already processed (result file exists)`
                );
                continue;
              }

              project.isValid = true;
              project.status = "ready";
              this.projects.push(project);
              logInfo(
                `Added project "${
                  jsonFile.projectName
                }" with ${project.getTotalJobCount()} operations, ${
                  project.compoundJobs.size
                } NC files (using temp copy)`
              );
              totalProjectsProcessed++;
            }
          } catch (err) {
            logError(
              `Error processing JSON file ${jsonFile.fileName}: ${err.message}`
            );
          }
        }
      }

      logInfo(
        `Successfully processed ${totalProjectsProcessed} project(s) from ${allJsonFiles.length} JSON file(s).`
      );
    } catch (err) {
      logError(`Scanner failed: ${err.message}`);
    }
  }

  /**
   * Trigger a manual scan for a single project path (used when autorun is off).
   * @param {string} projectPath - Path to the project to scan.
   */
  scanProject(projectPath) {
    try {
      const project = new Project(projectPath);
      const initialized = project.initialize();

      if (initialized && project.isValid) {
        this.projects.push(project);
        logInfo(
          `Manually added project "${project.name}" with ${project.compoundJobs.size} NC file(s)`
        );
      } else {
        logWarn(`Project "${project.name}" has no valid target JSON files`);
      }
    } catch (err) {
      logError(`Manual scan failed: ${err.message}`);
    }
  }

  /**
   * Returns all discovered projects.
   */
  getProjects() {
    return this.projects;
  }

  /**
   * Get session information.
   */
  getTempSessionInfo() {
    return {
      scanPath: this.scannedPaths.size > 0 ? Array.from(this.scannedPaths)[0] : null,
      projectCount: this.projects.length
    };
  }

  /**
   * Check for changes and rescan if needed.
   * @param {string[]} specificPaths - Optional array of specific paths to check
   * @returns {Promise<Object>} - Change detection results
   */
  async checkForChanges(specificPaths = null) {
    logInfo("✅ JSONAnalyzer reads from JSONScanner output - no change tracking needed");
    return null;
  }

  /**
   * Force a rescan by clearing temp files and rescanning.
   * @param {string} customPath - Custom path for manual mode (optional)
   */
  async forceRescan(customPath = null) {
    try {
      logInfo("🔄 Forcing complete rescan...");

      // Clear existing data
      this.projects = [];
      this.scannedPaths.clear();

      // JSONAnalyzer doesn't manage temp files - just reset state

      // Perform fresh scan
      await this.performScan(customPath);

      logInfo("✅ Force rescan completed.");
    } catch (err) {
      logError(`Force rescan failed: ${err.message}`);
      throw err;
    }
  }

  /**
   * Prompts user for a path in manual mode (when not in test mode).
   * @returns {Promise<string>} The path provided by user
   */
  async promptForPath() {
    const readline = require("readline");
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) => {
      const currentMode = config.app.testMode ? "TEST" : "PRODUCTION";
      logInfo(
        `\n📂 Manual Mode (${currentMode}) - Please provide a path to scan:`
      );
      logInfo(`Example: D:\\YourData\\Projects`);

      rl.question("Enter path: ", (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    });
  }

  /**
   * Scan with automatic path resolution or user prompt if needed.
   * @param {string} providedPath - Optional path provided externally
   * @returns {Promise<void>}
   */
  async scanWithPathResolution(providedPath = null) {
    try {
      let scanPath = providedPath;

      // Check if we need to ask user for path
      if (!scanPath && config.requiresUserPath()) {
        scanPath = await this.promptForPath();

        if (!scanPath) {
          logError("No path provided. Cannot proceed with manual scan.");
          return;
        }
      }

      // Perform the scan
      this.performScan(scanPath);
    } catch (err) {
      logError(`Path resolution failed: ${err.message}`);
    }
  }

  /**
   * Recursively finds all JSON files in the given directory tree.
   * Creates temp copies for read-only processing.
   * @param {string} rootPath - Root directory to start searching
   * @returns {Array} - Array of JSON file objects with metadata
   */
  async findAllJsonFiles(rootPath) {
    const jsonFiles = [];

    const scanDirectory = async (dirPath) => {
      try {
        const items = fs.readdirSync(dirPath, { withFileTypes: true });

        for (const item of items) {
          const fullPath = path.join(dirPath, item.name);

          if (item.isDirectory()) {
            // Recursively scan subdirectories
            await scanDirectory(fullPath);
          } else if (item.isFile() && item.name.endsWith(".json")) {
            // Skip generated files (only _fixed and _result suffixes, not BRK_ prefix)
            if (
              item.name.includes("_fixed") ||
              item.name.includes("_result")
            ) {
              continue;
            }

            // Extract project information from filename and path
            const fileInfo = this.extractProjectInfoFromPath(
              fullPath,
              item.name
            );
            if (fileInfo) {
              // JSONAnalyzer reads directly from JSONScanner's fixed_jsons - no copying
              jsonFiles.push(fileInfo);
              logInfo(`📄 Found: ${item.name}`);
            } else {
              logWarn(`⚠️  Could not extract project info from: ${item.name}`);
            }
          }
        }
      } catch (err) {
        logWarn(`Cannot scan directory ${dirPath}: ${err.message}`);
      }
    };

    await scanDirectory(rootPath);
    return jsonFiles;
  }

  /**
   * Extracts project information from JSON file path and name.
   * @param {string} fullPath - Full path to the JSON file
   * @param {string} fileName - Name of the JSON file
   * @returns {Object|null} - Project info object or null if not a valid project file
   */
  extractProjectInfoFromPath(fullPath, fileName) {
    // Match project pattern: W5270NS01003A.json or BRK_W5270NS01003A.json
    // Project folder is W5270NS01003, file is W5270NS01003A.json (A/B/C/AA etc is position)
    const cleanFileName = fileName.replace(/^BRK_/, '');
    const projectMatch = cleanFileName.match(
      /^(W\d{4}[A-Z]{2}\d{2,})([A-Z]+)\.json$/
    );

    if (projectMatch) {
      const projectBase = projectMatch[1]; // W5270NS01003
      const position = projectMatch[2] || "A"; // A, B, C, etc. (default to A if not specified)
      const projectName = projectBase + position; // W5270NS01003A

      return {
        fullPath: fullPath,
        fileName: cleanFileName,
        projectBase: projectBase,
        projectName: projectName,
        position: position,
        directory: path.dirname(fullPath),
      };
    }

    return null;
  }

  /**
   * Groups JSON files by project for organized processing.
   * @param {Array} jsonFiles - Array of JSON file objects
   * @returns {Map} - Map of project groups
   */
  groupJsonFilesByProject(jsonFiles) {
    const groups = new Map();

    for (const jsonFile of jsonFiles) {
      const key = jsonFile.projectName;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(jsonFile);
    }

    return groups;
  }

  /**
   * Determines the project path from a JSON file location.
   * @param {Object} jsonFile - JSON file object with path information
   * @returns {string} - Project directory path
   */
  getProjectPathFromJsonFile(jsonFile) {
    if (!jsonFile || !jsonFile.fullPath) {
      return null;
    }
    
    // Navigate up to find the project root directory
    let currentPath = path.dirname(jsonFile.fullPath);

    // Look for a directory that matches the project base pattern
    while (currentPath && currentPath !== path.parse(currentPath).root) {
      const dirName = path.basename(currentPath);

      // Check if this directory matches the project pattern
      if (jsonFile.projectBase && new RegExp(`^${jsonFile.projectBase}$`).test(dirName)) {
        return currentPath;
      }

      currentPath = path.dirname(currentPath);
    }

    // If no matching project directory found, use the directory containing the JSON file
    return path.dirname(jsonFile.fullPath);
  }
}

module.exports = Scanner;
