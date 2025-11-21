// utils/CleanupService.js
/**
 * Service for cleaning up generated files (BRK_fixed.json and BRK_result.json)
 */

const fs = require('fs');
const path = require('path');
const config = require('../config');
const { logInfo, logWarn, logError } = require('./Logger');

class CleanupService {
  constructor() {
    this.deletedCount = 0;
    this.errorCount = 0;
  }

  /**
   * Clean up all generated files from both auto and manual test paths
   */
  async cleanupGeneratedFiles() {
    logInfo('🔍 Scanning for generated files to clean up...');
    
    // Clean both auto and manual test paths
    const pathsToClean = [
      config.paths.test.testDataPathAuto,
      config.paths.test.testDataPathManual
    ];

    for (const scanPath of pathsToClean) {
      if (fs.existsSync(scanPath)) {
        logInfo(`📂 Cleaning path: ${scanPath}`);
        await this.cleanupPath(scanPath);
      } else {
        logWarn(`⚠️  Path does not exist: ${scanPath}`);
      }
    }

    // Summary
    logInfo(`\n📊 Cleanup Summary:`);
    logInfo(`  ✅ Files deleted: ${this.deletedCount}`);
    if (this.errorCount > 0) {
      logWarn(`  ❌ Errors encountered: ${this.errorCount}`);
    }
    
    if (this.deletedCount === 0 && this.errorCount === 0) {
      logInfo(`  🎉 No generated files found - directories are already clean!`);
    }
  }

  /**
   * Recursively clean generated files from a specific path
   * @param {string} dirPath - Directory path to clean
   */
  async cleanupPath(dirPath) {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          // Recursively clean subdirectories
          await this.cleanupPath(fullPath);
        } else if (entry.isFile()) {
          // Check if this is a generated file
          if (this.isGeneratedFile(entry.name)) {
            try {
              fs.unlinkSync(fullPath);
              this.deletedCount++;
              logInfo(`🗑️  Deleted: ${path.relative(process.cwd(), fullPath)}`);
            } catch (err) {
              this.errorCount++;
              logError(`❌ Failed to delete ${fullPath}: ${err.message}`);
            }
          }
        }
      }
    } catch (err) {
      this.errorCount++;
      logError(`❌ Error reading directory ${dirPath}: ${err.message}`);
    }
  }

  /**
   * Check if a filename is a generated file that should be cleaned
   * @param {string} filename - Name of the file to check
   * @returns {boolean} - True if file should be deleted
   */
  isGeneratedFile(filename) {
    // Check for BRK_fixed.json and BRK_result.json files
    return filename.includes('BRK_fixed.json') || 
           filename.includes('BRK_result.json') ||
           filename.endsWith('_BRK_fixed.json') ||
           filename.endsWith('_BRK_result.json');
  }

  /**
   * Clean up generated files for a specific project
   * @param {string} projectPath - Path to specific project directory
   */
  async cleanupProject(projectPath) {
    logInfo(`🧹 Cleaning project: ${projectPath}`);
    
    if (!fs.existsSync(projectPath)) {
      logWarn(`⚠️  Project path does not exist: ${projectPath}`);
      return;
    }

    const initialCount = this.deletedCount;
    await this.cleanupPath(projectPath);
    const deletedInProject = this.deletedCount - initialCount;
    
    logInfo(`✅ Cleaned ${deletedInProject} file(s) from project`);
  }

  /**
   * Interactive cleanup with confirmation
   */
  async interactiveCleanup() {
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      logInfo('\n🧹 Interactive Cleanup Mode');
      logInfo('This will delete all BRK_fixed.json and BRK_result.json files.');
      logInfo('Paths to be cleaned:');
      logInfo(`  - ${config.paths.test.testDataPathAuto}`);
      logInfo(`  - ${config.paths.test.testDataPathManual}`);
      
      rl.question('\nAre you sure you want to proceed? (y/N): ', async (answer) => {
        rl.close();
        
        if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
          await this.cleanupGeneratedFiles();
        } else {
          logInfo('❌ Cleanup cancelled by user');
        }
        
        resolve();
      });
    });
  }

  /**
   * Get statistics about generated files without deleting them
   */
  async getCleanupStats() {
    logInfo('📊 Scanning for generated files statistics...');
    
    const stats = {
      totalFiles: 0,
      autoPathFiles: 0,
      manualPathFiles: 0,
      paths: []
    };

    const pathsToCheck = [
      { path: config.paths.test.testDataPathAuto, name: 'Auto Path' },
      { path: config.paths.test.testDataPathManual, name: 'Manual Path' }
    ];

    for (const { path: scanPath, name } of pathsToCheck) {
      if (fs.existsSync(scanPath)) {
        const count = await this.countGeneratedFiles(scanPath);
        stats.totalFiles += count;
        if (name === 'Auto Path') stats.autoPathFiles = count;
        if (name === 'Manual Path') stats.manualPathFiles = count;
        stats.paths.push({ name, path: scanPath, count });
        logInfo(`  ${name}: ${count} generated file(s)`);
      }
    }

    logInfo(`\n📈 Total generated files found: ${stats.totalFiles}`);
    return stats;
  }

  /**
   * Count generated files in a directory
   * @param {string} dirPath - Directory to count files in
   * @returns {number} - Number of generated files found
   */
  async countGeneratedFiles(dirPath) {
    let count = 0;
    
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          count += await this.countGeneratedFiles(fullPath);
        } else if (entry.isFile() && this.isGeneratedFile(entry.name)) {
          count++;
        }
      }
    } catch (err) {
      logError(`Error counting files in ${dirPath}: ${err.message}`);
    }

    return count;
  }
}

module.exports = CleanupService;