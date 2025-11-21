// utils/ProgressTracker.js
/**
 * Simple progress tracker for long-running operations
 * Provides periodic status updates to prevent apparent freezing
 */

const { logInfo } = require("./Logger");
const config = require("../config");

class ProgressTracker {
  constructor(operationName, totalItems = 0) {
    this.operationName = operationName;
    this.totalItems = totalItems;
    this.processedItems = 0;
    this.startTime = Date.now();
    this.lastReportTime = Date.now();
    this.reportInterval = config.app.progressReportInterval || 10;
    this.enabled = config.app.enableProgressReporting !== false;
  }

  /**
   * Update progress and optionally report status
   * @param {string} itemName - Name of current item being processed
   * @param {boolean} force - Force a progress report
   */
  update(itemName = "", force = false) {
    this.processedItems++;

    if (!this.enabled) return;

    const shouldReport =
      force ||
      this.processedItems % this.reportInterval === 0 ||
      this.processedItems === this.totalItems;

    if (shouldReport) {
      this.report(itemName);
    }
  }

  /**
   * Report current progress
   * @param {string} currentItem - Current item being processed
   */
  report(currentItem = "") {
    if (!this.enabled) return;

    const elapsed = Date.now() - this.startTime;
    const elapsedSec = Math.round(elapsed / 1000);

    let progressMsg = `🔄 ${this.operationName}: ${this.processedItems}`;

    if (this.totalItems > 0) {
      const percentage = Math.round(
        (this.processedItems / this.totalItems) * 100
      );
      progressMsg += `/${this.totalItems} (${percentage}%)`;
    }

    progressMsg += ` processed in ${elapsedSec}s`;

    if (currentItem) {
      progressMsg += ` - Current: ${currentItem}`;
    }

    logInfo(progressMsg);
  }

  /**
   * Report completion
   */
  complete() {
    if (!this.enabled) return;

    const elapsed = Date.now() - this.startTime;
    const elapsedSec = Math.round(elapsed / 1000);

    logInfo(
      `✅ ${this.operationName}: Completed ${this.processedItems} items in ${elapsedSec}s`
    );
  }

  /**
   * Report if operation is taking longer than expected
   * @param {number} timeoutMs - Timeout threshold in milliseconds
   */
  checkTimeout(timeoutMs = null) {
    if (!this.enabled) return;

    const timeout = timeoutMs || config.app.operationTimeoutWarning || 5000;
    const elapsed = Date.now() - this.lastReportTime;

    if (elapsed > timeout) {
      logInfo(
        `⏳ ${this.operationName}: Still processing... (${Math.round(
          elapsed / 1000
        )}s since last update)`
      );
      this.lastReportTime = Date.now();
    }
  }
}

module.exports = ProgressTracker;
