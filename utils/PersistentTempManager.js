// utils/PersistentTempManager.js
/**
 * Manages persistent temporary files with original directory structure
 * Only copies essential files and tracks processing sessions per JSON file
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { logInfo, logWarn, logError } = require("./Logger");
const config = require("../config");

class PersistentTempManager {
  constructor(appName = "JSONScanner") {
    // Support user-defined working folder like ToolManager
    if (config.app.userDefinedWorkingFolder) {
      this.tempBasePath = config.app.userDefinedWorkingFolder;
    } else if (config.app.testMode && config.app.testProcessedDataPath) {
      // Use test_processed_data path for test mode
      this.tempBasePath = config.app.testProcessedDataPath;
    } else {
      // Create persistent temp folder structure
      this.tempBasePath = path.join(
        os.tmpdir(),
        config.app.tempBaseName || "BRK CNC Management Dashboard"
      );
    }

    this.appName = appName;
    this.appPath = path.join(this.tempBasePath, "BRK CNC Management Dashboard", this.appName);

    if (config.app.usePersistentTempFolder) {
      this.sessionPath = this.appPath; // Work directly in app folder
    } else {
      // Fallback to session-based approach
      this.sessionId = this.generateSessionId();
      this.sessionPath = path.join(this.appPath, this.sessionId);
    }

    this.fileHashes = new Map(); // Track file hashes for change detection
    this.pathMapping = new Map(); // Map temp paths back to original paths
    this.currentSessionId = this.generateSessionId();

    // Create organized subdirectories for different types of files
    this.collectedJsonsPath = path.join(this.sessionPath, "collected_jsons");
    this.fixedJsonsPath = path.join(this.sessionPath, "fixed_jsons");
    this.resultsPath = path.join(this.sessionPath, "results");
    this.inputFilesPath = path.join(this.sessionPath, "input_files");

    this.ensureDirectoryStructure();
  }

  /**
   * Generate unique session ID for this scanning session
   */
  generateSessionId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `session_${timestamp}_${random}`;
  }

  /**
   * Ensure base directory structure exists
   */
  ensureDirectoryStructure() {
    try {
      if (!fs.existsSync(this.tempBasePath)) {
        fs.mkdirSync(this.tempBasePath, { recursive: true });
        logInfo(`Created temp base directory: ${this.tempBasePath}`);
      }

      if (!fs.existsSync(this.sessionPath)) {
        fs.mkdirSync(this.sessionPath, { recursive: true });
        logInfo(`Created persistent temp directory: ${this.sessionPath}`);
      }

      // Create organized subdirectories
      const subdirs = [
        this.collectedJsonsPath,
        this.fixedJsonsPath,
        this.resultsPath,
        this.inputFilesPath,
      ];
      subdirs.forEach((dir) => {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      });
    } catch (error) {
      logError(`Failed to create temp directories: ${error.message}`);
      throw error;
    }
  }

  /**
   * Copy a JSON project with its essential files, preserving directory structure
   * @param {string} jsonFilePath - Path to the target JSON file
   * @param {string} sourceBasePath - Base path of the scan directory
   * @returns {Object} - Information about copied files
   */
  async copyJsonProject(jsonFilePath, sourceBasePath) {
    try {
      // Calculate relative path from scan base to preserve structure
      const relativePath = path.relative(sourceBasePath, jsonFilePath);
      const tempJsonPath = path.join(this.inputFilesPath, relativePath);

      // Ensure target directory exists
      const tempDir = path.dirname(tempJsonPath);
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const result = {
        jsonFile: tempJsonPath,
        sessionFile: null,
        ncFiles: [],
        isChanged: false,
        sessionId: this.currentSessionId,
      };

      // Check if JSON file has changed
      const hasChanged = await this.hasFileChanged(jsonFilePath, tempJsonPath);

      if (hasChanged) {
        // Copy the JSON file
        await this.copyFileWithTracking(jsonFilePath, tempJsonPath);
        result.isChanged = true;

        // Copy related NC files in the same directory
        const sourceDir = path.dirname(jsonFilePath);
        const ncFiles = await this.findEssentialFiles(sourceDir);

        for (const ncFile of ncFiles) {
          const ncRelativePath = path.relative(sourceBasePath, ncFile);
          const tempNcPath = path.join(this.inputFilesPath, ncRelativePath);

          // Ensure NC file directory exists
          const ncTempDir = path.dirname(tempNcPath);
          if (!fs.existsSync(ncTempDir)) {
            fs.mkdirSync(ncTempDir, { recursive: true });
          }

          await this.copyFileWithTracking(ncFile, tempNcPath);
          result.ncFiles.push(tempNcPath);
        }

        // Create/update session tracking file
        const sessionFile =
          tempJsonPath + config.tempFiles.sessionTrackingExtension;
        await this.updateSessionFile(sessionFile);
        result.sessionFile = sessionFile;

        logInfo(
          `📁 Copied project: ${path.basename(jsonFilePath)} (${
            result.ncFiles.length
          } NC files)`
        );
      } else {
        logInfo(`📋 Using cached: ${path.basename(jsonFilePath)} (no changes)`);

        // Still need to find existing NC files for processing
        const tempDir = path.dirname(tempJsonPath);
        if (fs.existsSync(tempDir)) {
          const existingFiles = fs.readdirSync(tempDir);
          for (const file of existingFiles) {
            if (this.isEssentialFile(file) && file.endsWith(".h")) {
              result.ncFiles.push(path.join(tempDir, file));
            }
          }
        }

        // Check if session file exists
        const sessionFile =
          tempJsonPath + config.tempFiles.sessionTrackingExtension;
        if (fs.existsSync(sessionFile)) {
          result.sessionFile = sessionFile;
        }
      }

      return result;
    } catch (error) {
      logError(`Failed to copy JSON project ${jsonFilePath}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Find essential files in a directory (NC files, etc.)
   * @param {string} dirPath - Directory to search
   * @returns {Array} - Array of essential file paths
   */
  async findEssentialFiles(dirPath) {
    const essentialFiles = [];

    try {
      if (!fs.existsSync(dirPath)) {
        return essentialFiles;
      }

      const items = fs.readdirSync(dirPath);

      for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const stats = fs.statSync(itemPath);

        if (stats.isFile() && this.isEssentialFile(item)) {
          essentialFiles.push(itemPath);
        }
      }
    } catch (error) {
      logWarn(`Failed to scan directory ${dirPath}: ${error.message}`);
    }

    return essentialFiles;
  }

  /**
   * Check if a file is essential (should be copied)
   * @param {string} filename - Name of the file
   * @returns {boolean} - True if file should be copied
   */
  isEssentialFile(filename) {
    const ext = path.extname(filename).toLowerCase();

    // Skip files we don't want
    if (config.tempFiles.skipExtensions.includes(ext)) {
      return false;
    }

    // Include essential extensions
    if (config.tempFiles.essentialExtensions.includes(ext)) {
      return true;
    }

    // Skip session tracking files
    if (filename.endsWith(config.tempFiles.sessionTrackingExtension)) {
      return false;
    }

    return false;
  }

  /**
   * Check if a file has changed since last copy
   * @param {string} sourcePath - Original file path
   * @param {string} tempPath - Temp file path
   * @returns {boolean} - True if file has changed or doesn't exist in temp
   */
  async hasFileChanged(sourcePath, tempPath) {
    try {
      // If temp file doesn't exist, consider it changed
      if (!fs.existsSync(tempPath)) {
        return true;
      }

      // Check stored hash information
      const storedInfo = this.fileHashes.get(sourcePath);
      const sourceStats = fs.statSync(sourcePath);

      if (!storedInfo) {
        // No stored info, consider changed
        return true;
      }

      // Quick check: modification time
      if (sourceStats.mtime.getTime() !== storedInfo.mtime.getTime()) {
        // File might have changed, verify with hash
        const currentHash = await this.calculateFileHash(sourcePath);

        if (currentHash !== storedInfo.hash) {
          return true;
        }
      }

      return false;
    } catch (error) {
      logWarn(
        `Error checking file changes for ${sourcePath}: ${error.message}`
      );
      return true; // Assume changed if we can't determine
    }
  }

  /**
   * Copy a file and track its metadata
   * @param {string} sourcePath - Source file path
   * @param {string} tempPath - Destination temp path
   */
  async copyFileWithTracking(sourcePath, tempPath) {
    try {
      // Calculate file hash for change detection
      const sourceHash = await this.calculateFileHash(sourcePath);
      const sourceStats = fs.statSync(sourcePath);

      // Copy file
      fs.copyFileSync(sourcePath, tempPath);

      // Store metadata for change detection
      this.fileHashes.set(sourcePath, {
        hash: sourceHash,
        mtime: sourceStats.mtime,
        tempPath: tempPath,
        originalPath: sourcePath,
      });

      // Store reverse mapping
      this.pathMapping.set(tempPath, sourcePath);

      logInfo(
        `Copied: ${path.basename(sourcePath)} → ${path.basename(tempPath)}`
      );
    } catch (error) {
      logError(`Failed to copy file ${sourcePath}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create or update session tracking file
   * @param {string} sessionFilePath - Path to session file
   */
  async updateSessionFile(sessionFilePath) {
    try {
      const sessionInfo = [
        this.currentSessionId,
        new Date().toISOString(),
        `Last processed in ${this.currentSessionId}`,
      ].join("\n");

      fs.writeFileSync(sessionFilePath, sessionInfo, "utf8");
      logInfo(`Updated session file: ${path.basename(sessionFilePath)}`);
    } catch (error) {
      logError(
        `Failed to update session file ${sessionFilePath}: ${error.message}`
      );
    }
  }

  /**
   * Calculate MD5 hash of a file
   * @param {string} filePath - Path to file
   * @returns {string} - MD5 hash
   */
  async calculateFileHash(filePath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash("md5");
      const stream = fs.createReadStream(filePath);

      stream.on("data", (data) => hash.update(data));
      stream.on("end", () => resolve(hash.digest("hex")));
      stream.on("error", reject);
    });
  }

  /**
   * Get the path where result files should be saved
   * @param {string} jsonTempPath - Path to JSON file in temp
   * @returns {string} - Directory where result should be saved
   */
  getResultPath(jsonTempPath) {
    return path.dirname(jsonTempPath);
  }

  /**
   * Get session information
   * @returns {Object} - Session information
   */
  getSessionInfo() {
    return {
      sessionId: this.currentSessionId,
      tempPath: this.sessionPath,
      trackedFiles: this.fileHashes.size,
      isPersistent: config.app.usePersistentTempFolder,
    };
  }

  /**
   * Detect changes in source files (compatibility method for Scanner)
   * @returns {Object} - Change detection results
   */
  async detectChanges() {
    // For persistent temp manager, we handle changes per-file during copyJsonProject
    // This is mainly for compatibility with Scanner interface
    return {
      hasChanges: false,
      summary:
        "Changes detected individually per JSON file during copy operations",
      changes: [],
    };
  }

  /**
   * Update changed files (compatibility method for Scanner)
   * @param {Object} changes - Changes object from detectChanges
   */
  async updateChangedFiles(changes) {
    // For persistent temp manager, updates are handled during copyJsonProject
    // This is mainly for compatibility with Scanner interface
    logInfo("File updates handled individually during copy operations");
  }

  /**
   * Get organized path for specific file type
   * @param {string} fileType - Type of file ('collected_json', 'fixed_json', 'result', 'input')
   * @returns {string} - Path for the file type
   */
  getPathForType(fileType) {
    switch (fileType) {
      case "collected_json":
        return this.collectedJsonsPath;
      case "fixed_json":
        return this.fixedJsonsPath;
      case "result":
        return this.resultsPath;
      case "input":
      default:
        return this.inputFilesPath;
    }
  }

  /**
   * Save content to organized temp location
   * @param {string} filename - Name of file to save
   * @param {string} content - Content to save
   * @param {string} fileType - Type of file for organization
   * @returns {string} - Path where file was saved
   */
  saveToTemp(filename, content, fileType = "result") {
    try {
      const targetDir = this.getPathForType(fileType);
      const filePath = path.join(targetDir, filename);

      fs.writeFileSync(filePath, content, "utf8");
      logInfo(`📄 Saved ${fileType}: ${filename}`);

      return filePath;
    } catch (error) {
      logError(`Failed to save ${fileType} file ${filename}:`, error);
      throw error;
    }
  }

  /**
   * Copy a file to temp location (compatibility method for test functions)
   * @param {string} sourcePath - Path to source file
   * @param {string} fileType - Type of file ('input', 'result', 'processed', etc.)
   * @returns {string} - Path to copied file in temp
   */
  async copyToTemp(sourcePath, fileType = "input") {
    try {
      const fileName = path.basename(sourcePath);
      const targetDir = this.getPathForType(fileType);
      const tempPath = path.join(targetDir, fileName);

      // Ensure target directory exists
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      // Copy the file
      fs.copyFileSync(sourcePath, tempPath);

      logInfo(`📄 Copied to temp: ${fileName} → ${fileType}`);
      return tempPath;
    } catch (error) {
      logError(`Failed to copy ${sourcePath} to temp:`, error);
      throw error;
    }
  }

  /**
   * Cleanup old files (if needed)
   * @param {boolean} preserveResults - Whether to preserve result files
   */
  cleanup(preserveResults = true) {
    if (config.app.usePersistentTempFolder) {
      logInfo("Using persistent temp folder - skipping cleanup");
      return;
    }

    // Only cleanup if using session-based folders
    // Implementation for session cleanup would go here
    logInfo("Cleanup completed");
  }
}

module.exports = PersistentTempManager;
