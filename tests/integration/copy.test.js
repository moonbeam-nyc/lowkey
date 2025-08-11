const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { runLowkeyCommand } = require('../helpers/cli-runner');
const { TempFileManager } = require('../helpers/temp-files');

describe('Copy Command Integration Tests', () => {
  let tempFiles;

  beforeEach(() => {
    tempFiles = new TempFileManager();
  });

  afterEach(async () => {
    await tempFiles.cleanup();
  });

  describe('env to json conversion', () => {
    test('copies env file to json format successfully', async () => {
      // Create temp env file
      const envContent = 'DATABASE_URL=postgresql://localhost:5432/test\nAPI_KEY=secret123\nDEBUG=true';
      const envFile = await tempFiles.createTempFile(envContent, '.env');
      const jsonFile = await tempFiles.createTempFile('', '.json');

      const result = await runLowkeyCommand([
        'copy',
        '--input-type', 'env',
        '--input-name', envFile,
        '--output-type', 'json',
        '--output-name', jsonFile
      ]);

      assert.strictEqual(result.code, 0, `Command failed: ${result.stderr}`);
      
      const outputContent = await tempFiles.readTempFile(jsonFile);
      const parsed = JSON.parse(outputContent);
      
      assert.strictEqual(parsed.DATABASE_URL, 'postgresql://localhost:5432/test');
      assert.strictEqual(parsed.API_KEY, 'secret123');
      assert.strictEqual(parsed.DEBUG, 'true');
    });

    test('handles env file with quotes correctly', async () => {
      const envContent = 'SECRET_TOKEN="value with spaces"\nEMPTY_VALUE=\nSPECIAL_CHARS="!@#$%^&*()"';
      const envFile = await tempFiles.createTempFile(envContent, '.env');
      const jsonFile = await tempFiles.createTempFile('', '.json');

      const result = await runLowkeyCommand([
        'copy',
        '--input-type', 'env',
        '--input-name', envFile,
        '--output-type', 'json',
        '--output-name', jsonFile
      ]);

      assert.strictEqual(result.code, 0);
      
      const outputContent = await tempFiles.readTempFile(jsonFile);
      const parsed = JSON.parse(outputContent);
      
      assert.strictEqual(parsed.SECRET_TOKEN, 'value with spaces');
      assert.strictEqual(parsed.EMPTY_VALUE, '');
      assert.strictEqual(parsed.SPECIAL_CHARS, '!@#$%^&*()');
    });
  });

  describe('json to env conversion', () => {
    test('copies json file to env format successfully', async () => {
      const jsonContent = JSON.stringify({
        DATABASE_URL: 'postgresql://localhost:5432/test',
        API_KEY: 'secret123',
        DEBUG: 'true',
        SECRET_TOKEN: 'value with spaces'
      });
      const jsonFile = await tempFiles.createTempFile(jsonContent, '.json');
      const envFile = await tempFiles.createTempFile('', '.env');

      const result = await runLowkeyCommand([
        'copy',
        '--input-type', 'json',
        '--input-name', jsonFile,
        '--output-type', 'env',
        '--output-name', envFile
      ]);

      assert.strictEqual(result.code, 0, `Command failed: ${result.stderr}`);
      
      const outputContent = await tempFiles.readTempFile(envFile);
      
      assert.ok(outputContent.includes('DATABASE_URL="postgresql://localhost:5432/test"'));
      assert.ok(outputContent.includes('API_KEY="secret123"'));
      assert.ok(outputContent.includes('DEBUG="true"'));
      assert.ok(outputContent.includes('SECRET_TOKEN="value with spaces"'));
    });

    test('creates backup file when overwriting existing env file', async () => {
      const jsonContent = JSON.stringify({ NEW_KEY: 'new_value' });
      const originalEnvContent = 'OLD_KEY=old_value';
      
      const jsonFile = await tempFiles.createTempFile(jsonContent, '.json');
      const envFile = await tempFiles.createTempFile(originalEnvContent, '.env');

      const result = await runLowkeyCommand([
        'copy',
        '--input-type', 'json',
        '--input-name', jsonFile,
        '--output-type', 'env',
        '--output-name', envFile
      ]);

      assert.strictEqual(result.code, 0);
      
      // Check that backup file was created
      const backupFile = envFile + '.bak';
      assert.ok(await tempFiles.fileExists(backupFile), 'Backup file should exist');
      
      const backupContent = await tempFiles.readTempFile(backupFile);
      assert.strictEqual(backupContent, originalEnvContent);
      
      // Check that original file was updated
      const newContent = await tempFiles.readTempFile(envFile);
      assert.ok(newContent.includes('NEW_KEY="new_value"'));
    });
  });

  describe('error handling', () => {
    test('fails with helpful message for missing input file', async () => {
      const result = await runLowkeyCommand([
        'copy',
        '--input-type', 'env',
        '--input-name', '/nonexistent/file.env',
        '--output-type', 'json'
      ]);

      assert.notStrictEqual(result.code, 0);
      assert.ok(result.stderr.includes('Error'));
    });

    test('fails with helpful message for invalid input type', async () => {
      const result = await runLowkeyCommand([
        'copy',
        '--input-type', 'invalid-type',
        '--input-name', 'file.txt',
        '--output-type', 'json'
      ]);

      assert.notStrictEqual(result.code, 0);
      assert.ok(result.stderr.includes('invalid-type'));
    });

    test('fails with helpful message for missing required arguments', async () => {
      const result = await runLowkeyCommand([
        'copy',
        '--input-type', 'env'
        // Missing --input-name and --output-type
      ]);

      assert.notStrictEqual(result.code, 0);
      assert.ok(result.stderr.includes('Error') || result.stdout.includes('Usage:'));
    });

    test('rejects nested JSON objects', async () => {
      const invalidJsonContent = JSON.stringify({
        valid_key: 'valid_value',
        nested_object: { should: 'fail' }
      });
      const jsonFile = await tempFiles.createTempFile(invalidJsonContent, '.json');
      const envFile = await tempFiles.createTempFile('', '.env');

      const result = await runLowkeyCommand([
        'copy',
        '--input-type', 'json',
        '--input-name', jsonFile,
        '--output-type', 'env',
        '--output-name', envFile
      ]);

      assert.notStrictEqual(result.code, 0);
      assert.ok(result.stderr.includes('nested') || result.stderr.includes('flat'));
    });
  });

  describe('help and usage', () => {
    test('shows help when --help flag is used', async () => {
      const result = await runLowkeyCommand(['copy', '--help']);

      assert.strictEqual(result.code, 0);
      assert.ok(result.stdout.includes('Usage:'));
      assert.ok(result.stdout.includes('--input-type'));
      assert.ok(result.stdout.includes('--output-type'));
    });
  });
});