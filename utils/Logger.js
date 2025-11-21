// path: utils/Logger.js
/**
 * Enhanced logger utility with timestamps that logs to both console and file.
 * Used for consistent terminal output and debugging across modules.
 */

const chalk = require("chalk");
const fs = require("fs");
const path = require("path");
const config = require("../config");

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, "..", "logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Generate log file path with today's date
const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
const logFilePath = path.join(logsDir, `app-${today}.log`);

// Helper to format timestamp
function timeStamp() {
  return new Date().toISOString().replace("T", " ").split(".")[0];
}

// Write to log file
function writeToFile(level, message) {
  const ts = timeStamp();
  const logEntry = `[${ts}] [${level.toUpperCase()}] ${message}\n`;
  
  try {
    fs.appendFileSync(logFilePath, logEntry, 'utf8');
  } catch (err) {
    // If we can't write to log file, just continue (avoid infinite loop)
    console.error(`Failed to write to log file: ${err.message}`);
  }
}

function log(level, message) {
  const ts = timeStamp();
  if (!shouldLog(level)) return;

  // Always write to file (regardless of log level for debugging)
  writeToFile(level, message);

  // Console output with colors
  const formatted =
    {
      debug: chalk.gray(`[${ts}] [DEBUG] ${message}`),
      info: chalk.cyan(`[${ts}] [INFO] ${message}`),
      warn: chalk.yellow(`[${ts}] [WARN] ${message}`),
      error: chalk.red(`[${ts}] [ERROR] ${message}`),
    }[level] || message;

  console.log(formatted);
}

// Respect log level settings for console output
function shouldLog(level) {
  const order = ["debug", "info", "warn", "error"];
  const minIndex = order.indexOf(config.app.logLevel);
  const msgIndex = order.indexOf(level);
  return msgIndex >= minIndex;
}

// Export enhanced logger with file logging capability
module.exports = {
  debug: (msg) => log("debug", msg),
  logInfo: (msg) => log("info", msg),
  info: (msg) => log("info", msg),
  logWarn: (msg) => log("warn", msg),
  warn: (msg) => log("warn", msg),
  logError: (msg) => log("error", msg),
  error: (msg) => log("error", msg),
  
  // Utility functions for debugging
  getLogFilePath: () => logFilePath,
  getLogsDirectory: () => logsDir,
};
