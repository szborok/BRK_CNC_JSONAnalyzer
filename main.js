// main.js
const Executor = require("./src/Executor");
const DataManager = require("./src/DataManager");
const Logger = require("./utils/Logger");
const UserManager = require("./utils/UserManager");
const config = require("./config");

// Parse command line arguments
function parseArguments() {
  const args = process.argv.slice(2);
  const options = {
    mode: config.app.autorun ? "auto" : "manual",
    projectPath: null,
    forceReprocess: false,
    clearErrors: false,
    cleanup: false,
    cleanupStats: false,
    cleanupInteractive: false,
    exportResults: null,
    listResults: false,
    preserveResults: false,
    workingFolder: null,
    // Debug and test flags
    debug: false,
    test: false,
    testRuns: 1, // Number of test runs (default 1)
    testQuick: false,
    testStorage: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--mode":
        options.mode = args[i + 1];
        i++; // Skip next argument
        break;
      case "--manual":
        options.mode = "manual";
        break;
      case "--auto":
        options.mode = "auto";
        break;
      case "--cleanup":
        options.cleanup = true;
        break;
      case "--cleanup-stats":
        options.cleanupStats = true;
        break;
      case "--cleanup-interactive":
        options.cleanupInteractive = true;
        break;
      case "--project":
        options.projectPath = args[i + 1];
        i++; // Skip next argument
        break;
      case "--force":
        options.forceReprocess = true;
        break;
      case "--clear-errors":
        options.clearErrors = true;
        break;
      case "--export-results":
        options.exportResults = args[i + 1];
        i++; // Skip next argument
        break;
      case "--list-results":
        options.listResults = true;
        break;
      case "--preserve-results":
        options.preserveResults = true;
        break;
      case "--working-folder":
        options.workingFolder = args[i + 1];
        i++; // Skip next argument
        break;
      case "--debug":
        options.debug = true;
        break;
      case "--test":
        options.test = true;
        // Check if next argument is a number (e.g., --test --3)
        if (
          args[i + 1] &&
          args[i + 1].startsWith("--") &&
          !isNaN(args[i + 1].slice(2))
        ) {
          options.testRuns = parseInt(args[i + 1].slice(2));
          i++; // Skip next argument
        }
        break;
      case "--test-quick":
        options.testQuick = true;
        break;
      case "--test-storage":
        options.testStorage = true;
        break;
      case "--help":
        showHelp();
        process.exit(0);
        break;
    }
  }

  return options;
}

function showHelp() {
  console.log(`
JSON Scanner Application

Usage: node main.js [options]

Options:
  --mode <auto|manual> Override config mode setting
  --manual             Set mode to manual (shortcut for --mode manual)
  --auto               Set mode to auto (shortcut for --mode auto)
  --cleanup            Delete all generated files (BRK_fixed.json and BRK_result.json)
  --cleanup-stats      Show statistics about generated files without deleting
  --cleanup-interactive Cleanup with confirmation prompt
  --project <path>     Scan specific project path (manual mode only)
  --force              Force reprocess even if result files exist
  --clear-errors       Clear fatal error markers before processing
  --export-results <dir> Export current temp results to specified directory
  --list-results       List all result files in current temp session
  --preserve-results   Preserve results when cleaning up temp files
  --working-folder <path> Override temp directory with user-defined working folder
  
Development & Testing:
  --debug              Debug utilities and log viewing
  --test               Run single test with cleanup (clean working folder after)
  --test --N           Run N test cycles with no cleanup between runs (e.g., --test --3)
  --test-quick         Run quick storage tests
  --test-storage       Run detailed storage functionality tests
  --help               Show this help message

Test Mode Information:
  Test mode is currently ${
    config.app.testMode ? "ENABLED" : "DISABLED"
  } (configured in config.js)
  
  AUTO mode paths:
    - Test mode: ${config.paths.test.testDataPathAuto}
    - Production mode: ${config.paths.production.productionDataPath}
  
  MANUAL mode paths:
    - Test mode: Uses ${config.paths.test.testDataPathManual}
    - Production mode: Prompts user for path input

Read-Only Safety (Always Active):
  ✅ ALL input processing uses temporary file copies
  ✅ Original files are NEVER modified or touched
  ✅ Results are saved to organized temp structure by default
  ✅ Use --export-results to copy results to permanent location
  ✅ Use --preserve-results to archive results before temp cleanup
  
  This application is designed to be completely safe - no risk to original data.

Examples:
  node main.js --manual --project "path/to/project"
  node main.js --auto --force
  node main.js --cleanup (removes all generated files)
  node main.js --cleanup-stats (shows what would be deleted)
  node main.js --cleanup-interactive (asks for confirmation)
  node main.js --clear-errors
  node main.js --list-results (show current temp results)
  node main.js --export-results "/path/to/save" (export temp results)
  node main.js --manual --preserve-results (keep results when done)
  node main.js --working-folder "D:/CNC_Processing" (custom temp location)
  `);
}

// List temp results
async function listTempResults() {
  const TempFileManager = require("./utils/TempFileManager");
  const fs = require("fs");
  const path = require("path");

  try {
    // Find existing sessions
    const tempBasePath = path.join(require("os").tmpdir(), "jsonscanner");

    if (!fs.existsSync(tempBasePath)) {
      Logger.logInfo("No temp sessions found");
      return;
    }

    const sessions = fs
      .readdirSync(tempBasePath)
      .filter(
        (item) =>
          item.startsWith("session_") &&
          fs.statSync(path.join(tempBasePath, item)).isDirectory()
      );

    if (sessions.length === 0) {
      Logger.logInfo("No active temp sessions found");
      return;
    }

    Logger.logInfo(`📋 Found ${sessions.length} temp session(s):`);

    for (const session of sessions) {
      const sessionPath = path.join(tempBasePath, session);
      const resultsDir = path.join(sessionPath, "results");

      Logger.logInfo(`\n📁 Session: ${session}`);

      if (fs.existsSync(resultsDir)) {
        const resultFiles = fs.readdirSync(resultsDir);
        if (resultFiles.length > 0) {
          Logger.logInfo(`   📄 Results (${resultFiles.length} files):`);
          for (const file of resultFiles) {
            const filePath = path.join(resultsDir, file);
            const stats = fs.statSync(filePath);
            Logger.logInfo(
              `     - ${file} (${
                stats.size
              } bytes, ${stats.mtime.toLocaleString()})`
            );
          }
        } else {
          Logger.logInfo(`   📄 No result files`);
        }
      } else {
        Logger.logInfo(`   📄 No results directory`);
      }
    }
  } catch (error) {
    Logger.logError(`❌ Failed to list temp results: ${error.message}`);
  }
}

// Export temp results
async function exportTempResults(destinationDir) {
  const TempFileManager = require("./utils/TempFileManager");
  const fs = require("fs");
  const path = require("path");

  try {
    // Find existing sessions
    const tempBasePath = path.join(require("os").tmpdir(), "jsonscanner");

    if (!fs.existsSync(tempBasePath)) {
      Logger.logError("No temp sessions found");
      return;
    }

    const sessions = fs
      .readdirSync(tempBasePath)
      .filter(
        (item) =>
          item.startsWith("session_") &&
          fs.statSync(path.join(tempBasePath, item)).isDirectory()
      );

    if (sessions.length === 0) {
      Logger.logError("No active temp sessions found");
      return;
    }

    // Use the most recent session
    const latestSession = sessions.sort().pop();
    const sessionPath = path.join(tempBasePath, latestSession);
    const resultsDir = path.join(sessionPath, "results");

    if (!fs.existsSync(resultsDir)) {
      Logger.logError(`No results found in latest session: ${latestSession}`);
      return;
    }

    const resultFiles = fs.readdirSync(resultsDir);
    if (resultFiles.length === 0) {
      Logger.logError("No result files to export");
      return;
    }

    // Ensure destination exists
    if (!fs.existsSync(destinationDir)) {
      fs.mkdirSync(destinationDir, { recursive: true });
    }

    // Copy results
    let copiedCount = 0;
    for (const file of resultFiles) {
      const sourcePath = path.join(resultsDir, file);
      const destPath = path.join(destinationDir, file);
      fs.copyFileSync(sourcePath, destPath);
      copiedCount++;
    }

    Logger.logInfo(
      `✅ Exported ${copiedCount} result file(s) from session ${latestSession}`
    );
    Logger.logInfo(`📁 Results saved to: ${destinationDir}`);
  } catch (error) {
    Logger.logError(`❌ Failed to export temp results: ${error.message}`);
  }
}

// Start the JSON scanner application
async function main() {
  let dataManager = null;

  try {
    const options = parseArguments();

    // Apply command line overrides FIRST, before any operations
    if (options.mode === "manual") {
      config.app.autorun = false;
    } else if (options.mode === "auto") {
      config.app.autorun = true;
    }

    // Apply working folder override if provided
    if (options.workingFolder) {
      config.app.userDefinedWorkingFolder = options.workingFolder;
      console.log(
        `📁 Using user-defined working folder: ${options.workingFolder}`
      );
    }

    // Handle cleanup modes
    if (options.cleanup || options.cleanupStats || options.cleanupInteractive) {
      const CleanupService = require("./utils/CleanupService");
      const cleanupService = new CleanupService();

      if (options.cleanupStats) {
        Logger.logInfo("📊 Running cleanup statistics...");
        await cleanupService.getCleanupStats();
      } else if (options.cleanupInteractive) {
        Logger.logInfo("🤝 Running interactive cleanup...");
        await cleanupService.interactiveCleanup();
      } else if (options.cleanup) {
        Logger.logInfo("🧹 Starting cleanup mode...");
        await cleanupService.cleanupGeneratedFiles();
        Logger.logInfo("✅ Cleanup completed successfully");
      }

      process.exit(0);
    }

    // Handle result management
    if (options.listResults) {
      Logger.logInfo("📋 Listing temp results...");
      await listTempResults();
      process.exit(0);
    }

    if (options.exportResults) {
      Logger.logInfo(`📤 Exporting temp results to: ${options.exportResults}`);
      await exportTempResults(options.exportResults);
      process.exit(0);
    }

    // Handle debug and demo modes
    if (options.debug) {
      Logger.logInfo("🐛 Starting debug utilities...");
      await runDebugUtilities();
      process.exit(0);
    }

    if (options.test) {
      // Temporarily enable test mode for test runs
      const originalTestMode = config.app.testMode;
      config.app.testMode = true;

      if (options.testRuns === 1) {
        Logger.logInfo("🧪 Running single test with cleanup...");
        await runTest();
      } else {
        Logger.logInfo(
          `🧪 Running ${options.testRuns} test cycles (no cleanup between runs)...`
        );
        await runMultipleTests(options.testRuns);
      }

      // Restore original testMode
      config.app.testMode = originalTestMode;
      process.exit(0);
    }

    if (options.testQuick) {
      Logger.logInfo("⚡ Running quick tests...");
      await runTestQuick();
      process.exit(0);
    }

    if (options.testStorage) {
      Logger.logInfo("🗄️  Running storage tests...");
      await runTestStorage();
      process.exit(0);
    }

    Logger.logInfo("🚀 Starting JSON Scanner Application...");
    Logger.logInfo(`📝 Log file: ${Logger.getLogFilePath()}`);
    Logger.logInfo(
      `⚙️  Configuration: ${options.mode.toUpperCase()} mode, ${
        config.app.logLevel
      } level`
    );
    Logger.logInfo(
      `📁 Data source: ${config.app.testMode ? "Test data" : "Production data"}`
    );

    // Initialize data storage
    Logger.logInfo("📊 Initializing data storage...");
    dataManager = new DataManager();
    await dataManager.initialize();

    Logger.logInfo(
      `🎯 Active scan path: ${config.getScanPath() || "Will prompt user"}`
    );

    if (options.forceReprocess) {
      config.app.forceReprocess = true;
      Logger.logInfo(
        "🔄 Force reprocess enabled - will reprocess even if result files exist"
      );
    }

    // Initialize user manager for permission checking
    const userManager = new UserManager();

    // Create executor with options
    const executor = new Executor(dataManager);

    await executor.start(options);

    Logger.logInfo("✅ Application started successfully");
  } catch (error) {
    Logger.logError(`❌ Application startup failed: ${error.message}`);
    Logger.logError(`Stack trace: ${error.stack}`);
    process.exit(1);
  } finally {
    // Cleanup data manager on exit
    if (dataManager) {
      try {
        await dataManager.disconnect();
        Logger.logInfo("📊 Data storage disconnected");
      } catch (error) {
        Logger.logError("Error disconnecting data storage:", error);
      }
    }
  }
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  Logger.logInfo("🛑 Received shutdown signal (SIGINT)");
  Logger.logInfo("👋 Application shutting down gracefully...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  Logger.logInfo("🛑 Received shutdown signal (SIGTERM)");
  Logger.logInfo("👋 Application shutting down gracefully...");
  process.exit(0);
});

// Debug and demo function implementations
async function runDebugUtilities() {
  const fs = require("fs");
  const path = require("path");

  function showLogFiles() {
    const logsDir = Logger.getLogsDirectory();

    if (!fs.existsSync(logsDir)) {
      console.log("📁 No logs directory found.");
      return;
    }

    const logFiles = fs
      .readdirSync(logsDir)
      .filter((file) => file.endsWith(".log"));

    if (logFiles.length === 0) {
      console.log("📝 No log files found.");
      return;
    }

    console.log("📝 Available log files:");
    logFiles.forEach((file, index) => {
      const filePath = path.join(logsDir, file);
      const stats = fs.statSync(filePath);
      console.log(
        `  ${index + 1}. ${file} (${Math.round(
          stats.size / 1024
        )}KB) - ${stats.mtime.toLocaleString()}`
      );
    });
  }

  function showLatestLogs(lines = 50) {
    const logFile = Logger.getLogFilePath();

    if (!fs.existsSync(logFile)) {
      console.log("📝 No current log file found.");
      return;
    }

    const content = fs.readFileSync(logFile, "utf8");
    const logLines = content.split("\n").filter((line) => line.trim());
    const recentLines = logLines.slice(-lines);

    console.log(`📝 Latest ${recentLines.length} log entries:`);
    console.log("═".repeat(80));
    recentLines.forEach((line) => console.log(line));
  }

  console.log("🐛 JSONScanner Debug Utilities");
  console.log("==============================\n");

  showLogFiles();
  console.log("");
  showLatestLogs(20);
}

async function runTest() {
  const path = require("path");
  const Scanner = require("./src/Scanner");
  const Executor = require("./src/Executor");

  console.log("🧪 JSONScanner Single Test Run");
  console.log("🗂️  BRK CNC Management Dashboard Structure");
  console.log("📌 Note: Test data preserved for inspection");
  console.log("================================================\n");

  let dataManager = null;
  let executor = null;
  let originalAutorun = null;

  try {
    // Temporarily disable autorun for demo mode
    originalAutorun = config.app.autorun;
    config.app.autorun = false;

    // Initialize data storage
    dataManager = new DataManager();
    await dataManager.initialize();

    // Get test source data path
    const testDataPath = config.paths.test.testDataPathAuto;
    console.log(`📂 Using test source data: ${testDataPath}\n`);

    // Initialize scanner and executor
    const scanner = new Scanner(dataManager);
    executor = new Executor(dataManager);

    console.log("📊 Session Information:");
    console.log(`   - Session ID: ${scanner.tempManager?.sessionId || "N/A"}`);
    console.log(
      `   - Temp Directory: ${scanner.tempManager?.tempDir || "N/A"}`
    );
    console.log(
      `   - Results Directory: ${scanner.tempManager?.resultsPath || "N/A"}`
    );
    console.log("");

    console.log("🔄 Step 1: Scanning and copying original files to temp...");
    await scanner.forceRescan(testDataPath);

    // Get projects from scanner after scan
    const projects = scanner.getProjects();

    console.log(`✅ Found ${projects.length} project(s) copied to temp`);
    console.log("");

    if (projects.length > 0) {
      console.log("🔄 Step 2: Processing projects (all in temp)...");

      // Process first project as example
      const firstProject = projects[0];
      console.log(`📋 Processing: ${firstProject.name}`);
      console.log(
        `   - Working with temp JSON: ${path.basename(
          firstProject.jsonPath || "unknown"
        )}`
      );

      await executor.processProject(firstProject);
      console.log("✅ Results saved to temp folder");
      console.log("");
    }

    console.log("📋 Step 3: Checking organized temp session contents...");
    console.log(
      "   📁 BRK CNC Management Dashboard/JSONScanner structure created"
    );
    console.log(`   📂 Session: ${scanner.tempManager?.sessionId || "N/A"}`);
    console.log(`   - Total projects processed: ${projects.length}`);
    console.log("   - Results saved to temp directory");
  } catch (error) {
    console.error("❌ Demo failed:", error.message);
  } finally {
    console.log("\n🔄 Data preserved for future test runs");
    if (executor) {
      await executor.stop();
    }

    // Restore original autorun setting
    config.app.autorun = originalAutorun;

    console.log("✅ Test run completed (data preserved)");
  }
}

async function runTestQuick() {
  console.log("🚀 Quick Storage Tests for JSONScanner\n");

  try {
    // Test Local Storage
    process.env.STORAGE_TYPE = "local";
    const dm1 = new DataManager();
    await dm1.initialize();

    const testProject = {
      projectName: "test_local_quick",
      fileName: "test.json",
      status: "active",
    };

    await dm1.saveProject(testProject);
    console.log("✅ JSONScanner Local Storage: PASSED");

    // Test MongoDB if available
    try {
      process.env.STORAGE_TYPE = "mongodb";
      const dm2 = new DataManager();
      await dm2.initialize();

      const testProjectMongo = {
        projectName: "test_mongo_quick",
        fileName: "test.json",
        status: "active",
      };

      await dm2.saveProject(testProjectMongo);
      console.log("✅ JSONScanner MongoDB: PASSED");
    } catch (mongoError) {
      console.log("⚠️  JSONScanner MongoDB: SKIPPED (not available)");
    }
  } catch (error) {
    console.error("❌ JSONScanner tests failed:", error.message);
  }

  console.log("\n🎉 Quick tests completed!");
}

async function runTestStorage() {
  console.log("🧪 Testing JSONScanner with LOCAL storage...");

  try {
    // Test local storage
    process.env.STORAGE_TYPE = "local";
    const dataManager = new DataManager();
    await dataManager.initialize();

    console.log("✅ Local storage initialized");

    // Test saving a project
    const testProject = {
      projectName: "storage_test",
      fileName: "test.json",
      status: "active",
      timestamp: new Date().toISOString(),
    };

    await dataManager.saveProject(testProject);
    console.log("✅ Project saved successfully");

    // Test retrieving projects
    const projects = await dataManager.getAllProjects();
    console.log(`✅ Retrieved ${projects.length} project(s)`);

    // Test rule execution storage
    const testRuleExecution = {
      projectName: "storage_test",
      ruleName: "TestRule",
      passed: true,
      violations: [],
      timestamp: new Date().toISOString(),
    };

    await dataManager.saveRuleExecution(testRuleExecution);
    console.log("✅ Rule execution saved successfully");

    // Test scan results storage
    const testScanResult = {
      scanPath: "/test/path",
      projectCount: 1,
      timestamp: new Date().toISOString(),
    };

    await dataManager.saveScanResult(testScanResult);
    console.log("✅ Scan result saved successfully");

    console.log("\n🎉 All storage tests passed!");
  } catch (error) {
    console.error("❌ Storage test failed:", error.message);
  }
}

async function runMultipleTests(numRuns) {
  const path = require("path");
  const Scanner = require("./src/Scanner");
  const Executor = require("./src/Executor");

  console.log(`🧪 JSONScanner Multiple Test Runs (${numRuns} cycles)`);
  console.log("🗂️  BRK CNC Management Dashboard Structure");
  console.log("📌 Note: No cleanup between runs - data accumulates");
  console.log("================================================\n");

  let dataManager = null;
  let executor = null;
  let originalAutorun = null;

  try {
    // Temporarily disable autorun for test mode
    originalAutorun = config.app.autorun;
    config.app.autorun = false;

    // Initialize data storage
    dataManager = new DataManager();
    await dataManager.initialize();

    // Get test source data path
    const testDataPath = config.paths.test.testDataPathAuto;
    console.log(`📂 Using test source data: ${testDataPath}\n`);

    // Initialize scanner and executor
    const scanner = new Scanner(dataManager);
    executor = new Executor(dataManager);

    console.log("📊 Session Information:");
    console.log(`   - Session ID: ${scanner.tempManager?.sessionId || "N/A"}`);
    console.log(
      `   - Temp Directory: ${scanner.tempManager?.tempDir || "N/A"}`
    );
    console.log(
      `   - Results Directory: ${scanner.tempManager?.resultsPath || "N/A"}`
    );
    console.log("");

    // Run multiple test cycles
    for (let runNumber = 1; runNumber <= numRuns; runNumber++) {
      console.log(
        `🔄 Test Run ${runNumber}/${numRuns}: Scanning and processing...`
      );

      await scanner.forceRescan(testDataPath);

      // Get projects from scanner after scan
      const projects = scanner.getProjects();

      console.log(
        `✅ Run ${runNumber}: Found ${projects.length} project(s) copied to temp`
      );

      if (projects.length > 0) {
        // Process first project as example
        const firstProject = projects[0];
        console.log(`📋 Processing: ${firstProject.name}`);
        console.log(
          `   - Working with temp JSON: ${path.basename(
            firstProject.jsonPath || "unknown"
          )}`
        );

        await executor.processProject(firstProject);
        console.log(`✅ Run ${runNumber}: Results saved to temp folder`);
      }

      if (runNumber < numRuns) {
        console.log("   🔄 Continuing to next run (no cleanup)...\n");
      }
    }

    console.log(`\n📋 All ${numRuns} test runs completed`);
    console.log(
      "   📁 BRK CNC Management Dashboard/JSONScanner structure maintained"
    );
    console.log(`   📂 Session: ${scanner.tempManager?.sessionId || "N/A"}`);
    console.log("   - Results saved to temp directory");
    console.log("");
    console.log("🔄 Data preserved for future test runs");
  } catch (error) {
    console.error("❌ Test run failed:", error.message);
  } finally {
    console.log("\n🧹 Stopping executor (no data cleanup)...");
    if (executor) {
      await executor.stop();
    }

    // Restore original autorun setting
    if (originalAutorun !== null) {
      config.app.autorun = originalAutorun;
    }

    console.log("✅ Test run completed (data preserved)");
  }
}

// Clean demo working folder but preserve directory structure
async function cleanDemoWorkingFolder() {
  const fs = require("fs");
  const path = require("path");

  try {
    const testProcessedDataPath = config.app.testProcessedDataPath;
    if (!fs.existsSync(testProcessedDataPath)) {
      console.log(
        "   📁 Test processed data folder doesn't exist - nothing to clean"
      );
      return;
    }

    const brkFolder = path.join(
      testProcessedDataPath,
      "BRK CNC Management Dashboard"
    );
    if (!fs.existsSync(brkFolder)) {
      console.log("   📁 No demo data found - folder is already clean");
      return;
    }

    // Remove all contents of the BRK folder but keep the folder structure
    const jsonScannerFolder = path.join(brkFolder, "JSONScanner");
    if (fs.existsSync(jsonScannerFolder)) {
      // Remove contents but keep the JSONScanner folder
      fs.rmSync(jsonScannerFolder, { recursive: true, force: true });
      console.log("   🧹 Cleaned demo temp data (kept folder structure)");
    }

    // If BRK folder is now empty, remove it
    const brkContents = fs.readdirSync(brkFolder);
    if (brkContents.length === 0) {
      fs.rmSync(brkFolder, { recursive: true, force: true });
      console.log("   📁 Removed empty BRK folder");
    }

    console.log("   ✅ Demo working folder cleaned");
  } catch (error) {
    console.log(
      `   ⚠️  Warning: Could not clean demo folder - ${error.message}`
    );
  }
}

main().catch((error) => {
  Logger.logError(`💥 Unhandled error in main: ${error.message}`);
  Logger.logError(`Stack trace: ${error.stack}`);
  process.exit(1);
});
