// config.js
/**
 * Unified application configuration.
 * Contains all settings, paths, and rule-specific data.
 */

const path = require("path");
const { loadConfig } = require("../BRK_CNC_CORE/utils/configScanner");

// Try to load system-wide config
const systemConfig = loadConfig();

const config = {
  // Application settings
  app: {
    mode: 'manual', // 'test' = test data + manual trigger, 'manual' = production + manual trigger, 'auto' = production + autorun
    useTestPaths: true, // Override to use test-data paths even in auto mode
    scanIntervalMs: 60000, // How often the autorun scanner checks for new JSONs (60 seconds)
    logLevel: systemConfig?.advanced?.logLevel || "info", // can be: 'debug', 'info', 'warn', 'error'
    enableDetailedLogging: true,
    enableProgressReporting: true, // Show progress during bulk file operations
    progressReportInterval: 10, // Report progress every N files during bulk operations
    operationTimeoutWarning: 5000, // Warn if single operation takes longer than 5 seconds
    usePersistentTempFolder: true, // Use persistent temp folder with original structure
    forceReprocess: true, // true = reprocess even if result file exists, false = skip processed files

    // Read-only processing settings (like ToolManager)
    tempBaseName: "BRK CNC Management Dashboard", // Organized temp folder name
    userDefinedWorkingFolder: systemConfig?.storage?.tempPath || path.join(
      __dirname,
      "..",
      "BRK_CNC_CORE",
      "test-data",
      "working_data"
    ), // Use system config or default to test-data

    // Test mode temp processing settings - points to centralized BRK_CNC_CORE test-data
    testProcessedDataPath: systemConfig?.storage?.basePath || path.join(
      __dirname,
      "..",
      "BRK_CNC_CORE",
      "test-data",
      "working_data"
    ), // Test mode temp base path
  },

  // Web app settings (for future web service)
  webApp: {
    port: 3005,
    enableAuth: true,
    sessionSecret: "your-secret-key-here", // Change in production
    maxFileSize: "10MB",
    allowedOrigins: ["http://localhost:5173", "http://localhost:3000"],
  },

  // Storage settings - supports both local and MongoDB
  storage: {
    type: process.env.STORAGE_TYPE || "auto", // 'local', 'mongodb', 'auto'
    local: {
      dataDirectory: process.env.LOCAL_DATA_DIR || path.join(__dirname, "data"),
      backupDirectory: path.join(__dirname, "data", "backups"),
      maxBackups: 10,
    },
  },

  // MongoDB connection (when storage.type is 'mongodb' or 'auto')
  mongodb: {
    uri: process.env.MONGODB_URI || "mongodb://localhost:27017",
    database: process.env.MONGODB_DATABASE || "cnc_scanner", // JSONScanner database
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    },
  },

  // Data retention settings (as per your requirements)
  dataRetention: {
    // JSONScanner data - keep for 1 week as per your requirements
    scanResults: {
      retentionDays: 7,
      autoCleanup: true,
    },
    analysisResults: {
      retentionDays: 7,
      autoCleanup: true,
    },
    // Backup collections with TTL
    backupCollections: {
      scan_results_backup: 7 * 24 * 60 * 60, // 7 days in seconds
      analysis_backup: 7 * 24 * 60 * 60,
    },
  },

  // User roles and permissions
  permissions: {
    admin: {
      canUseAutoMode: true,
      canUseManualMode: true,
      canViewAllProjects: true,
      canModifySettings: true,
    },
    user: {
      canUseAutoMode: false,
      canUseManualMode: true,
      canViewAllProjects: false, // Only own projects
      canModifySettings: false,
    },
  },

  // Paths
  paths: {
    // Test mode paths (for development and testing) - reads from JSONScanner output
    test: {
      testDataPathAuto: path.join(
        __dirname,
        "..",
        "BRK_CNC_CORE",
        "test-data",
        "working_data",
        "BRK CNC Management Dashboard",
        "JSONScanner"
      ),
      testDataPathManual: path.join(
        __dirname,
        "..",
        "BRK_CNC_CORE",
        "test-data",
        "working_data",
        "BRK CNC Management Dashboard",
        "JSONScanner"
      ),
    },
    // Production mode paths (for live operation)
    production: {
      productionDataPath: "C:\\Production\\CNC_Data", // Production CNC data directory
      manualPath: null, // Will be provided by user in manual mode
    },
    // General paths - points to centralized test data
    dataRoot: path.join(
      __dirname,
      "..",
      "BRK_CNC_CORE",
      "test-data",
      "source_data",
      "json_files"
    ),
  },

  // File filtering for temp operations
  tempFiles: {
    essentialExtensions: [".json"], // Only copy JSON files - analyzer reads from source directly
    skipExtensions: [".gif", ".png", ".jpg", ".html", ".stl", ".vcproject", ".h", ".tls"], // Skip these file types
    sessionTrackingExtension: ".session", // Extension for session tracking files
  },

  // File naming
  files: {
    jsonExtension: ".json",
    fixedSuffix: "fixed",
    resultSuffix: "result",
  },

  // Tool categories for rules
  toolCategories: {
    gundrill: [
      "GUH-1865",
      "GUH-3032",
      "GUH-3033",
      "GUH-3035",
      "GUH-5639",
      "GUH-5640",
      "GUH-5641",
      "GUH-5688",
      "GUH-5691",
      "GUH-49298",
      "TUN-AF",
      "TOO-AF",
    ],
    endmill_finish: ["FRA-P15250", "FRA-P15251", "FRA-P15254", "FRA-P8521"],
    endmill_roughing: ["GUH-6736", "GUH-6961", "FRA-P8420"],
    jjtools: ["JJ"],
    tgt: ["TGT"],
    xfeed: ["FRA-X7600", "FRA-X7604", "FRA-X7620", "FRA-X7624"],
    cleaning: ["G12R6-tisztito_H63Z12L120X"],
    touchprobe: [
      "DMG-TAP75_H63-Renishaw-taszter-HSC75",
      "DMG-TAP85_H63TASZTER-DMU85",
      "DMG-TAP100P_H63TASZTER-DMU100P",
      "DMG-TAP100P4_H63-Renishaw-taszter-DMU100P4",
    ],
  },

  // Rule configuration - defines which rules run under what conditions
  rules: {
    GunDrill60MinLimit: {
      description: "Gundrill tools should not exceed 60 minutes per NC file",
      failureType: "ncfile",
      logic: (project) => {
        // Always run for all projects
        return true;
      },
    },

    SingleToolInNC: {
      description: "Each NC file should use only one tool",
      failureType: "ncfile",
      logic: (project) => {
        // Always run except for AutoCorrection compound jobs
        return true; // Rule will internally skip AutoCorrection jobs
      },
    },

    M110Helical: {
      description: "M110 command required for helical drilling operations",
      failureType: "ncfile",
      logic: (project) => {
        // Run if project uses endmill finish, xfeed, or tgt tools with helical drilling
        return (
          (project.hasToolCategory("endmill_finish") ||
            project.hasToolCategory("xfeed") ||
            project.hasToolCategory("tgt")) &&
          project.hasOperationType("helical drilling")
        );
      },
    },

    M110Contour: {
      description: "M110 contour operations must have RL compensation",
      failureType: "ncfile",
      logic: (project) => {
        // Run if project has 2D contour operations
        return (
          project.hasOperationType("2d contour") ||
          project.hasOperationType("contour milling")
        );
      },
    },

    ReconditionedTool: {
      description: "Validate reconditioned tool usage",
      failureType: "tool",
      logic: (project) => {
        // Only run on specific machines that don't allow reconditioned tools
        const restrictedMachines = [
          "DMU 100P duoblock Minus",
          "DMU 85 monoblock MINUS",
        ];

        const isRestrictedMachine = restrictedMachines.some((machine) =>
          project.machine?.includes(machine)
        );

        // Only run if project uses tools that can be reconditioned AND is on restricted machine
        return (
          isRestrictedMachine &&
          (project.hasToolCategory("endmill_finish") ||
            project.hasToolCategory("endmill_roughing"))
        );
      },
    },

    AutoCorrectionContour: {
      description: "Auto correction validation for contour operations",
      failureType: "project",
      logic: (project) => {
        // Only run on specific machines that require auto correction
        const restrictedMachines = [
          "DMU 100P duoblock Minus",
          "DMU 85 monoblock MINUS",
        ];

        const isRestrictedMachine = restrictedMachines.some((machine) =>
          project.machine?.includes(machine)
        );

        // Only run for restricted machines with contour operations
        return isRestrictedMachine && project.hasOperationType("contour");
      },
    },

    AutoCorrectionPlane: {
      description: "Auto correction validation for plane operations",
      failureType: "project",
      logic: (project) => {
        // Only run on specific machines that require auto correction
        const restrictedMachines = [
          "DMU 100P duoblock Minus",
          "DMU 85 monoblock MINUS",
        ];

        const isRestrictedMachine = restrictedMachines.some((machine) =>
          project.machine?.includes(machine)
        );

        // Only run for restricted machines with plane operations
        return isRestrictedMachine && project.hasOperationType("plane");
      },
    },
  },
};

// Backward compatibility helpers
Object.defineProperty(config.app, 'testMode', {
  get() { return this.mode === 'test'; },
  set(val) { this.mode = val ? 'test' : (this.mode === 'manual' ? 'manual' : 'auto'); }
});

Object.defineProperty(config.app, 'autorun', {
  get() { return this.mode === 'auto'; },
  set(val) { this.mode = val ? 'auto' : 'manual'; }
});

/**
 * Helper function to get the correct scanning path based on current mode settings
 * @param {string|null} manualPath - Path provided by user in manual mode (optional)
 * @returns {string} The path to scan for JSON files
 */
config.getScanPath = function (manualPath = null) {
  const { mode, useTestPaths } = this.app;

  if (mode === 'auto') {
    // Auto mode: production or test paths based on useTestPaths flag
    return useTestPaths ? this.paths.test.testDataPathAuto : this.paths.production.productionDataPath;
  } else if (mode === 'test') {
    // Test mode: always use test paths
    return this.paths.test.testDataPathAuto;
  } else {
    // Manual mode: use provided path or fallback to test manual path
    return manualPath || this.paths.test.testDataPathManual;
  }
};

/**
 * Helper function to check if we need to ask user for a path
 * @returns {boolean} True if user input is required for path selection
 */
config.requiresUserPath = function () {
  // Only require user path in manual mode when no path provided
  return this.app.mode === 'manual';
};

module.exports = config;
