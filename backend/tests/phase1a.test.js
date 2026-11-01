import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import { Router } from 'express';
import { validateConfig } from '../src/config/env.js';
import { checkDatabaseHealth } from '../src/config/prisma.js';
import { createApp } from '../src/app.js';
import { ConflictError, ForbiddenError, ValidationError } from '../src/errors/AppError.js';

describe('Phase 1A: Backend Foundation Test Suite', () => {
  // -------------------------------------------------------------
  // Test Group 1: Safe Configuration Validation (Zod)
  // -------------------------------------------------------------
  describe('Configuration Validation', () => {
    it('TC-CFG-01: parses valid environment variables successfully', () => {
      const validEnv = {
        PORT: '5000',
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5433/test_db',
        JWT_SECRET: 'a_very_secure_jwt_secret_phrase_123',
        CORS_ORIGIN: 'http://localhost:5173',
      };

      const result = validateConfig(validEnv);
      assert.equal(result.PORT, 5000);
      assert.equal(result.NODE_ENV, 'test');
      assert.equal(result.DATABASE_URL, validEnv.DATABASE_URL);
      assert.equal(result.JWT_SECRET, validEnv.JWT_SECRET);
    });

    it('TC-CFG-02: throws error when DATABASE_URL is missing or invalid URL', () => {
      const invalidEnv = {
        PORT: '5000',
        NODE_ENV: 'test',
        DATABASE_URL: 'not-a-valid-url',
        JWT_SECRET: 'a_very_secure_jwt_secret_phrase_123',
      };

      assert.throws(
        () => validateConfig(invalidEnv),
        /DATABASE_URL must be a valid PostgreSQL connection URL/
      );
    });

    it('TC-CFG-03: throws error when PORT is out of valid range', () => {
      const invalidPortEnv = {
        PORT: '75000',
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5433/test_db',
        JWT_SECRET: 'a_very_secure_jwt_secret_phrase_123',
      };

      assert.throws(
        () => validateConfig(invalidPortEnv),
        /PORT must be an integer between 1 and 65535/
      );
    });

    it('TC-CFG-04: throws error when JWT_SECRET is less than 16 characters', () => {
      const shortJwtEnv = {
        PORT: '5000',
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5433/test_db',
        JWT_SECRET: 'short_secret',
      };

      assert.throws(
        () => validateConfig(shortJwtEnv),
        /JWT_SECRET must be at least 16 characters long/
      );
    });
  });

  // -------------------------------------------------------------
  // Test Group 2: Database Connectivity & Health Check
  // -------------------------------------------------------------
  describe('Database Health Check', () => {
    it('TC-HLT-01: executes SELECT 1 and verifies PostgreSQL connectivity', async () => {
      const health = await checkDatabaseHealth();
      assert.equal(health.status, 'connected');
      assert.equal(typeof health.responseTimeMs, 'number');
      assert.ok(health.responseTimeMs >= 0, 'Response time should be non-negative');
    });
  });

  // -------------------------------------------------------------
  // Test Group 3: HTTP API & Health Endpoint
  // -------------------------------------------------------------
  describe('Express Health & Error Endpoints', () => {
    let server;
    let baseUrl;

    const startTestServer = (options = {}) =>
      new Promise((resolve) => {
        const app = createApp(options);
        server = http.createServer(app);
        server.listen(0, () => {
          const port = server.address().port;
          baseUrl = `http://127.0.0.1:${port}`;
          resolve();
        });
      });

    const stopTestServer = () =>
      new Promise((resolve) => {
        if (server) {
          server.close(resolve);
        } else {
          resolve();
        }
      });

    it('TC-HLT-02: GET /api/health returns HTTP 200 with database status connected', async () => {
      await startTestServer();
      try {
        const res = await fetch(`${baseUrl}/api/health`);
        assert.equal(res.status, 200);

        const data = await res.json();
        assert.equal(data.status, 'healthy');
        assert.equal(data.services.server.status, 'up');
        assert.equal(data.services.database.status, 'connected');
        assert.equal(data.services.database.engine, 'PostgreSQL');
        assert.ok(typeof data.services.database.responseTimeMs === 'number');
      } finally {
        await stopTestServer();
      }
    });

    it('TC-ERR-01: unmapped route returns HTTP 404 with structured JSON error', async () => {
      await startTestServer();
      try {
        const res = await fetch(`${baseUrl}/api/nonexistent-route`);
        assert.equal(res.status, 404);

        const data = await res.json();
        assert.equal(data.success, false);
        assert.equal(data.error.code, 'NOT_FOUND');
      } finally {
        await stopTestServer();
      }
    });

    it('TC-ERR-02: custom domain AppErrors format with correct HTTP status codes', async () => {
      const testRouter = Router();
      testRouter.get('/test-conflict', (req, res, next) => {
        next(new ConflictError('Task version mismatch', { expectedVersion: 2, actualVersion: 1 }));
      });
      testRouter.get('/test-forbidden', (req, res, next) => {
        next(new ForbiddenError('User does not belong to this tenant'));
      });
      testRouter.get('/test-validation', (req, res, next) => {
        next(new ValidationError('Invalid payload', [{ field: 'title', message: 'Title is required' }]));
      });

      await startTestServer({ routes: testRouter });

      try {
        // Test Conflict Error (409)
        const resConflict = await fetch(`${baseUrl}/test-conflict`);
        assert.equal(resConflict.status, 409);
        const dataConflict = await resConflict.json();
        assert.equal(dataConflict.success, false);
        assert.equal(dataConflict.error.code, 'CONFLICT');
        assert.equal(dataConflict.error.details.expectedVersion, 2);

        // Test Forbidden Error (403)
        const resForbidden = await fetch(`${baseUrl}/test-forbidden`);
        assert.equal(resForbidden.status, 403);
        const dataForbidden = await resForbidden.json();
        assert.equal(dataForbidden.success, false);
        assert.equal(dataForbidden.error.code, 'FORBIDDEN');

        // Test Validation Error (400)
        const resVal = await fetch(`${baseUrl}/test-validation`);
        assert.equal(resVal.status, 400);
        const dataVal = await resVal.json();
        assert.equal(dataVal.success, false);
        assert.equal(dataVal.error.code, 'VALIDATION_ERROR');
      } finally {
        await stopTestServer();
      }
    });
  });
});
