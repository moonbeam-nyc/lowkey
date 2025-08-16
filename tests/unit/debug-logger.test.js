const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('Debug Logger Unit Tests', () => {
  let originalEnv;
  let logDir;
  
  beforeEach(() => {
    // Save original environment
    originalEnv = process.env.LOWKEY_DEBUG;
    
    // Create temp log directory
    logDir = path.join(os.tmpdir(), `lowkey-test-logs-${Date.now()}`);
  });
  
  afterEach(() => {
    // Restore environment
    if (originalEnv !== undefined) {
      process.env.LOWKEY_DEBUG = originalEnv;
    } else {
      delete process.env.LOWKEY_DEBUG;
    }
    
    // Clean up log files
    if (fs.existsSync(logDir)) {
      fs.rmSync(logDir, { recursive: true, force: true });
    }
    
    // Clear module cache to get fresh logger instance
    delete require.cache[require.resolve('../../lib/debug-logger')];
  });

  describe('logger initialization', () => {
    it('should be disabled by default', () => {
      delete process.env.LOWKEY_DEBUG;
      delete process.env.DEBUG;
      
      const logger = require('../../lib/debug-logger');
      assert.strictEqual(logger.enabled, false);
    });

    it('should be enabled when LOWKEY_DEBUG=true', () => {
      process.env.LOWKEY_DEBUG = 'true';
      
      delete require.cache[require.resolve('../../lib/debug-logger')];
      const logger = require('../../lib/debug-logger');
      assert.strictEqual(logger.enabled, true);
    });

    it('should be enabled when DEBUG=true', () => {
      process.env.DEBUG = 'true';
      
      delete require.cache[require.resolve('../../lib/debug-logger')];
      const logger = require('../../lib/debug-logger');
      assert.strictEqual(logger.enabled, true);
    });
  });

  describe('data sanitization', () => {
    it('should sanitize sensitive keys', () => {
      process.env.LOWKEY_DEBUG = 'true';
      
      delete require.cache[require.resolve('../../lib/debug-logger')];
      const logger = require('../../lib/debug-logger');
      
      const sensitiveData = {
        username: 'john',
        password: 'secret123',
        apiKey: 'key123',
        token: 'token123',
        secret: 'mysecret',
        credential: 'cred123',
        normalField: 'normal_value'
      };
      
      const sanitized = logger.sanitizeData(sensitiveData);
      
      assert.strictEqual(sanitized.username, 'john');
      assert.strictEqual(sanitized.password, '[REDACTED]');
      assert.strictEqual(sanitized.apiKey, '[REDACTED]');
      assert.strictEqual(sanitized.token, '[REDACTED]');
      assert.strictEqual(sanitized.secret, '[REDACTED]');
      assert.strictEqual(sanitized.credential, '[REDACTED]');
      assert.strictEqual(sanitized.normalField, 'normal_value');
    });

    it('should sanitize nested objects', () => {
      process.env.LOWKEY_DEBUG = 'true';
      
      delete require.cache[require.resolve('../../lib/debug-logger')];
      const logger = require('../../lib/debug-logger');
      
      const nestedData = {
        user: {
          name: 'john',
          password: 'secret123'
        },
        config: {
          apiKey: 'key123',
          timeout: 5000
        }
      };
      
      const sanitized = logger.sanitizeData(nestedData);
      
      assert.strictEqual(sanitized.user.name, 'john');
      assert.strictEqual(sanitized.user.password, '[REDACTED]');
      assert.strictEqual(sanitized.config.apiKey, '[REDACTED]');
      assert.strictEqual(sanitized.config.timeout, 5000);
    });

    it('should handle null and undefined values', () => {
      process.env.LOWKEY_DEBUG = 'true';
      
      delete require.cache[require.resolve('../../lib/debug-logger')];
      const logger = require('../../lib/debug-logger');
      
      const dataWithNulls = {
        password: null,
        token: undefined,
        normal: 'value'
      };
      
      const sanitized = logger.sanitizeData(dataWithNulls);
      
      assert.strictEqual(sanitized.password, '[REDACTED]');
      assert.strictEqual(sanitized.token, '[REDACTED]');
      assert.strictEqual(sanitized.normal, 'value');
    });
  });

  describe('logging methods', () => {
    it('should not log when disabled', () => {
      delete process.env.LOWKEY_DEBUG;
      delete process.env.DEBUG;
      
      delete require.cache[require.resolve('../../lib/debug-logger')];
      const logger = require('../../lib/debug-logger');
      
      // Should not throw or create files
      logger.log('TEST', 'test message');
      logger.error('TEST', 'test error', new Error('test'));
      
      assert.strictEqual(logger.enabled, false);
    });

    it('should return valid log path when enabled', () => {
      process.env.LOWKEY_DEBUG = 'true';
      
      delete require.cache[require.resolve('../../lib/debug-logger')];
      const logger = require('../../lib/debug-logger');
      
      const logPath = logger.getLogPath();
      assert.strictEqual(typeof logPath, 'string');
      assert.ok(logPath.includes('lowkey-debug-'));
      assert.ok(logPath.endsWith('.log'));
    });
  });

  describe('case-insensitive sensitivity detection', () => {
    it('should detect sensitive keys regardless of case', () => {
      process.env.LOWKEY_DEBUG = 'true';
      
      delete require.cache[require.resolve('../../lib/debug-logger')];
      const logger = require('../../lib/debug-logger');
      
      const mixedCaseData = {
        PASSWORD: 'secret1',
        Token: 'secret2',
        apiKEY: 'secret3',
        userSecret: 'secret4',
        myCredential: 'secret5',
        normalValue: 'normal'
      };
      
      const sanitized = logger.sanitizeData(mixedCaseData);
      
      assert.strictEqual(sanitized.PASSWORD, '[REDACTED]');
      assert.strictEqual(sanitized.Token, '[REDACTED]');
      assert.strictEqual(sanitized.apiKEY, '[REDACTED]');
      assert.strictEqual(sanitized.userSecret, '[REDACTED]');
      assert.strictEqual(sanitized.myCredential, '[REDACTED]');
      assert.strictEqual(sanitized.normalValue, 'normal');
    });
  });
});