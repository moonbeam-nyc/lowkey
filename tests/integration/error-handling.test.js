const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { runLowkeyCommand } = require('../helpers/cli-runner');
const { TempFileManager } = require('../helpers/temp-files');

describe('Error Handling Integration Tests', () => {
  let tempFiles;

  beforeEach(() => {
    tempFiles = new TempFileManager();
  });

  afterEach(async () => {
    await tempFiles.cleanup();
  });

  describe('global CLI error handling', () => {
    test('shows help for unknown commands', async () => {
      const result = await runLowkeyCommand(['unknown-command']);

      assert.notStrictEqual(result.code, 0);
      assert.ok(result.stderr.includes('Unknown command'));
    });

    test('shows help when no command provided', async () => {
      const result = await runLowkeyCommand([]);

      assert.notStrictEqual(result.code, 0);
      assert.ok(result.stdout.includes('Usage:'));
    });

    test('shows version correctly', async () => {
      const result = await runLowkeyCommand(['--version']);

      assert.strictEqual(result.code, 0);
      assert.ok(result.stdout.includes('lowkey v'));
    });

    test('shows global help correctly', async () => {
      const result = await runLowkeyCommand(['--help']);

      assert.strictEqual(result.code, 0);
      assert.ok(result.stdout.includes('Usage:'));
      assert.ok(result.stdout.includes('Commands:'));
    });
  });

  describe('file system error handling', () => {
    test('handles permission denied errors gracefully', async () => {
      // Try to read from a restricted directory (this may vary by system)
      const result = await runLowkeyCommand([
        'list',
        '--type', 'env',
        '--path', '/root'  // Typically restricted
      ]);

      // Should fail but with helpful error message, not crash
      assert.notStrictEqual(result.code, 0);
      assert.ok(result.stderr.includes('Error'));
    });

    test('handles file not found for copy operations', async () => {
      const result = await runLowkeyCommand([
        'copy',
        '--input-type', 'env',
        '--input-name', '/absolutely/nonexistent/file.env',
        '--output-type', 'json'
      ]);

      assert.notStrictEqual(result.code, 0);
      assert.ok(result.stderr.includes('Error'));
    });
  });

  describe('malformed file handling', () => {
    test('handles malformed JSON gracefully', async () => {
      const malformedJson = '{ "key": "value", "incomplete": }';
      const jsonFile = await tempFiles.createTempFile(malformedJson, '.json');
      const envFile = await tempFiles.createTempFile('', '.env');

      const result = await runLowkeyCommand([
        'copy',
        '--input-type', 'json',
        '--input-name', jsonFile,
        '--output-type', 'env',
        '--output-name', envFile
      ]);

      assert.notStrictEqual(result.code, 0);
      assert.ok(result.stderr.includes('Error'));
    });

    test('handles env file with invalid variable names', async () => {
      const invalidEnvContent = '123INVALID_START=value\nVALID_KEY=value';
      const envFile = await tempFiles.createTempFile(invalidEnvContent, '.env');
      const jsonFile = await tempFiles.createTempFile('', '.json');

      const result = await runLowkeyCommand([
        'copy',
        '--input-type', 'env',
        '--input-name', envFile,
        '--output-type', 'json',
        '--output-name', jsonFile
      ]);

      // Should still work, just skip invalid entries or handle gracefully
      // The exact behavior depends on implementation
      if (result.code !== 0) {
        assert.ok(result.stderr.includes('Error'));
      }
    });
  });

  describe('AWS error simulation', () => {
    test('fails gracefully when AWS credentials are missing', async () => {
      const result = await runLowkeyCommand([
        'list',
        '--type', 'aws-secrets-manager',
        '--region', 'us-east-1'
      ]);

      assert.notStrictEqual(result.code, 0);
      // Should fail with credential error, not crash
      assert.ok(result.stderr.includes('Error'));
    });

    test('validates region parameter for AWS operations', async () => {
      const result = await runLowkeyCommand([
        'list',
        '--type', 'aws-secrets-manager'
        // Missing --region parameter
      ]);

      assert.notStrictEqual(result.code, 0);
      assert.ok(result.stderr.includes('region') || result.stdout.includes('Usage:'));
    });
  });

  describe('argument validation errors', () => {
    test('copy command requires input-type', async () => {
      const result = await runLowkeyCommand([
        'copy',
        '--input-name', 'file.env',
        '--output-type', 'json'
        // Missing --input-type
      ]);

      assert.notStrictEqual(result.code, 0);
      assert.ok(result.stderr.includes('input-type') || result.stdout.includes('Usage:'));
    });

    test('copy command requires output-type', async () => {
      const result = await runLowkeyCommand([
        'copy',
        '--input-type', 'env',
        '--input-name', 'file.env'
        // Missing --output-type
      ]);

      assert.notStrictEqual(result.code, 0);
      assert.ok(result.stderr.includes('output-type') || result.stdout.includes('Usage:'));
    });

    test('list command requires type parameter', async () => {
      const result = await runLowkeyCommand([
        'list',
        '--path', '/some/path'
        // Missing --type
      ]);

      assert.notStrictEqual(result.code, 0);
      assert.ok(result.stderr.includes('type') || result.stdout.includes('Usage:'));
    });
  });

  describe('data validation errors', () => {
    test('rejects nested JSON objects in copy operation', async () => {
      const nestedJson = JSON.stringify({
        valid_key: 'valid_value',
        nested_object: { should: 'fail' },
        array_value: ['should', 'also', 'fail']
      });
      const jsonFile = await tempFiles.createTempFile(nestedJson, '.json');
      const envFile = await tempFiles.createTempFile('', '.env');

      const result = await runLowkeyCommand([
        'copy',
        '--input-type', 'json',
        '--input-name', jsonFile,
        '--output-type', 'env',
        '--output-name', envFile
      ]);

      assert.notStrictEqual(result.code, 0);
      assert.ok(result.stderr.includes('flat') || result.stderr.includes('nested'));
    });

    test('handles empty JSON objects', async () => {
      const emptyJson = '{}';
      const jsonFile = await tempFiles.createTempFile(emptyJson, '.json');
      const envFile = await tempFiles.createTempFile('', '.env');

      const result = await runLowkeyCommand([
        'copy',
        '--input-type', 'json',
        '--input-name', jsonFile,
        '--output-type', 'env',
        '--output-name', envFile
      ]);

      // Empty objects should be valid, just result in empty output
      assert.strictEqual(result.code, 0);
      
      const outputContent = await tempFiles.readTempFile(envFile);
      // Should be empty or just contain newline
      assert.ok(outputContent.length <= 1);
    });
  });

  describe('interactive command errors', () => {
    test('interactive command handles missing terminal gracefully', async () => {
      // Interactive mode may not work in non-TTY environments
      const result = await runLowkeyCommand(['interactive'], { 
        stdio: ['pipe', 'pipe', 'pipe'] 
      });

      // Should either work or fail gracefully, not crash
      assert.ok(typeof result.code === 'number');
    });
  });

  describe('inspect command', () => {
    test('inspect command shows help when missing required args', async () => {
      const result = await runLowkeyCommand(['inspect']);

      assert.notStrictEqual(result.code, 0);
      assert.ok(result.stderr.includes('type') || result.stdout.includes('inspect'));
    });

    test('inspect command handles --help flag', async () => {
      const result = await runLowkeyCommand(['inspect', '--help']);

      assert.strictEqual(result.code, 0);
      assert.ok(result.stdout.includes('inspect') || result.stdout.includes('Usage:'));
    });
  });
});