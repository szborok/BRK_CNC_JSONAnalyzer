// path: utils/ModeManager.js
/**
 * ModeManager - controls system run mode (autorun/manual)
 *
 * Autorun mode continuously scans and processes projects.
 * Manual mode allows user-triggered JSON updates or single project operations.
 *
 * Rules:
 *  - If a manual task is requested while autorun is active:
 *      -> Finish current project, stop autorun temporarily, run manual task, then resume autorun.
 */

const Logger = require("./Logger");

class ModeManager {
  constructor() {
    this.mode = "autorun"; // default
    this.isBusy = false; // true while processing a project
    this.manualQueue = []; // pending manual tasks (each a function or project descriptor)
  }

  /**
   * Returns current mode: "autorun" or "manual"
   */
  getMode() {
    return this.mode;
  }

  /**
   * Enables autorun mode.
   */
  enableAutorun() {
    if (this.mode !== "autorun") {
      Logger.info("✅ Switching to AUTORUN mode");
      this.mode = "autorun";
    }
  }

  /**
   * Enables manual mode.
   * If currently autorunning, we enqueue a stop signal.
   */
  enableManual(manualTask = null) {
    if (manualTask) {
      Logger.info(
        "📥 Manual task requested, waiting for current autorun to finish..."
      );
      this.manualQueue.push(manualTask);
    }

    if (this.mode === "autorun") {
      Logger.info(
        "⏳ Autorun will pause after the current project finishes..."
      );
      this.mode = "switching"; // temporary intermediate state
    } else if (this.mode !== "manual") {
      this.mode = "manual";
      Logger.info("🧰 Manual mode enabled");
    }
  }

  /**
   * Called when autorun completes the current project.
   * This checks if manual mode was requested.
   */
  async onAutorunComplete() {
    if (this.mode === "switching") {
      Logger.info(
        "🔁 Autorun finished current project, switching to manual mode..."
      );
      this.mode = "manual";
      await this.executeManualQueue();
      Logger.info("✅ Manual tasks finished, returning to AUTORUN mode");
      this.mode = "autorun";
    }
  }

  /**
   * Execute all queued manual tasks sequentially.
   */
  async executeManualQueue() {
    while (this.manualQueue.length > 0) {
      const task = this.manualQueue.shift();
      try {
        this.isBusy = true;
        await task();
      } catch (err) {
        Logger.error(`Manual task failed: ${err.message}`);
      } finally {
        this.isBusy = false;
      }
    }
  }

  /**
   * Sets internal busy state.
   */
  setBusy(state) {
    this.isBusy = state;
  }

  /**
   * Returns true if system is currently working.
   */
  isRunning() {
    return this.isBusy;
  }
}

module.exports = new ModeManager();
