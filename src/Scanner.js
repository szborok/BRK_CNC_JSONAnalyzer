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
const PersistentTempManager = require("../utils/PersistentTempManager");

class Scanner {
  constructor() {
    this.projects = [];
    this.running = false;

    // Determine temp base path based on test mode
    const customTempBasePath = config.app.testMode
      ? config.app.testProcessedDataPath
      : null;

    // Always use PersistentTempManager for consistent BRK structure
    this.tempManager = new PersistentTempManager("JSONScanner");
    logInfo("Using persistent temp folder with original structure");

    this.scannedPaths = new Set(); // Track what we've scanned

    if (config.app.testMode) {
      logInfo(`Test mode: Using test_processed_data for temp operations`);
    }
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
    logInfo(`Temp session: ${this.tempManager.sessionId}`);

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

    // Cleanup temp files (optionally preserving results)
    this.tempManager.cleanup(preserveResults);

    if (preserveResults) {
      logInfo("Temporary files cleaned up (results preserved in archive).");
    } else {
      logInfo("Temporary files cleaned up.");
    }
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
          `🔄 Checking for changes in previously scanned path: ${scanPath}`
        );
        const changes = await this.tempManager.detectChanges();

        if (changes.hasChanges) {
          logInfo(`📝 ${changes.summary}`);
          await this.tempManager.updateChangedFiles(changes);
        } else {
          logInfo("✅ No changes detected since last scan.");
          return this.projects; // Return existing projects if no changes
        }
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
      let totalProjectsProcessed = 0;

      for (const [projectKey, jsonFiles] of projectGroups) {
        for (const jsonFile of jsonFiles) {
          try {
            // Create a project for each JSON file found using temp path
            const projectPath = this.getProjectPathFromJsonFile(jsonFile);
            const project = new Project(projectPath);

            // Set the temp JSON file path (projects will work with temp copies)
            project.jsonFilePath = jsonFile.tempPath;
            project.originalJsonFilePath = jsonFile.fullPath; // Keep reference to original
            project.machineFolder = path.dirname(jsonFile.tempPath);
            project.originalMachineFolder = path.dirname(jsonFile.fullPath);
            project.position = jsonFile.position;

            // Check if project has fatal errors and should be skipped
            if (project.hasFatalErrors()) {
              logWarn(
                `⚠️  Skipping project "${jsonFile.projectName}" - marked as fatal error`
              );
              continue;
            }

            // Load JSON data from temp copy
            const loaded = project.loadJsonData();
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
   * Get temp file manager session information.
   */
  getTempSessionInfo() {
    return this.tempManager.getSessionInfo();
  }

  /**
   * Check for changes and rescan if needed.
   * @param {string[]} specificPaths - Optional array of specific paths to check
   * @returns {Promise<Object>} - Change detection results
   */
  async checkForChanges(specificPaths = null) {
    try {
      const changes = await this.tempManager.detectChanges(specificPaths);

      if (changes.hasChanges) {
        logInfo(`🔄 Changes detected: ${changes.summary}`);

        // Update temp copies for changed files
        await this.tempManager.updateChangedFiles(changes);

        // Clear existing projects that might be affected
        this.projects = this.projects.filter((project) => {
          const originalPath = project.originalJsonFilePath;
          return (
            !changes.changedFiles.some(
              (change) => change.path === originalPath
            ) &&
            !changes.newFiles.includes(originalPath) &&
            !changes.deletedFiles.includes(originalPath)
          );
        });

        logInfo(
          "Updated temp copies and cleared affected projects for rescanning."
        );
      }

      return changes;
    } catch (err) {
      logError(`Change detection failed: ${err.message}`);
      throw err;
    }
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

      // Cleanup and recreate temp manager (always use PersistentTempManager for BRK structure)
      this.tempManager.cleanup();
      this.tempManager = new PersistentTempManager("JSONScanner");

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
            // Skip generated files
            if (
              item.name.includes("BRK_fixed") ||
              item.name.includes("BRK_result")
            ) {
              continue;
            }

            // Extract project information from filename and path
            const fileInfo = this.extractProjectInfoFromPath(
              fullPath,
              item.name
            );
            if (fileInfo) {
              try {
                if (config.app.usePersistentTempFolder) {
                  // Use new persistent approach - copy only essential files with structure
                  const copyResult = await this.tempManager.copyJsonProject(
                    fullPath,
                    rootPath
                  );
                  fileInfo.tempPath = copyResult.jsonFile;
                  fileInfo.tempProjectDir = path.dirname(copyResult.jsonFile);
                  fileInfo.sessionFile = copyResult.sessionFile;
                  fileInfo.ncFiles = copyResult.ncFiles;
                  fileInfo.isChanged = copyResult.isChanged;
                  fileInfo.sessionId = copyResult.sessionId;
                } else {
                  // Legacy approach - copy JSON file and entire project directory
                  const tempPath = await this.tempManager.copyToTemp(fullPath);
                  fileInfo.tempPath = tempPath;

                  // Also copy the entire project directory if it contains NC files
                  const projectDir = this.getProjectPathFromJsonFile(fileInfo);
                  if (projectDir && projectDir !== path.dirname(fullPath)) {
                    const tempProjectDir = await this.tempManager.copyToTemp(
                      projectDir
                    );
                    fileInfo.tempProjectDir = tempProjectDir;
                  }
                }

                jsonFiles.push(fileInfo);
                logInfo(
                  `📄 Copied to temp: ${item.name} → ${path.basename(
                    fileInfo.tempPath
                  )}`
                );
              } catch (err) {
                logError(`Failed to copy ${fullPath} to temp: ${err.message}`);
              }
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
    // Match project pattern: W5270NS01003A.json
    const projectMatch = fileName.match(
      /^(W\d{4}[A-Z]{2}\d{2,})([A-Z]?)\.json$/
    );

    if (projectMatch) {
      const projectBase = projectMatch[1]; // W5270NS01003
      const position = projectMatch[2] || "A"; // A, B, C, etc. (default to A if not specified)
      const projectName = projectBase + position; // W5270NS01003A

      return {
        fullPath: fullPath,
        fileName: fileName,
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
    // Navigate up to find the project root directory
    let currentPath = path.dirname(jsonFile.fullPath);

    // Look for a directory that matches the project base pattern
    while (currentPath && currentPath !== path.parse(currentPath).root) {
      const dirName = path.basename(currentPath);

      // Check if this directory matches the project pattern
      if (new RegExp(`^${jsonFile.projectBase}$`).test(dirName)) {
        return currentPath;
      }

      currentPath = path.dirname(currentPath);
    }

    // If no matching project directory found, use the directory containing the JSON file
    return path.dirname(jsonFile.fullPath);
  }
}

module.exports = Scanner;
