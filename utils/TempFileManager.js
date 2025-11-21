// utils/TempFileManager.js
/**
 * Manages temporary file operations for JSONScanner
 * Ensures read-only access to original files by working with copies
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const config = require("../config");
const { logInfo, logWarn, logError } = require("./Logger");

class TempFileManager {
  constructor(appName = "JSONScanner", customTempBasePath = null) {
    // Create organized hierarchy: temp/BRK CNC Management Dashboard/AppName/
    // Priority: customTempBasePath > userDefinedWorkingFolder > testProcessedDataPath > system temp
    if (customTempBasePath) {
      this.tempBasePath = customTempBasePath;
    } else if (config.app.userDefinedWorkingFolder) {
      // Dashboard configured working folder
      this.tempBasePath = config.app.userDefinedWorkingFolder;
    } else if (config.app.testMode && config.app.testProcessedDataPath) {
      // Test mode: use BRK_CNC_CORE test-data
      this.tempBasePath = config.app.testProcessedDataPath;
    } else {
      // Fall back to system temp
      this.tempBasePath = path.join(
        os.tmpdir(),
        "BRK CNC Management Dashboard"
      );
    }
    this.appName = appName;
    this.appPath = path.join(this.tempBasePath, "BRK CNC Management Dashboard", this.appName);
    
    // Use persistent folder structure (no sessions) for organized temp folders
    this.usePersistentFolder = config.app.usePersistentTempFolder;
    
    if (this.usePersistentFolder) {
      // Persistent mode: no sessions, direct app folder
      this.sessionId = null;
      this.sessionPath = this.appPath;
    } else {
      // Session mode: create unique session folders
      this.sessionId = this.generateSessionId();
      this.sessionPath = path.join(this.appPath, this.sessionId);
    }

    // Create organized subdirectories for different types of files
    this.collectedJsonsPath = path.join(this.sessionPath, "collected_jsons");
    this.fixedJsonsPath = path.join(this.sessionPath, "fixed_jsons");
    this.resultsPath = path.join(this.sessionPath, "results");
    this.inputFilesPath = path.join(this.sessionPath, "input_files");

    this.fileHashes = new Map(); // Track file hashes for change detection
    this.copyQueue = new Map(); // Track copy operations
    this.pathMapping = new Map(); // Map temp paths back to original paths

    this.ensureSessionDirectory();
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
   * Ensure session directory exists with organized structure
   */
  ensureSessionDirectory() {
    try {
      // Create main temp base directory (may be system temp or configured working folder)
      if (!fs.existsSync(this.tempBasePath)) {
        fs.mkdirSync(this.tempBasePath, { recursive: true });
        logInfo(`Created temp base directory: ${this.tempBasePath}`);
      }

      // Create app-specific directory
      if (!fs.existsSync(this.appPath)) {
        fs.mkdirSync(this.appPath, { recursive: true });
        logInfo(`Created ${this.appName} app directory: ${this.appPath}`);
      }

      // Create session directory only in session mode
      if (!this.usePersistentFolder && !fs.existsSync(this.sessionPath)) {
        fs.mkdirSync(this.sessionPath, { recursive: true });
        logInfo(`Created session directory: ${this.sessionPath}`);
      }

      // Create organized subdirectories
      const subdirs = [
        { path: this.collectedJsonsPath, name: "collected_jsons" },
        { path: this.fixedJsonsPath, name: "fixed_jsons" },
        { path: this.resultsPath, name: "results" },
        { path: this.inputFilesPath, name: "input_files" },
      ];

      for (const subdir of subdirs) {
        if (!fs.existsSync(subdir.path)) {
          fs.mkdirSync(subdir.path, { recursive: true });
          logInfo(`Created ${subdir.name} directory: ${subdir.path}`);
        }
      }
    } catch (error) {
      logError("Failed to create temp directories:", error);
      throw error;
    }
  }

  /**
   * Copy a file or directory structure to temp location
   * @param {string} sourcePath - Original file/directory path
   * @param {string} fileType - Type of file: 'input', 'collected_json', 'fixed_json', 'result'
   * @param {boolean} preserveStructure - Whether to preserve directory structure
   * @returns {string} - Path to temporary copy
   */
  async copyToTemp(sourcePath, fileType = "input", preserveStructure = true) {
    try {
      const sourceStats = fs.statSync(sourcePath);

      // Determine target directory based on file type
      let targetBasePath;
      switch (fileType) {
        case "collected_json":
          targetBasePath = this.collectedJsonsPath;
          break;
        case "fixed_json":
          targetBasePath = this.fixedJsonsPath;
          break;
        case "result":
          targetBasePath = this.resultsPath;
          break;
        case "input":
        default:
          targetBasePath = this.inputFilesPath;
          break;
      }

      const relativePath = this.getRelativePath(sourcePath);
      const tempPath = path.join(targetBasePath, relativePath);

      if (sourceStats.isDirectory()) {
        return await this.copyDirectoryToTemp(sourcePath, tempPath);
      } else {
        return await this.copyFileToTemp(sourcePath, tempPath);
      }
    } catch (error) {
      logError(`Failed to copy ${sourcePath} to temp:`, error);
      throw error;
    }
  }

  /**
   * Copy a single file to temp location
   */
  async copyFileToTemp(sourcePath, tempPath) {
    try {
      // Ensure parent directory exists
      const tempDir = path.dirname(tempPath);
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

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

      logInfo(`Copied file: ${sourcePath} → ${tempPath}`);
      return tempPath;
    } catch (error) {
      logError(`Failed to copy file ${sourcePath}:`, error);
      throw error;
    }
  }

  /**
   * Copy directory structure to temp location
   */
  async copyDirectoryToTemp(sourcePath, tempPath) {
    try {
      if (!fs.existsSync(tempPath)) {
        fs.mkdirSync(tempPath, { recursive: true });
      }

      const items = fs.readdirSync(sourcePath);
      const copiedPaths = [tempPath];

      for (const item of items) {
        const sourceItem = path.join(sourcePath, item);
        const tempItem = path.join(tempPath, item);
        const itemStats = fs.statSync(sourceItem);

        if (itemStats.isDirectory()) {
          const subPaths = await this.copyDirectoryToTemp(sourceItem, tempItem);
          copiedPaths.push(...subPaths);
        } else {
          await this.copyFileToTemp(sourceItem, tempItem);
          copiedPaths.push(tempItem);
        }
      }

      logInfo(`Copied directory: ${sourcePath} → ${tempPath}`);
      return copiedPaths;
    } catch (error) {
      logError(`Failed to copy directory ${sourcePath}:`, error);
      throw error;
    }
  }

  /**
   * Check if any source files have changed since copying
   * @param {string[]} sourcePaths - Array of original file paths to check
   * @returns {Object} - Change detection results
   */
  async detectChanges(sourcePaths = null) {
    const changes = {
      hasChanges: false,
      changedFiles: [],
      newFiles: [],
      deletedFiles: [],
      summary: "",
    };

    try {
      const pathsToCheck = sourcePaths || Array.from(this.fileHashes.keys());

      for (const sourcePath of pathsToCheck) {
        if (!fs.existsSync(sourcePath)) {
          // File was deleted
          changes.deletedFiles.push(sourcePath);
          changes.hasChanges = true;
          continue;
        }

        const storedInfo = this.fileHashes.get(sourcePath);
        if (!storedInfo) {
          // New file
          changes.newFiles.push(sourcePath);
          changes.hasChanges = true;
          continue;
        }

        const currentStats = fs.statSync(sourcePath);

        // Quick check: modification time
        if (currentStats.mtime.getTime() !== storedInfo.mtime.getTime()) {
          // File might have changed, verify with hash
          const currentHash = await this.calculateFileHash(sourcePath);

          if (currentHash !== storedInfo.hash) {
            changes.changedFiles.push({
              path: sourcePath,
              oldHash: storedInfo.hash,
              newHash: currentHash,
              oldMtime: storedInfo.mtime,
              newMtime: currentStats.mtime,
            });
            changes.hasChanges = true;
          }
        }
      }

      // Generate summary
      const total =
        changes.changedFiles.length +
        changes.newFiles.length +
        changes.deletedFiles.length;
      if (total > 0) {
        changes.summary = `${total} changes detected: ${changes.changedFiles.length} modified, ${changes.newFiles.length} new, ${changes.deletedFiles.length} deleted`;
      } else {
        changes.summary = "No changes detected";
      }

      logInfo(`Change detection: ${changes.summary}`);
      return changes;
    } catch (error) {
      logError("Failed to detect changes:", error);
      throw error;
    }
  }

  /**
   * Update temp copies for changed files
   * @param {Object} changes - Results from detectChanges()
   * @returns {string[]} - Paths of updated temp files
   */
  async updateChangedFiles(changes) {
    const updatedPaths = [];

    try {
      // Update changed files
      for (const changeInfo of changes.changedFiles) {
        const tempPath = await this.copyToTemp(changeInfo.path);
        updatedPaths.push(tempPath);
        logInfo(`Updated temp copy: ${changeInfo.path}`);
      }

      // Copy new files
      for (const newPath of changes.newFiles) {
        const tempPath = await this.copyToTemp(newPath);
        updatedPaths.push(tempPath);
        logInfo(`Copied new file: ${newPath}`);
      }

      return updatedPaths;
    } catch (error) {
      logError("Failed to update changed files:", error);
      throw error;
    }
  }

  /**
   * Calculate MD5 hash of a file for change detection
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
   * Get relative path for organizing temp files
   * Uses hash-based approach for very long paths
   */
  getRelativePath(absolutePath) {
    // Create a safe relative path by replacing path separators
    const safePath = absolutePath
      .replace(/:/g, "_COLON_")
      .replace(/\\/g, "_BACKSLASH_")
      .replace(/\//g, "_SLASH_");

    // Check if the resulting safe path would be too long
    const maxLength = 180; // Safe length for most file systems

    if (safePath.length > maxLength) {
      const crypto = require("crypto");
      const hash = crypto.createHash("md5").update(absolutePath).digest("hex");
      const fileName = path.basename(absolutePath);
      const dirName = path.basename(path.dirname(absolutePath));

      // Create a meaningful but short name: hash_directory_filename
      return `${hash.substring(0, 8)}_${dirName}_${fileName}`;
    }

    return safePath;
  }

  /**
   * Get original path from temp path
   */
  getOriginalPath(tempPath) {
    // First check direct mapping
    if (this.pathMapping.has(tempPath)) {
      return this.pathMapping.get(tempPath);
    }

    // Fallback to search in fileHashes
    for (const [originalPath, info] of this.fileHashes) {
      if (info.tempPath === tempPath) {
        return originalPath;
      }
    }
    return null;
  }

  /**
   * Get temp path for original file
   */
  getTempPath(originalPath) {
    const info = this.fileHashes.get(originalPath);
    return info ? info.tempPath : null;
  }

  /**
   * Clean up temporary files for this session
   * @param {boolean} preserveResults - Whether to preserve result files
   */
  cleanup(preserveResults = false) {
    try {
      if (fs.existsSync(this.sessionPath)) {
        if (preserveResults) {
          // Archive results before cleanup
          this.archiveResults();
        }

        this.removeDirectory(this.sessionPath);
        logInfo(`Cleaned up session directory: ${this.sessionPath}`);
      }

      this.fileHashes.clear();
      this.copyQueue.clear();
      this.pathMapping.clear();
    } catch (error) {
      logWarn(`Failed to cleanup temp directory: ${error.message}`);
    }
  }
  /**
   * Remove directory recursively
   */
  removeDirectory(dirPath) {
    if (fs.existsSync(dirPath)) {
      const items = fs.readdirSync(dirPath);

      for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const stats = fs.statSync(itemPath);

        if (stats.isDirectory()) {
          this.removeDirectory(itemPath);
        } else {
          fs.unlinkSync(itemPath);
        }
      }

      fs.rmdirSync(dirPath);
    }
  }

  /**
   * Archive results to a permanent location before cleanup
   */
  archiveResults() {
    try {
      if (!fs.existsSync(this.resultsPath)) {
        logInfo("No results to archive");
        return;
      }

      // Create archive directory in app path
      const archiveDir = path.join(this.appPath, "archived_results");
      if (!fs.existsSync(archiveDir)) {
        fs.mkdirSync(archiveDir, { recursive: true });
      }

      // Create timestamped archive folder
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const sessionArchiveDir = path.join(
        archiveDir,
        `${this.sessionId}_${timestamp}`
      );
      fs.mkdirSync(sessionArchiveDir, { recursive: true });

      // Copy all results to archive
      const resultFiles = fs.readdirSync(this.resultsPath);
      for (const file of resultFiles) {
        const sourcePath = path.join(this.resultsPath, file);
        const targetPath = path.join(sessionArchiveDir, file);
        fs.copyFileSync(sourcePath, targetPath);
      }

      logInfo(
        `Archived ${resultFiles.length} result file(s) to: ${sessionArchiveDir}`
      );
    } catch (error) {
      logWarn(`Failed to archive results: ${error.message}`);
    }
  }

  /**
   * Get path for specific file type
   * @param {string} fileType - Type: 'collected_json', 'fixed_json', 'result', 'input'
   * @returns {string} - Directory path for the file type
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
   * Get all result files from current session
   */
  getResultFiles() {
    if (!fs.existsSync(this.resultsPath)) {
      return [];
    }

    try {
      const files = fs.readdirSync(this.resultsPath);
      return files.map((file) => ({
        filename: file,
        path: path.join(this.resultsPath, file),
        size: fs.statSync(path.join(this.resultsPath, file)).size,
        created: fs.statSync(path.join(this.resultsPath, file)).birthtime,
      }));
    } catch (error) {
      logError(`Failed to get result files: ${error.message}`);
      return [];
    }
  }

  /**
   * Copy result files to a specific destination
   * @param {string} destinationDir - Where to copy the results
   */
  exportResults(destinationDir) {
    try {
      const resultFiles = this.getResultFiles();

      if (resultFiles.length === 0) {
        logWarn("No result files to export");
        return false;
      }

      // Ensure destination exists
      if (!fs.existsSync(destinationDir)) {
        fs.mkdirSync(destinationDir, { recursive: true });
      }

      // Copy each result file
      let copiedCount = 0;
      for (const result of resultFiles) {
        const destPath = path.join(destinationDir, result.filename);
        fs.copyFileSync(result.path, destPath);
        copiedCount++;
      }

      logInfo(`Exported ${copiedCount} result file(s) to: ${destinationDir}`);
      return true;
    } catch (error) {
      logError(`Failed to export results: ${error.message}`);
      return false;
    }
  }

  /**
   * Get session information
   */
  getSessionInfo() {
    const resultFiles = this.getResultFiles();

    return {
      sessionId: this.sessionId,
      sessionPath: this.sessionPath,
      tempBasePath: this.tempBasePath,
      appName: this.appName,
      appPath: this.appPath,
      trackedFiles: this.fileHashes.size,
      trackedPaths: Array.from(this.fileHashes.keys()),
      resultFiles: resultFiles.length,
      organizationPaths: {
        collectedJsons: this.collectedJsonsPath,
        fixedJsons: this.fixedJsonsPath,
        results: this.resultsPath,
        inputFiles: this.inputFilesPath,
      },
    };
  }

  /**
   * Get the base path for temp operations
   * Returns the root temp path (BRK CNC Management Dashboard parent)
   */
  getBasePath() {
    return path.join(this.tempBasePath, "BRK CNC Management Dashboard");
  }

  /**
   * Clean up old temp sessions (older than 24 hours)
   */
  static cleanupOldSessions(appName = null) {
    try {
      const tempBasePath = path.join(
        os.tmpdir(),
        "BRK CNC Management Dashboard"
      );

      if (!fs.existsSync(tempBasePath)) {
        return;
      }

      // If appName specified, clean only that app's sessions
      const appsToClean = appName ? [appName] : fs.readdirSync(tempBasePath);

      for (const app of appsToClean) {
        const appPath = path.join(tempBasePath, app);

        if (!fs.existsSync(appPath) || !fs.statSync(appPath).isDirectory()) {
          continue;
        }

        const sessions = fs
          .readdirSync(appPath)
          .filter(
            (item) =>
              item.startsWith("session_") &&
              fs.statSync(path.join(appPath, item)).isDirectory()
          );

        const now = Date.now();
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours

        for (const session of sessions) {
          const sessionPath = path.join(appPath, session);
          const stats = fs.statSync(sessionPath);

          if (now - stats.mtime.getTime() > maxAge) {
            const manager = new TempFileManager(app);
            manager.removeDirectory(sessionPath);
            logInfo(`Cleaned up old session: ${app}/${session}`);
          }
        }
      }
    } catch (error) {
      logWarn(`Failed to cleanup old sessions: ${error.message}`);
    }
  }
}

module.exports = TempFileManager;
