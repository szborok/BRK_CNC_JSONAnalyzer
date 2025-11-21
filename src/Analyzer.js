// path: src/Analyzer.js
/**
 * The Analyzer is responsible for loading, validating, and fixing JSON files
 * before they are processed by the rule engine.
 * It outputs "fixed" JSON files beside the originals.
 */

const fs = require("fs");
const path = require("path");
const config = require("../config");
const { logInfo, logWarn, logError } = require("../utils/Logger");
const { readFileContent, writeJsonFile } = require("../utils/FileUtils");

class Analyzer {
  constructor() {}

  /**
   * Process the JSON file in a given project.
   * @param {Project} project - The project to analyze.
   */
  analyzeProject(project) {
    logInfo(`Analyzing project "${project.getFullName()}"...`);

    if (!project.jsonFilePath) {
      logWarn(`No JSON file found for project "${project.getFullName()}"`);
      return project;
    }

    const fixedPath = project.getFixedFilePath();
    const fixedData = this.validateAndFixJson(project.jsonFilePath);

    if (fixedData) {
      writeJsonFile(fixedPath, fixedData);
      logInfo(`✓ Fixed JSON saved: ${path.basename(fixedPath)}`);
      project.status = "analyzed";
    } else {
      logWarn(`⚠ Skipped invalid JSON: ${path.basename(project.jsonFilePath)}`);
      project.status = "analysis_failed";
    }

    return project;
  }

  /**
   * Attempts to read and parse a JSON file.
   * If invalid, it tries simple fixes (UTF-8 encoding, trailing commas, etc.)
   * @param {string} jsonPath
   * @returns {object|null}
   */
  validateAndFixJson(jsonPath) {
    try {
      let content = readFileContent(jsonPath);
      if (!content) return null;

      // Use Project's sanitization method first
      const Project = require("./Project");
      content = Project.sanitizeJsonContent(content);

      // Try to parse first
      try {
        return JSON.parse(content);
      } catch (e) {
        logWarn(`Trying to auto-fix invalid JSON: ${path.basename(jsonPath)}`);
      }

      // Basic auto-fixes
      content = content
        .replace(/,\s*([}\]])/g, "$1") // remove trailing commas
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u0019]+/g, ""); // remove control characters

      try {
        return JSON.parse(content);
      } catch (e) {
        logError(
          `Failed to fix JSON: ${path.basename(jsonPath)} (${e.message})`
        );
        return null;
      }
    } catch (err) {
      logError(`Error reading JSON file: ${err.message}`);
      return null;
    }
  }
}

module.exports = Analyzer;