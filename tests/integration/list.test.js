const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { runLowkeyCommand } = require('../helpers/cli-runner');
const { TempFileManager } = require('../helpers/temp-files');

describe('List Command Integration Tests', () => {
  let tempFiles;

  beforeEach(() => {
    tempFiles = new TempFileManager();
  });

  afterEach(async () => {
    await tempFiles.cleanup();
  });

  describe('env file listing', () => {
    test('lists env files in directory', async () => {
      const tempDir = await tempFiles.createTempDir();
      
      // Create test env files
      await tempFiles.createTempFile('KEY1=value1', '.env');
      await tempFiles.createTempFile('KEY2=value2', '.env.local');
      await tempFiles.createTempFile('KEY3=value3', '.env.production');
      
      // Move files to temp directory (simulate directory with env files)
      const fs = require('fs');
      const envFile1 = path.join(tempDir, '.env');
      const envFile2 = path.join(tempDir, '.env.local');
      const envFile3 = path.join(tempDir, '.env.production');
      
      fs.writeFileSync(envFile1, 'KEY1=value1');
      fs.writeFileSync(envFile2, 'KEY2=value2');
      fs.writeFileSync(envFile3, 'KEY3=value3');

      const result = await runLowkeyCommand([
        'list',
        '--type', 'env',
        '--path', tempDir
      ]);

      assert.strictEqual(result.code, 0, `Command failed: ${result.stderr}`);
      assert.ok(result.stdout.includes('.env'));
      assert.ok(result.stdout.includes('.env.local'));
      assert.ok(result.stdout.includes('.env.production'));
    });

    test('handles directory with no env files gracefully', async () => {
      const tempDir = await tempFiles.createTempDir();
      
      const result = await runLowkeyCommand([
        'list',
        '--type', 'env',
        '--path', tempDir
      ]);

      assert.strictEqual(result.code, 0);
      // Should indicate no files found or show empty list
      assert.ok(result.stdout.length >= 0); // Just ensure it doesn't crash
    });
  });

  describe('json file listing', () => {
    test('lists json files in directory excluding standard files', async () => {
      const tempDir = await tempFiles.createTempDir();
      const fs = require('fs');
      
      // Create test files
      fs.writeFileSync(path.join(tempDir, 'secrets.json'), '{"key": "value"}');
      fs.writeFileSync(path.join(tempDir, 'config.json'), '{"config": "value"}');
      fs.writeFileSync(path.join(tempDir, 'package.json'), '{"name": "test"}'); // Should be excluded
      fs.writeFileSync(path.join(tempDir, 'tsconfig.json'), '{"compilerOptions": {}}'); // Should be excluded
      fs.writeFileSync(path.join(tempDir, 'regular.txt'), 'not json'); // Should be ignored

      const result = await runLowkeyCommand([
        'list',
        '--type', 'json',
        '--path', tempDir
      ]);

      assert.strictEqual(result.code, 0, `Command failed: ${result.stderr}`);
      assert.ok(result.stdout.includes('secrets.json'));
      assert.ok(result.stdout.includes('config.json'));
      
      // Should exclude standard config files
      assert.ok(!result.stdout.includes('package.json'));
      assert.ok(!result.stdout.includes('tsconfig.json'));
      assert.ok(!result.stdout.includes('regular.txt'));
    });
  });

  describe('argument validation', () => {
    test('requires type parameter', async () => {
      const result = await runLowkeyCommand(['list']);

      assert.notStrictEqual(result.code, 0);
      assert.ok(result.stderr.includes('type') || result.stdout.includes('Usage:'));
    });

    test('validates supported types', async () => {
      const result = await runLowkeyCommand([
        'list',
        '--type', 'invalid-type'
      ]);

      assert.notStrictEqual(result.code, 0);
      assert.ok(result.stderr.includes('invalid-type') || result.stderr.includes('Unsupported'));
    });

    test('handles missing directory gracefully', async () => {
      const result = await runLowkeyCommand([
        'list',
        '--type', 'env',
        '--path', '/nonexistent/directory'
      ]);

      assert.notStrictEqual(result.code, 0);
      assert.ok(result.stderr.includes('Error'));
    });
  });

  describe('help and usage', () => {
    test('shows help when --help flag is used', async () => {
      const result = await runLowkeyCommand(['list', '--help']);

      assert.strictEqual(result.code, 0);
      assert.ok(result.stdout.includes('Usage:'));
      assert.ok(result.stdout.includes('--type'));
    });
  });

  describe('different storage types', () => {
    test('accepts env type', async () => {
      const tempDir = await tempFiles.createTempDir();
      
      const result = await runLowkeyCommand([
        'list',
        '--type', 'env',
        '--path', tempDir
      ]);

      assert.strictEqual(result.code, 0);
    });

    test('accepts json type', async () => {
      const tempDir = await tempFiles.createTempDir();
      
      const result = await runLowkeyCommand([
        'list',
        '--type', 'json',
        '--path', tempDir
      ]);

      assert.strictEqual(result.code, 0);
    });

    test('accepts aws-secrets-manager type but requires region', async () => {
      // This will fail due to missing AWS credentials in test environment,
      // but should fail with appropriate error message
      const result = await runLowkeyCommand([
        'list',
        '--type', 'aws-secrets-manager',
        '--region', 'us-east-1'
      ], {
        env: {
          ...process.env,
          AWS_ACCESS_KEY_ID: 'invalid',
          AWS_SECRET_ACCESS_KEY: 'invalid',
          AWS_EC2_METADATA_DISABLED: 'true',  // Disable EC2 metadata lookup
          AWS_SHARED_CREDENTIALS_FILE: '/dev/null',  // Disable credential file
          AWS_CONFIG_FILE: '/dev/null'  // Disable config file
        }
      });

      // Command structure should be valid even if AWS call fails
      assert.notStrictEqual(result.code, 0);
      // Should fail due to AWS credentials, not argument parsing
      assert.ok(!result.stderr.includes('Usage:'));
    });
  });
});