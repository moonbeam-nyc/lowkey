const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { runLowkeyCommand } = require('../helpers/cli-runner');
const { TempFileManager } = require('../helpers/temp-files');

// Handle AWS SDK v3 hanging connections in test environment
require('../helpers/test-exit');

describe('Copy to AWS Integration Tests', () => {
  let tempFiles;

  beforeEach(() => {
    tempFiles = new TempFileManager();
  });

  afterEach(async () => {
    await tempFiles.cleanup();
  });

  // Skip tests if LocalStack is not configured
  const skipIfNoLocalStack = () => {
    if (!process.env.LOCALSTACK_ENDPOINT) {
      console.log('⚠️  Skipping AWS copy test - LOCALSTACK_ENDPOINT not set');
      return true;
    }
    return false;
  };

  describe('Copy from env to AWS Secrets Manager', () => {
    test('should copy env file to AWS secret in LocalStack', async () => {
      if (skipIfNoLocalStack()) return;

      // Create temp env file with test data
      const envContent = 'DATABASE_URL=postgresql://localhost:5432/test\nAPI_KEY=secret123\nDEBUG=true';
      const envFile = await tempFiles.createTempFile(envContent, '.env');
      const secretName = `test-secret-${Date.now()}`;

      const result = await runLowkeyCommand([
        'copy',
        '--input-type', 'env',
        '--input-name', envFile,
        '--output-type', 'aws-secrets-manager',
        '--output-name', secretName,
        '--region', 'us-east-1',
        '--yes'
      ], {
        env: {
          LOCALSTACK_ENDPOINT: process.env.LOCALSTACK_ENDPOINT,
          AWS_ACCESS_KEY_ID: 'test',
          AWS_SECRET_ACCESS_KEY: 'test',
          AWS_DEFAULT_REGION: 'us-east-1'
        }
      });

      assert.strictEqual(result.code, 0, `Command failed: ${result.stderr}\nStdout: ${result.stdout}`);
      assert.ok(result.stderr.includes('Successfully created') || result.stderr.includes('successfully'), 'Should indicate success');

      // Verify the secret was created by listing secrets
      const listResult = await runLowkeyCommand([
        'list',
        '--type', 'aws-secrets-manager',
        '--region', 'us-east-1'
      ], {
        env: {
          LOCALSTACK_ENDPOINT: process.env.LOCALSTACK_ENDPOINT,
          AWS_ACCESS_KEY_ID: 'test',
          AWS_SECRET_ACCESS_KEY: 'test',
          AWS_DEFAULT_REGION: 'us-east-1'
        }
      });

      assert.strictEqual(listResult.code, 0, `List command failed: ${listResult.stderr}`);
      assert.ok(listResult.stdout.includes(secretName), 'Secret should appear in list');
    });

    test('should copy JSON file to AWS secret in LocalStack', async () => {
      if (skipIfNoLocalStack()) return;

      // Create temp JSON file with test data
      const jsonContent = JSON.stringify({
        DATABASE_URL: 'postgresql://localhost:5432/test',
        API_KEY: 'secret123',
        DEBUG: 'true'
      });
      const jsonFile = await tempFiles.createTempFile(jsonContent, '.json');
      const secretName = `test-json-secret-${Date.now()}`;

      const result = await runLowkeyCommand([
        'copy',
        '--input-type', 'json',
        '--input-name', jsonFile,
        '--output-type', 'aws-secrets-manager',
        '--output-name', secretName,
        '--region', 'us-east-1',
        '--yes'
      ], {
        env: {
          LOCALSTACK_ENDPOINT: process.env.LOCALSTACK_ENDPOINT,
          AWS_ACCESS_KEY_ID: 'test',
          AWS_SECRET_ACCESS_KEY: 'test',
          AWS_DEFAULT_REGION: 'us-east-1'
        }
      });

      assert.strictEqual(result.code, 0, `Command failed: ${result.stderr}\nStdout: ${result.stdout}`);
      assert.ok(result.stderr.includes('Successfully created') || result.stderr.includes('successfully'), 'Should indicate success');
    });

    test('should update existing AWS secret in LocalStack', async () => {
      if (skipIfNoLocalStack()) return;

      const secretName = `test-update-secret-${Date.now()}`;

      // First, create a secret
      const initialContent = JSON.stringify({ INITIAL_KEY: 'initial_value' });
      const initialFile = await tempFiles.createTempFile(initialContent, '.json');

      const createResult = await runLowkeyCommand([
        'copy',
        '--input-type', 'json',
        '--input-name', initialFile,
        '--output-type', 'aws-secrets-manager',
        '--output-name', secretName,
        '--region', 'us-east-1',
        '--yes'
      ], {
        env: {
          LOCALSTACK_ENDPOINT: process.env.LOCALSTACK_ENDPOINT,
          AWS_ACCESS_KEY_ID: 'test',
          AWS_SECRET_ACCESS_KEY: 'test',
          AWS_DEFAULT_REGION: 'us-east-1'
        }
      });

      assert.strictEqual(createResult.code, 0, 'Initial secret creation should succeed');

      // Then update it with new data
      const updateContent = JSON.stringify({ UPDATED_KEY: 'updated_value', NEW_KEY: 'new_value' });
      const updateFile = await tempFiles.createTempFile(updateContent, '.json');

      const updateResult = await runLowkeyCommand([
        'copy',
        '--input-type', 'json',
        '--input-name', updateFile,
        '--output-type', 'aws-secrets-manager',
        '--output-name', secretName,
        '--region', 'us-east-1',
        '--yes'
      ], {
        env: {
          LOCALSTACK_ENDPOINT: process.env.LOCALSTACK_ENDPOINT,
          AWS_ACCESS_KEY_ID: 'test',
          AWS_SECRET_ACCESS_KEY: 'test',
          AWS_DEFAULT_REGION: 'us-east-1'
        }
      });

      assert.strictEqual(updateResult.code, 0, `Update command failed: ${updateResult.stderr}`);
      assert.ok(updateResult.stderr.includes('Successfully') || updateResult.stderr.includes('updated'), 'Should indicate update success');
    });
  });

  describe('Copy to AWS error handling', () => {
    test('should fail when region is not provided', async () => {
      const envContent = 'TEST_KEY=test_value';
      const envFile = await tempFiles.createTempFile(envContent, '.env');

      const result = await runLowkeyCommand([
        'copy',
        '--input-type', 'env',
        '--input-name', envFile,
        '--output-type', 'aws-secrets-manager',
        '--output-name', 'test-secret'
        // Missing --region
      ], {
        env: {
          // Explicitly clear AWS region environment variables to test failure case
          AWS_REGION: undefined,
          AWS_DEFAULT_REGION: undefined
        }
      });

      assert.notStrictEqual(result.code, 0);
      assert.ok(result.stderr.includes('region') || result.stderr.includes('AWS_REGION'), 'Should mention region requirement');
    });

    test('should fail with invalid AWS secret name', async () => {
      if (skipIfNoLocalStack()) return;

      const envContent = 'TEST_KEY=test_value';
      const envFile = await tempFiles.createTempFile(envContent, '.env');

      const result = await runLowkeyCommand([
        'copy',
        '--input-type', 'env',
        '--input-name', envFile,
        '--output-type', 'aws-secrets-manager',
        '--output-name', 'invalid secret name with spaces!',
        '--region', 'us-east-1',
        '--yes'
      ], {
        env: {
          LOCALSTACK_ENDPOINT: process.env.LOCALSTACK_ENDPOINT,
          AWS_ACCESS_KEY_ID: 'test',
          AWS_SECRET_ACCESS_KEY: 'test',
          AWS_DEFAULT_REGION: 'us-east-1'
        }
      });

      assert.notStrictEqual(result.code, 0);
      // Should fail due to invalid secret name format
    });
  });

  describe('Copy from AWS to files', () => {
    test('should copy AWS secret to env file', async () => {
      if (skipIfNoLocalStack()) return;

      // First create a secret with known data
      const secretName = `test-copy-from-aws-${Date.now()}`;
      const initialContent = JSON.stringify({
        DATABASE_URL: 'postgresql://localhost:5432/test',
        API_KEY: 'secret123'
      });
      const initialFile = await tempFiles.createTempFile(initialContent, '.json');

      // Create the secret
      const createResult = await runLowkeyCommand([
        'copy',
        '--input-type', 'json',
        '--input-name', initialFile,
        '--output-type', 'aws-secrets-manager',
        '--output-name', secretName,
        '--region', 'us-east-1',
        '--yes'
      ], {
        env: {
          LOCALSTACK_ENDPOINT: process.env.LOCALSTACK_ENDPOINT,
          AWS_ACCESS_KEY_ID: 'test',
          AWS_SECRET_ACCESS_KEY: 'test',
          AWS_DEFAULT_REGION: 'us-east-1'
        }
      });

      assert.strictEqual(createResult.code, 0, 'Secret creation should succeed');

      // Now copy from AWS to env file
      const envFile = await tempFiles.createTempFile('', '.env');

      const copyResult = await runLowkeyCommand([
        'copy',
        '--input-type', 'aws-secrets-manager',
        '--input-name', secretName,
        '--output-type', 'env',
        '--output-name', envFile,
        '--region', 'us-east-1'
      ], {
        env: {
          LOCALSTACK_ENDPOINT: process.env.LOCALSTACK_ENDPOINT,
          AWS_ACCESS_KEY_ID: 'test',
          AWS_SECRET_ACCESS_KEY: 'test',
          AWS_DEFAULT_REGION: 'us-east-1'
        }
      });

      assert.strictEqual(copyResult.code, 0, `Copy from AWS failed: ${copyResult.stderr}`);
      
      // Verify the env file contains the expected data
      const envContent = await tempFiles.readTempFile(envFile);
      assert.ok(envContent.includes('DATABASE_URL='), 'Should contain DATABASE_URL');
      assert.ok(envContent.includes('API_KEY='), 'Should contain API_KEY');
    });
  });
});