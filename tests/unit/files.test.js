const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { TempFileManager } = require('../helpers/temp-files');
const { validateEnvKey, escapeEnvValue, fetchFromEnvFile } = require('../../lib/providers/files');

describe('files.js unit tests', () => {
  let tempFiles;

  beforeEach(() => {
    tempFiles = new TempFileManager();
  });

  afterEach(async () => {
    await tempFiles.cleanup();
  });

  describe('validateEnvKey', () => {
    test('accepts valid environment variable keys', () => {
      const validKeys = [
        'VALID_KEY',
        '_UNDERSCORE_START',
        'MiXeD_CaSe_123',
        'A',
        '_',
        'KEY123',
        'key_with_underscores'
      ];
      
      validKeys.forEach(key => {
        assert.ok(validateEnvKey(key), `Should accept key: ${key}`);
      });
    });

    test('rejects invalid environment variable keys', () => {
      const invalidKeys = [
        '123STARTS_WITH_NUMBER',
        'INVALID SPACES',
        'INVALID-DASHES',
        'INVALID.DOTS',
        '',
        'INVALID@SYMBOL',
        'INVALID$DOLLAR',
        'INVALID%PERCENT'
      ];
      
      invalidKeys.forEach(key => {
        assert.ok(!validateEnvKey(key), `Should reject key: ${key}`);
      });
    });
  });

  describe('escapeEnvValue', () => {
    test('always quotes values for safety', () => {
      assert.strictEqual(escapeEnvValue('simple'), '"simple"');
      assert.strictEqual(escapeEnvValue(''), '""');
      assert.strictEqual(escapeEnvValue('123'), '"123"');
    });

    test('escapes special characters', () => {
      assert.strictEqual(escapeEnvValue('has "quotes"'), '"has \\"quotes\\""');
      assert.strictEqual(escapeEnvValue('has\\backslash'), '"has\\\\backslash"');
      assert.strictEqual(escapeEnvValue('has\nnewline'), '"has\\nnewline"');
      assert.strictEqual(escapeEnvValue('has\rcarriage'), '"has\\rcarriage"');
    });

    test('handles different value types', () => {
      assert.strictEqual(escapeEnvValue(123), '"123"');
      assert.strictEqual(escapeEnvValue(true), '"true"');
      assert.strictEqual(escapeEnvValue(false), '"false"');
      assert.strictEqual(escapeEnvValue(null), '"null"');
      assert.strictEqual(escapeEnvValue(undefined), '"undefined"');
    });

    test('handles complex combinations', () => {
      const complexValue = 'Mix of "quotes", \\backslashes, and\nnewlines';
      const result = escapeEnvValue(complexValue);
      assert.strictEqual(result, '"Mix of \\"quotes\\", \\\\backslashes, and\\nnewlines"');
    });
  });

  describe('fetchFromEnvFile', () => {
    test('parses basic env file format', async () => {
      const envContent = 'KEY1=value1\nKEY2=value2\nKEY3=value3';
      const envFile = await tempFiles.createTempFile(envContent, '.env');

      const result = fetchFromEnvFile(envFile);
      const parsed = JSON.parse(result);

      assert.deepStrictEqual(parsed, {
        KEY1: 'value1',
        KEY2: 'value2',
        KEY3: 'value3'
      });
    });

    test('handles quoted values', async () => {
      const envContent = 'QUOTED="value with spaces"\nSINGLE=\'single quoted\'\nNOQUOTES=noquotes';
      const envFile = await tempFiles.createTempFile(envContent, '.env');

      const result = fetchFromEnvFile(envFile);
      const parsed = JSON.parse(result);

      assert.strictEqual(parsed.QUOTED, 'value with spaces');
      assert.strictEqual(parsed.SINGLE, 'single quoted');
      assert.strictEqual(parsed.NOQUOTES, 'noquotes');
    });

    test('handles escape sequences in quoted values', async () => {
      const envContent = 'ESCAPED="has \\"quotes\\" and \\n newlines"';
      const envFile = await tempFiles.createTempFile(envContent, '.env');

      const result = fetchFromEnvFile(envFile);
      const parsed = JSON.parse(result);

      assert.strictEqual(parsed.ESCAPED, 'has "quotes" and \n newlines');
    });

    test('ignores comments and empty lines', async () => {
      const envContent = `
# This is a comment
KEY1=value1

# Another comment
KEY2=value2

      `.trim();
      const envFile = await tempFiles.createTempFile(envContent, '.env');

      const result = fetchFromEnvFile(envFile);
      const parsed = JSON.parse(result);

      assert.deepStrictEqual(parsed, {
        KEY1: 'value1',
        KEY2: 'value2'
      });
    });

    test('handles empty values', async () => {
      const envContent = 'EMPTY_VALUE=\nEMPTY_QUOTED=""\nNORMAL=value';
      const envFile = await tempFiles.createTempFile(envContent, '.env');

      const result = fetchFromEnvFile(envFile);
      const parsed = JSON.parse(result);

      assert.strictEqual(parsed.EMPTY_VALUE, '');
      assert.strictEqual(parsed.EMPTY_QUOTED, '');
      assert.strictEqual(parsed.NORMAL, 'value');
    });

    test('throws error for nonexistent file', () => {
      assert.throws(() => {
        fetchFromEnvFile('/nonexistent/file.env');
      }, /Env file not found/);
    });
  });
});