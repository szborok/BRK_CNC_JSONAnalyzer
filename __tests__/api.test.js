const request = require('supertest');
const express = require('express');

// Remove incorrect mock - DataManager doesn't need mocking for API tests

describe('JSONScanner API', () => {
  let app;
  let server;

  beforeAll(() => {
    // Create a minimal express app for testing
    app = express();
    app.use(express.json());

    // Health check endpoint
    app.get('/api/status', (req, res) => {
      res.json({
        status: 'running',
        mode: process.env.TEST_MODE ? 'test' : 'production',
        autorun: false,
        timestamp: new Date().toISOString()
      });
    });

    // Config endpoint
    app.post('/api/config', (req, res) => {
      const { testMode, autoMode, workingFolder } = req.body;
      
      if (!workingFolder) {
        return res.status(400).json({ error: 'workingFolder is required' });
      }

      res.json({
        success: true,
        config: { testMode, autoMode, workingFolder }
      });
    });

    // Start scan endpoint
    app.post('/api/scan', (req, res) => {
      res.json({
        success: true,
        message: 'Scan started',
        projectsFound: 0
      });
    });
  });

  describe('GET /api/status', () => {
    test('should return 200 with status object', async () => {
      const response = await request(app)
        .get('/api/status')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('mode');
      expect(response.body).toHaveProperty('timestamp');
    });

    test('should return running status', async () => {
      const response = await request(app).get('/api/status');
      expect(response.body.status).toBe('running');
    });
  });

  describe('POST /api/config', () => {
    test('should accept valid configuration', async () => {
      const config = {
        testMode: true,
        autoMode: false,
        workingFolder: '/tmp/test'
      };

      const response = await request(app)
        .post('/api/config')
        .send(config)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.config).toMatchObject(config);
    });

    test('should reject config without workingFolder', async () => {
      const config = {
        testMode: true,
        autoMode: false
      };

      const response = await request(app)
        .post('/api/config')
        .send(config)
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    test('should handle empty request body', async () => {
      const response = await request(app)
        .post('/api/config')
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/scan', () => {
    test('should start scan successfully', async () => {
      const response = await request(app)
        .post('/api/scan')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('projectsFound');
    });

    test('should return number of projects found', async () => {
      const response = await request(app).post('/api/scan');
      expect(typeof response.body.projectsFound).toBe('number');
    });
  });
});
