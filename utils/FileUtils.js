const fs = require("fs");
const path = require("path");
const Logger = require("./Logger");

const FileUtils = {
  getDirectories(dirPath) {
    try {
      return fs.readdirSync(dirPath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);
    } catch (err) {
      Logger.error(`Failed to get directories: ${dirPath} -> ${err.message}`);
      return [];
    }
  },

  readFileContent(filePath) {
    try {
      return fs.readFileSync(filePath, "utf-8");
    } catch (err) {
      Logger.error(`Failed to read file: ${filePath} -> ${err.message}`);
      return null;
    }
  },

  writeJsonFile(filePath, data) {
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
      Logger.logInfo(`Saved JSON file: ${filePath}`);
    } catch (err) {
      Logger.error(`Failed to write JSON: ${filePath} -> ${err.message}`);
    }
  },

  ensureDirectory(dirPath) {
    try {
      fs.mkdirSync(dirPath, { recursive: true });
    } catch (err) {
      Logger.error(`Failed to ensure directory: ${dirPath} -> ${err.message}`);
    }
  },

  getJsonFiles(dirPath) {
    try {
      return fs.readdirSync(dirPath)
        .filter(file => file.toLowerCase().endsWith(".json"))
        .map(file => path.join(dirPath, file));
    } catch (err) {
      Logger.error(`Failed to get JSON files: ${dirPath} -> ${err.message}`);
      return [];
    }
  }
};

module.exports = FileUtils;