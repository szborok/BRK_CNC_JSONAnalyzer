// server/index.js
/**
 * JSONScanner REST API Server
 *
 * Provides RESTful endpoints for CNC project analysis and quality control.
 * Integrates with the core JSONScanner processing pipeline.
 */

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const config = require("../config");
const Logger = require("../utils/Logger");
const DataManager = require("../src/DataManager");
const Executor = require("../src/Executor");
const Project = require("../src/Project");

const app = express();
const PORT = config.webApp?.port || 3005;
let executor = null;

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadsDir = path.join(__dirname, "..", "data", "uploads");
    // Ensure directory exists
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // Keep original filename
    cb(null, file.originalname);
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.originalname.endsWith(".json")) {
      cb(null, true);
    } else {
      cb(new Error("Only .json files are allowed"));
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
});

// Middleware
app.use(
  cors({
    origin: ["http://localhost:5173", "http://localhost:3000"],
    credentials: true,
  })
);
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  Logger.logInfo(`${req.method} ${req.path}`);
  next();
});

// Initialize DataManager
let dataManager = null;

async function initializeDataManager() {
  try {
    dataManager = new DataManager();
    await dataManager.initialize();
    Logger.logInfo("DataManager initialized successfully");
    return true;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    Logger.logError(`Failed to initialize DataManager: ${err.message}`);
    return false;
  }
}

// ===== API ROUTES =====

/**
 * GET /api/status
 * Get server status and health
 */
app.get("/api/status", (req, res) => {
  res.json({
    status: "running",
    mode: config.app.autorun ? "auto" : "manual",
    testMode: config.app.testMode,
    version: "2.0.0",
    timestamp: new Date().toISOString(),
    dataManager: dataManager ? "initialized" : "not initialized",
  });
});

/**
 * GET /api/config
 * Get system configuration (filesystem config if exists)
 */
app.get("/api/config", (req, res) => {
  try {
    const configScanner = require('../../BRK_CNC_CORE/utils/configScanner');
    const systemConfig = configScanner.loadConfig();
    
    if (systemConfig) {
      res.json(systemConfig);
    } else {
      res.status(404).json({
        error: {
          code: "CONFIG_NOT_FOUND",
          message: "System configuration file not found or not configured"
        }
      });
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    Logger.logError(`Failed to load system config: ${err.message}`);
    res.status(500).json({
      error: {
        code: "CONFIG_ERROR",
        message: "Failed to load configuration"
      }
    });
  }
});

/**
 * GET /api/projects
 * List all processed projects with pagination
 */
app.get("/api/projects", async (req, res) => {
  try {
    const page = parseInt(String(req.query.page || '1')) || 1;
    const pageSize = parseInt(String(req.query.pageSize || '20')) || 20;
    const status = req.query.status; // filter by status: passed|failed|warning

    if (!dataManager) {
      Logger.logError("❌ API Request Failed: DataManager not initialized");
      return res.status(503).json({
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "DataManager not initialized",
        },
      });
    }

    // Get all projects from DataManager
    Logger.logInfo("📡 Dashboard requested projects list");
    const allProjects = await dataManager.getAllProjects();
    Logger.logInfo(`📊 Returning ${allProjects.length} projects to Dashboard`);

    // Filter by status if provided
    let filteredProjects = allProjects;
    if (status) {
      filteredProjects = allProjects.filter((p) => p.status === status);
    }

    // Apply pagination
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedProjects = filteredProjects.slice(startIndex, endIndex);

    const response = {
      projects: paginatedProjects.map((p) => ({
        id: p.id,
        filename: p.name,
        machine: p.machine || null,
        processedAt: p.timestamp,
        status: p.status || "unknown",
        scanType: p.scanType || 'auto',
        operator: p.operator || null,
        results: {
          rulesApplied: p.rulesApplied || [],
          violations: p.violations || []
        }
      })),
      total: filteredProjects.length,
      page,
      pageSize,
      totalPages: Math.ceil(filteredProjects.length / pageSize),
    };
    
    // Log first 2 projects as sample
    if (response.projects.length > 0) {
      Logger.logInfo(`📦 Sample project data: ${JSON.stringify(response.projects.slice(0, 2), null, 2)}`);
    } else {
      Logger.logWarn("⚠️ No projects found to return to Dashboard!");
    }

    res.json(response);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    Logger.logError(`Failed to get projects: ${err.message}`);
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Failed to retrieve projects",
        details: err.message,
      },
    });
  }
});

/**
 * GET /api/projects/:id
 * Get detailed project information
 */
app.get("/api/projects/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!dataManager) {
      return res.status(503).json({
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "DataManager not initialized",
        },
      });
    }

    const project = await dataManager.getProject(id);

    if (!project) {
      return res.status(404).json({
        error: {
          code: "PROJECT_NOT_FOUND",
          message: `Project with ID '${id}' not found`,
        },
      });
    }

    res.json(project);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    Logger.logError(`Failed to get project ${req.params.id}: ${err.message}`);
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Failed to retrieve project",
        details: err.message,
      },
    });
  }
});

/**
 * GET /api/analysis/:projectId
 * Get full analysis results for a project
 */
app.get("/api/analysis/:projectId", async (req, res) => {
  try {
    const { projectId } = req.params;

    if (!dataManager) {
      return res.status(503).json({
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "DataManager not initialized",
        },
      });
    }

    const analysis = await dataManager.getAnalysis(projectId);

    if (!analysis) {
      return res.status(404).json({
        error: {
          code: "ANALYSIS_NOT_FOUND",
          message: `Analysis for project '${projectId}' not found`,
        },
      });
    }

    res.json(analysis);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    Logger.logError(`Failed to get analysis for ${req.params.projectId}: ${err.message}`);
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Failed to retrieve analysis",
        details: err.message,
      },
    });
  }
});

/**
 * GET /api/analysis/:projectId/violations
 * Get only violations for a project
 */
app.get("/api/analysis/:projectId/violations", async (req, res) => {
  try {
    const { projectId } = req.params;

    if (!dataManager) {
      return res.status(503).json({
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "DataManager not initialized",
        },
      });
    }

    const analysis = await dataManager.getAnalysis(projectId);

    if (!analysis) {
      return res.status(404).json({
        error: {
          code: "ANALYSIS_NOT_FOUND",
          message: `Analysis for project '${projectId}' not found`,
        },
      });
    }

    res.json({
      projectId,
      violations: analysis.violations || [],
      violationCount: (analysis.violations || []).length,
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    Logger.logError(`Failed to get violations for ${req.params.projectId}: ${err.message}`);
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Failed to retrieve violations",
        details: err.message,
      },
    });
  }
});

/**
 * POST /api/upload
 * Upload and analyze a JSON file
 */
app.post("/api/upload", upload.single("file"), async (req, res) => {
  try {
    Logger.logInfo(`📤 Upload request received - hasFile: ${!!req.file}, operator: ${req.body.operator}`);


    if (!req.file) {
      Logger.logError("No file in upload request");
      return res.status(400).json({
        error: {
          code: "NO_FILE",
          message: "No file uploaded",
        },
      });
    }

    const operator = req.body.operator || "unknown";
    const uploadedFilePath = req.file.path;
    const originalName = req.file.originalname;
    const projectName = originalName.replace(".json", "");

    Logger.logInfo(`📤 File uploaded: ${originalName} by ${operator}`);

    // Check if executor is initialized
    if (!executor) {
      Logger.logError("Executor not initialized");
      fs.unlinkSync(uploadedFilePath);
      return res.status(500).json({
        error: {
          code: "SERVER_NOT_READY",
          message: "Analysis service not initialized",
        },
      });
    }

    // Validate and sanitize JSON using Project's sanitization
    try {
      const rawJsonContent = fs.readFileSync(uploadedFilePath, "utf8");
      const sanitizedJsonContent = Project.sanitizeJsonContent(rawJsonContent);
      
      // Validate it parses
      JSON.parse(sanitizedJsonContent);
      
      // Write sanitized content back
      fs.writeFileSync(uploadedFilePath, sanitizedJsonContent, "utf8");
      
      Logger.logInfo(`📤 JSON validated and sanitized: ${originalName}`);
    } catch (parseError) {
      const err = parseError instanceof Error ? parseError : new Error(String(parseError));
      Logger.logError(`Invalid JSON in uploaded file: ${err.message}`);
      fs.unlinkSync(uploadedFilePath);
      return res.status(400).json({
        error: {
          code: "INVALID_JSON",
          message: "Invalid JSON file",
          details: err.message,
        },
      });
    }

    Logger.logInfo(`📤 Starting analysis for: ${originalName}`);

    // Create a project directly from the uploaded file
    const project = new Project(path.dirname(uploadedFilePath));
    project.jsonFilePath = uploadedFilePath;
    project.name = projectName;
    project.position = originalName.replace(".json", "");
    project.scanType = 'manual';
    project.operator = req.body.operator || 'unknown';
    
    // Load the JSON data
    if (!project.loadJsonData()) {
      throw new Error("Failed to load JSON data");
    }
    
    project.status = "ready";
    
    // Process the project through the executor
    await executor.processProject(project);
    
    if (project.status !== "completed") {
      throw new Error("Analysis did not complete successfully");
    }

    // analysisResults is stored directly on project
    const analysisResults = project.analysisResults;
    
    // Also save to DataManager so it appears in the projects list
    if (dataManager) {
      await dataManager.saveScanResult(project, analysisResults, {
        scanType: 'manual',
        operator: req.body.operator || 'unknown'
      });
      Logger.logInfo(`📊 Manual upload saved to database: ${project.name}`);
    }
    
    // Convert rules Map to array for response
    const rulesArray = Array.from(analysisResults.rules.values());
    const violations = rulesArray.filter(r => r.violations?.length > 0);

    Logger.logInfo(`✅ Analysis complete: ${originalName} - rules: ${analysisResults.summary?.rulesRun || 0}, violations: ${violations.length}`);


    res.json({
      success: true,
      id: project.name,
      filename: projectName,
      rulesApplied: analysisResults.summary?.rulesRun || 0,
      violations: violations.length,
      status: analysisResults.summary?.rulesFailed > 0 ? "failed" : "passed",
      message: "File analyzed successfully",
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    Logger.logError(`Upload/analysis failed: ${err.message}`);
    
    // Clean up file if it exists
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    const errMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({
      error: {
        code: "ANALYSIS_FAILED",
        message: "Failed to analyze uploaded file",
        details: errMsg,
      },
    });
  }
});

/**
 * POST /api/config
 * Receive configuration from Dashboard and activate backend
 */
app.post("/api/config", async (req, res) => {
  try {
    const { testMode, scanPaths, workingFolder, autoRun = false } = req.body;

    if (typeof testMode !== "boolean") {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "testMode (boolean) is required",
        },
      });
    }

    Logger.logInfo(`📡 Received configuration from Dashboard - testMode: ${testMode}, workingFolder: ${workingFolder}`);


    // Update configuration
    config.app.testMode = testMode;
    config.app.autorun = autoRun; // Only activate scanning if explicitly requested

    // Set the working folder path if provided
    if (workingFolder) {
      config.app.userDefinedWorkingFolder = workingFolder;
      Logger.logInfo(`📁 Working folder set to: ${workingFolder}`);
    }

    if (scanPaths?.jsonFiles) {
      config.paths.test.testDataPathAuto = scanPaths.jsonFiles;
    }

    Logger.logInfo(`✅ Configuration updated from Dashboard - testMode: ${testMode}, autorun: ${autoRun}`);


    // Start Executor only if autoRun is true
    if (autoRun && !executor) {
      Logger.logInfo("Starting Executor after config update...");
      executor = new Executor(dataManager);
      executor.start().catch((error) => {
        const msg = error instanceof Error ? error.message : String(error);
        Logger.logError(`Executor error: ${msg}`);
      });
    }

    res.json({
      success: true,
      message: "Configuration applied successfully",
      config: {
        testMode: config.app.testMode,
        autorun: config.app.autorun,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    Logger.logError(`Failed to apply configuration: ${err.message}`);
    res.status(500).json({
      error: {
        code: "CONFIG_ERROR",
        message: "Failed to apply configuration",
        details: err.message,
      },
    });
  }
});

/**
 * POST /api/projects/scan
 * Trigger manual scan (if not in auto mode)
 */
app.post("/api/projects/scan", async (req, res) => {
  try {
    const { projectPath } = req.body;

    if (config.app.autorun) {
      return res.status(400).json({
        error: {
          code: "INVALID_MODE",
          message: "Cannot trigger manual scan when in auto mode",
        },
      });
    }

    if (!projectPath) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "projectPath is required",
        },
      });
    }

    const fs = require('fs');
    if (!fs.existsSync(projectPath)) {
      return res.status(400).json({
        error: {
          code: "INVALID_PATH",
          message: `Path does not exist: ${projectPath}`,
        },
      });
    }

    Logger.logInfo(`Manual scan triggered: ${projectPath}`);


    // Execute scan asynchronously
    setImmediate(async () => {
      const Executor = require("../src/Executor");
      const executor = new Executor(dataManager);

      try {
        Logger.logInfo(`🔍 Starting scan for: ${projectPath}`);
        
        // Initialize scanner
        await executor.scanner.start();
        
        // Perform scan on the specified path
        await executor.scanner.performScan(projectPath);
        
        // Get discovered projects
        const projects = executor.scanner.getProjects();
        Logger.logInfo(`📊 Found ${projects.length} project(s) to process`);

        // Process each discovered project
        for (const project of projects) {
          if (project.status === "ready") {
            await executor.processProject(project);
          }
        }

        // Clean up
        executor.scanner.stop();
        
        Logger.logInfo(`✅ Scan completed: ${projects.length} projects processed`);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        Logger.logError(`Background scan failed: ${err.message}`);

      }
    });

    res.json({
      success: true,
      message: "Scan triggered successfully",
      projectPath,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    Logger.logError(`Failed to trigger scan: ${err.message}`);
    res.status(500).json({
      error: {
        code: "SCAN_ERROR",
        message: "Failed to trigger scan",
        details: err.message,
      },
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: `Route ${req.method} ${req.path} not found`,
    },
  });
});

// Error handler
app.use((err, req, res, _next) => {
  Logger.logError(`Unhandled error: ${err.message}`);

  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "Internal server error",
      details: process.env.NODE_ENV === "development" ? err.message : undefined,
    },
  });
});

// Start server
async function startServer() {
  try {
    Logger.logInfo("Starting JSONScanner API Server...");

    // Initialize DataManager
    const initialized = await initializeDataManager();
    if (!initialized) {
      Logger.logError(
        "Failed to initialize DataManager - server will start but data access will be limited"
      );
    }

    // Initialize Executor (always needed for manual uploads)
    Logger.logInfo("Initializing Executor...");
    executor = new Executor(dataManager);
    
    // Start Executor in AUTO mode if configured
    if (config.app.autorun) {
      Logger.logInfo("Starting Executor in AUTO mode...");
      // Don't await - let it run in background
      executor.start().catch((error) => {
        const msg = error instanceof Error ? error.message : String(error);
        Logger.logError(`Executor error: ${msg}`);
      });
      Logger.logInfo("Executor started in AUTO mode");
    } else {
      Logger.logInfo("Executor ready for manual operations");
    }

    const server = app.listen(PORT, () => {
      Logger.logInfo(
        `🚀 JSONScanner API Server running on http://localhost:${PORT}`
      );
      console.log(
        `🚀 JSONScanner API Server running on http://localhost:${PORT}`
      );
      console.log(`📊 Mode: ${config.app.testMode ? "TEST" : "PRODUCTION"}`);
      console.log(
        `🔄 Auto-run: ${config.app.autorun ? "ENABLED" : "DISABLED"}`
      );
      console.log(`📡 API endpoints available at http://localhost:${PORT}/api`);
    });
    
    // Handle port binding errors
    server.on('error', (err) => {
      if ('code' in err && err.code === 'EADDRINUSE') {
        Logger.logError(`❌ Port ${PORT} is already in use. Please stop the conflicting service.`);
        console.error(`❌ Port ${PORT} is already in use. Please stop the conflicting service.`);
        process.exit(1);
      } else {
        Logger.logError(`❌ Server error: ${err.message}`);
        console.error(`❌ Server error: ${err.message}`);
        process.exit(1);
      }
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    Logger.logError(`Failed to start server: ${err.message}`);
    console.error("❌ Failed to start server:", err.message);

    process.exit(1);
  }
}

// Start if run directly
if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
