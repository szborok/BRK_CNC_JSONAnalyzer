// path: utils/PathUtils.js
/**
 * Utility functions for handling project-related paths and filenames.
 * Recognizes project patterns (WxxxxLLxx...), position folders, and machine directories.
 */

const fs = require("fs");
const path = require("path");
const Logger = require("./Logger");

// Regex for valid project folder names (e.g. W5270NS01003)
const PROJECT_REGEX = /^W\d{4}[A-Z]{2}\d{2,}$/;
// Regex for valid position folder names (e.g. W5270NS01003A)
const POSITION_REGEX = /^W\d{4}[A-Z]{2}\d{2,}[A-Z]+$/;

/**
 * Checks if a given folder name matches project naming rules.
 */
function isProjectFolder(name) {
  return PROJECT_REGEX.test(name);
}

/**
 * Checks if a given folder name matches position naming rules.
 */
function isPositionFolder(name) {
  return POSITION_REGEX.test(name);
}

/**
 * Normalizes and resolves a path safely.
 */
function normalizePath(p) {
  return path.resolve(p).replace(/\\/g, "/");
}

/**
 * Returns a list of subdirectories inside a given folder.
 */
function listSubfolders(dirPath) {
  try {
    return fs
      .readdirSync(dirPath, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => path.join(dirPath, dirent.name));
  } catch (err) {
    Logger.error(`Failed to list subfolders: ${dirPath} -> ${err.message}`);
    return [];
  }
}

/**
 * Returns a list of JSON files inside a given folder.
 */
function listJSONFiles(dirPath) {
  try {
    return fs
      .readdirSync(dirPath)
      .filter((file) => file.toLowerCase().endsWith(".json"))
      .map((file) => path.join(dirPath, file));
  } catch (err) {
    Logger.error(`Failed to list JSON files: ${dirPath} -> ${err.message}`);
    return [];
  }
}

/**
 * Finds all NC files in a given machine folder (extensions like .nc, .mpf).
 */
function listNCFiles(dirPath) {
  try {
    return fs
      .readdirSync(dirPath)
      .filter(
        (file) =>
          file.toLowerCase().endsWith(".nc") ||
          file.toLowerCase().endsWith(".mpf")
      )
      .map((file) => path.join(dirPath, file));
  } catch (err) {
    Logger.error(`Failed to list NC files: ${dirPath} -> ${err.message}`);
    return [];
  }
}

module.exports = {
  isProjectFolder,
  isPositionFolder,
  normalizePath,
  listSubfolders,
  listJSONFiles,
  listNCFiles,
};
