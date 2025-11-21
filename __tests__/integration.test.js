/**
 * Integration tests - test REAL execution paths with REAL objects
 * No mocking - catches actual runtime errors
 */

const path = require('path');
const fs = require('fs');
const Project = require('../src/Project');
const Scanner = require('../src/Scanner');
const Analyzer = require('../src/Analyzer');
const RuleEngine = require('../src/RuleEngine');
const Results = require('../src/Results');
const DataManager = require('../src/DataManager');
const Executor = require('../src/Executor');

describe('Integration Tests - Real Execution', () => {
  const testDataPath = path.join(__dirname, '../../BRK_CNC_CORE/test-data/source_data/json_files');
  let tempDir;

  beforeAll(() => {
    // Create temp directory for test outputs
    tempDir = path.join(__dirname, '../data/test_integration_output');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  afterAll(() => {
    // Cleanup
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Project Class', () => {
    test('should have projectPath property (not getProjectPath method)', () => {
      const projectPath = path.join(testDataPath, 'W5270NS01060');
      const project = new Project(projectPath);
      
      expect(project.projectPath).toBeDefined();
      expect(typeof project.projectPath).toBe('string');
      expect(project['getProjectPath']).toBeUndefined(); // Should NOT exist - bracket notation to bypass type check
    });

    test('should initialize and load real project data', () => {
      const projectPath = path.join(testDataPath, 'W5270NS01060');
      const project = new Project(projectPath);
      const initialized = project.initialize();
      
      expect(initialized).toBe(true);
      expect(project.isValid).toBe(true);
      expect(project.getFullName()).toMatch(/W5270NS01060[A-Z]/);
      expect(project.compoundJobs.size).toBeGreaterThan(0);
    });
  });

  describe('Full Pipeline Execution', () => {
    test('should process project through analyzer and rules', () => {
      const projectPath = path.join(testDataPath, 'W5270NS01060');
      const project = new Project(projectPath);
      project.initialize();

      const analyzer = new Analyzer();
      analyzer.analyzeProject(project);
      
      expect(project.status).not.toBe('analysis_failed');
      
      const ruleEngine = new RuleEngine();
      const ruleResults = ruleEngine.executeRules(project);
      
      expect(ruleResults).toBeDefined();
      expect(typeof ruleResults).toBe('object');
    });

    test('DataManager should save results without errors', async () => {
      const projectPath = path.join(testDataPath, 'W5270NS01060');
      const project = new Project(projectPath);
      project.initialize();

      const analyzer = new Analyzer();
      analyzer.analyzeProject(project);
      
      const ruleEngine = new RuleEngine();
      const ruleResults = ruleEngine.executeRules(project);
      project.setAnalysisResults(ruleResults);

      const dataManager = new DataManager();
      await dataManager.initialize();

      // This is where it was crashing - calling project.getProjectPath()
      const saveResult = await dataManager.saveScanResult(project, ruleResults);
      
      expect(saveResult).toBeDefined();
      expect(saveResult.projectName).toBe(project.getFullName());
      expect(saveResult.projectPath).toBe(project.projectPath);
    });

    test('Executor should process project end-to-end', async () => {
      const dataManager = new DataManager();
      await dataManager.initialize();
      
      const executor = new Executor(dataManager);
      
      const projectPath = path.join(testDataPath, 'W5270NS01060');
      const project = new Project(projectPath);
      const initialized = project.initialize();
      
      expect(initialized).toBe(true);
      
      // Process the project
      await executor.processProject(project);
      
      expect(project.status).toBe('completed');
      expect(project.analysisResults).toBeDefined();
      expect(project.analysisResults.summary).toBeDefined();
    });
  });

  describe('Scanner Integration', () => {
    test('should discover and create valid Project objects', async () => {
      const scanner = new Scanner();
      scanner.start();
      
      await scanner.performScan(testDataPath);
      const projects = scanner.getProjects();
      
      expect(projects.length).toBeGreaterThan(0);
      
      // Verify each project has required properties and methods
      projects.forEach(project => {
        expect(project.projectPath).toBeDefined();
        expect(typeof project.projectPath).toBe('string');
        expect(typeof project.getFullName).toBe('function');
        expect(project['getProjectPath']).toBeUndefined(); // Should NOT exist - bracket notation to bypass type check
      });
    });
  });

  describe('Error Detection', () => {
    test('should catch method-does-not-exist errors', () => {
      const projectPath = path.join(testDataPath, 'W5270NS01060');
      const project = new Project(projectPath);
      project.initialize();
      
      // These should throw if methods don't exist
      expect(() => project.getFullName()).not.toThrow();
      expect(() => project.getAnalysisResults()).not.toThrow();
      
      // This should be undefined (property, not method) - use bracket notation to bypass type check
      expect(project['getProjectPath']).toBeUndefined();
    });
  });
});
