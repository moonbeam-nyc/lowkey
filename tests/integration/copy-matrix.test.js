const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('Copy Command Matrix Tests - All Type Combinations', () => {
  let testDir;
  const cliPath = path.join(__dirname, '../../cli.js');
  
  beforeEach(() => {
    // Create a temporary test directory
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lowkey-matrix-test-'));
    process.chdir(testDir);
  });

  afterEach(() => {
    // Clean up test directory
    process.chdir(__dirname);
    if (testDir && fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  // Test data to use across all tests
  const testData = {
    TEST_KEY: 'test_value',
    API_KEY: 'secret123',
    DATABASE_URL: 'postgres://localhost/test'
  };

  const testEnvContent = Object.entries(testData)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const testJsonContent = JSON.stringify(testData, null, 2);

  // Helper function to create test files
  function createTestFile(filename, content) {
    fs.writeFileSync(path.join(testDir, filename), content);
  }

  // Helper function to read and parse files
  function readJsonFile(filename) {
    const content = fs.readFileSync(path.join(testDir, filename), 'utf8');
    return JSON.parse(content);
  }

  function readEnvFile(filename) {
    const content = fs.readFileSync(path.join(testDir, filename), 'utf8');
    const result = {};
    content.split('\n').forEach(line => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        let value = match[2];
        // Remove surrounding quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        result[match[1]] = value;
      }
    });
    return result;
  }

  // Helper to run copy command
  function runCopy(inputType, inputName, outputType, outputName, additionalArgs = '') {
    const cmd = `node "${cliPath}" copy --input-type ${inputType} --input-name ${inputName} --output-type ${outputType} ${outputName ? `--output-name ${outputName}` : ''} ${additionalArgs}`;
    // Redirect stderr to stdout to capture success messages that go to console.error
    const cmdWithStderr = cmd + ' 2>&1';
    try {
      return execSync(cmdWithStderr, { cwd: testDir, encoding: 'utf8' });
    } catch (error) {
      // Re-throw with the captured output for better error messages
      const output = error.stdout || error.message;
      const newError = new Error(output);
      newError.stdout = error.stdout;
      newError.stderr = error.stderr;
      newError.status = error.status;
      throw newError;
    }
  }

  describe('env to env (same type copy)', () => {
    test('should copy env file to another env file', () => {
      createTestFile('source.env', testEnvContent);
      
      runCopy('env', 'source.env', 'env', 'target.env');
      
      assert(fs.existsSync(path.join(testDir, 'target.env')));
      const result = readEnvFile('target.env');
      assert.deepStrictEqual(result, testData);
    });

    test('should create backup when overwriting env file', () => {
      createTestFile('source.env', testEnvContent);
      createTestFile('target.env', 'OLD_KEY=old_value');
      
      runCopy('env', 'source.env', 'env', 'target.env', '-y');
      
      assert(fs.existsSync(path.join(testDir, 'target.env.bak')));
      const backup = readEnvFile('target.env.bak');
      assert.strictEqual(backup.OLD_KEY, 'old_value');
    });
  });

  describe('json to json (same type copy)', () => {
    test('should copy json file to another json file', () => {
      createTestFile('source.json', testJsonContent);
      
      runCopy('json', 'source.json', 'json', 'target.json');
      
      assert(fs.existsSync(path.join(testDir, 'target.json')));
      const result = readJsonFile('target.json');
      assert.deepStrictEqual(result, testData);
    });

    test('should create backup when overwriting json file', () => {
      createTestFile('source.json', testJsonContent);
      createTestFile('target.json', '{"OLD_KEY": "old_value"}');
      
      runCopy('json', 'source.json', 'json', 'target.json', '-y');
      
      assert(fs.existsSync(path.join(testDir, 'target.json.bak')));
      const backup = readJsonFile('target.json.bak');
      assert.strictEqual(backup.OLD_KEY, 'old_value');
    });
  });

  describe('env to json conversion', () => {
    test('should convert env to json format', () => {
      createTestFile('source.env', testEnvContent);
      
      runCopy('env', 'source.env', 'json', 'target.json');
      
      const result = readJsonFile('target.json');
      assert.deepStrictEqual(result, testData);
    });

    test('should handle env values with quotes', () => {
      createTestFile('source.env', 'QUOTED="value with spaces"\nSINGLE=\'single quotes\'');
      
      runCopy('env', 'source.env', 'json', 'target.json');
      
      const result = readJsonFile('target.json');
      assert.strictEqual(result.QUOTED, 'value with spaces');
      assert.strictEqual(result.SINGLE, 'single quotes');
    });
  });

  describe('json to env conversion', () => {
    test('should convert json to env format', () => {
      createTestFile('source.json', testJsonContent);
      
      runCopy('json', 'source.json', 'env', 'target.env');
      
      const result = readEnvFile('target.env');
      assert.deepStrictEqual(result, testData);
    });

    test('should escape special characters in env output', () => {
      createTestFile('source.json', '{"KEY_WITH_SPACES": "value with spaces", "KEY_WITH_QUOTES": "value\\"with\\"quotes"}');
      
      runCopy('json', 'source.json', 'env', 'target.env');
      
      const content = fs.readFileSync(path.join(testDir, 'target.env'), 'utf8');
      assert(content.includes('KEY_WITH_SPACES="value with spaces"'));
      assert(content.includes('KEY_WITH_QUOTES="value\\"with\\"quotes"'));
    });
  });

  // AWS tests (skipped if no LocalStack)
  describe('env to aws-secrets-manager', () => {
    test('should copy env to AWS (requires LocalStack)', () => {
      if (!process.env.LOCALSTACK_ENDPOINT) {
        console.log('# ⚠️  Skipping AWS test - LOCALSTACK_ENDPOINT not set');
        return;
      }
      
      createTestFile('source.env', testEnvContent);
      
      const timestamp = Date.now();
      const output = runCopy('env', 'source.env', 'aws-secrets-manager', `test-secret-${timestamp}`, '--region us-east-1 -y');
      assert(output.includes('Successfully') || output.includes('created'));
    });
  });

  describe('json to aws-secrets-manager', () => {
    test('should copy json to AWS (requires LocalStack)', () => {
      if (!process.env.LOCALSTACK_ENDPOINT) {
        console.log('# ⚠️  Skipping AWS test - LOCALSTACK_ENDPOINT not set');
        return;
      }
      
      createTestFile('source.json', testJsonContent);
      
      const timestamp = Date.now();
      const output = runCopy('json', 'source.json', 'aws-secrets-manager', `test-secret-${timestamp}`, '--region us-east-1 -y');
      assert(output.includes('Successfully') || output.includes('created'));
    });
  });

  describe('aws-secrets-manager to env', () => {
    test('should copy AWS to env (requires LocalStack)', () => {
      if (!process.env.LOCALSTACK_ENDPOINT) {
        console.log('# ⚠️  Skipping AWS test - LOCALSTACK_ENDPOINT not set');
        return;
      }
      
      // First create a secret in AWS
      const timestamp = Date.now();
      createTestFile('source.json', testJsonContent);
      runCopy('json', 'source.json', 'aws-secrets-manager', `test-secret-${timestamp}`, '--region us-east-1 -y');
      
      // Then copy it back to env
      runCopy('aws-secrets-manager', `test-secret-${timestamp}`, 'env', 'target.env', '--region us-east-1');
      
      const result = readEnvFile('target.env');
      assert.deepStrictEqual(result, testData);
    });
  });

  describe('aws-secrets-manager to json', () => {
    test('should copy AWS to json (requires LocalStack)', () => {
      if (!process.env.LOCALSTACK_ENDPOINT) {
        console.log('# ⚠️  Skipping AWS test - LOCALSTACK_ENDPOINT not set');
        return;
      }
      
      // First create a secret in AWS
      const timestamp = Date.now();
      createTestFile('source.json', testJsonContent);
      runCopy('json', 'source.json', 'aws-secrets-manager', `test-secret-${timestamp}`, '--region us-east-1 -y');
      
      // Then copy it back to json
      runCopy('aws-secrets-manager', `test-secret-${timestamp}`, 'json', 'target.json', '--region us-east-1');
      
      const result = readJsonFile('target.json');
      assert.deepStrictEqual(result, testData);
    });
  });

  describe('aws-secrets-manager to aws-secrets-manager (same type)', () => {
    test('should copy AWS secret to another AWS secret (requires LocalStack)', () => {
      if (!process.env.LOCALSTACK_ENDPOINT) {
        console.log('# ⚠️  Skipping AWS test - LOCALSTACK_ENDPOINT not set');
        return;
      }
      
      // First create a secret in AWS
      const timestamp = Date.now();
      createTestFile('source.json', testJsonContent);
      runCopy('json', 'source.json', 'aws-secrets-manager', `source-secret-${timestamp}`, '--region us-east-1 -y');
      
      // Copy to another AWS secret
      const output = runCopy('aws-secrets-manager', `source-secret-${timestamp}`, 'aws-secrets-manager', `target-secret-${timestamp}`, '--region us-east-1 -y');
      assert(output.includes('Successfully') || output.includes('created'));
    });
  });

  // Kubernetes tests (requires kubectl)
  describe('env to kubernetes', () => {
    test('should copy env to Kubernetes (requires kubectl)', () => {
      try {
        execSync('kubectl version --client', { stdio: 'ignore' });
      } catch {
        console.log('# ⚠️  Skipping Kubernetes test - kubectl not available');
        return;
      }
      
      createTestFile('source.env', testEnvContent);
      
      try {
        const output = runCopy('env', 'source.env', 'kubernetes', 'test-secret', '--namespace default -y');
        assert(output.includes('Successfully') || output.includes('created'));
      } catch (error) {
        // If no cluster is configured, that's ok
        if (error.message && (error.message.includes('no configuration') || 
            error.message.includes('connection refused') ||
            error.message.includes('cluster') ||
            error.message.includes('kubectl'))) {
          console.log('# ⚠️  Skipping Kubernetes test - no cluster configured');
          return;
        }
        throw error;
      }
    });
  });

  describe('json to kubernetes', () => {
    test('should copy json to Kubernetes (requires kubectl)', () => {
      try {
        execSync('kubectl version --client', { stdio: 'ignore' });
      } catch {
        console.log('# ⚠️  Skipping Kubernetes test - kubectl not available');
        return;
      }
      
      createTestFile('source.json', testJsonContent);
      
      try {
        const output = runCopy('json', 'source.json', 'kubernetes', 'test-secret', '--namespace default -y');
        assert(output.includes('Successfully') || output.includes('created'));
      } catch (error) {
        // If no cluster is configured, that's ok
        if (error.message && (error.message.includes('no configuration') || 
            error.message.includes('connection refused') ||
            error.message.includes('cluster') ||
            error.message.includes('kubectl'))) {
          console.log('# ⚠️  Skipping Kubernetes test - no cluster configured');
          return;
        }
        throw error;
      }
    });
  });

  describe('kubernetes to env', () => {
    test('should copy Kubernetes to env (requires kubectl and cluster)', () => {
      try {
        execSync('kubectl version --client', { stdio: 'ignore' });
      } catch {
        console.log('# ⚠️  Skipping Kubernetes test - kubectl not available');
        return;
      }
      
      try {
        // First create a secret
        createTestFile('source.json', testJsonContent);
        runCopy('json', 'source.json', 'kubernetes', 'test-secret', '--namespace default -y');
        
        // Then copy it back
        runCopy('kubernetes', 'test-secret', 'env', 'target.env', '--namespace default');
        
        const result = readEnvFile('target.env');
        assert.deepStrictEqual(result, testData);
      } catch (error) {
        if (error.message.includes('no configuration') || error.message.includes('connection refused')) {
          console.log('# ⚠️  Skipping Kubernetes test - no cluster configured');
          return;
        }
        throw error;
      }
    });
  });

  describe('kubernetes to json', () => {
    test('should copy Kubernetes to json (requires kubectl and cluster)', () => {
      try {
        execSync('kubectl version --client', { stdio: 'ignore' });
      } catch {
        console.log('# ⚠️  Skipping Kubernetes test - kubectl not available');
        return;
      }
      
      try {
        // First create a secret
        createTestFile('source.json', testJsonContent);
        runCopy('json', 'source.json', 'kubernetes', 'test-secret', '--namespace default -y');
        
        // Then copy it back
        runCopy('kubernetes', 'test-secret', 'json', 'target.json', '--namespace default');
        
        const result = readJsonFile('target.json');
        assert.deepStrictEqual(result, testData);
      } catch (error) {
        if (error.message.includes('no configuration') || error.message.includes('connection refused')) {
          console.log('# ⚠️  Skipping Kubernetes test - no cluster configured');
          return;
        }
        throw error;
      }
    });
  });

  describe('kubernetes to kubernetes (same type)', () => {
    test('should copy Kubernetes secret to another secret (requires kubectl and cluster)', () => {
      try {
        execSync('kubectl version --client', { stdio: 'ignore' });
      } catch {
        console.log('# ⚠️  Skipping Kubernetes test - kubectl not available');
        return;
      }
      
      try {
        // First create a secret
        createTestFile('source.json', testJsonContent);
        runCopy('json', 'source.json', 'kubernetes', 'source-secret', '--namespace default -y');
        
        // Copy to another secret
        const output = runCopy('kubernetes', 'source-secret', 'kubernetes', 'target-secret', '--namespace default');
        assert(output.includes('Successfully') || output.includes('created'));
      } catch (error) {
        if (error.message && (error.message.includes('no configuration') || 
            error.message.includes('connection refused') ||
            error.message.includes('cluster') ||
            error.message.includes('kubectl'))) {
          console.log('# ⚠️  Skipping Kubernetes test - no cluster configured');
          return;
        }
        throw error;
      }
    });
  });

  describe('aws-secrets-manager to kubernetes', () => {
    test('should copy AWS to Kubernetes (requires both)', () => {
      if (!process.env.LOCALSTACK_ENDPOINT) {
        console.log('# ⚠️  Skipping cross-platform test - LOCALSTACK_ENDPOINT not set');
        return;
      }
      
      try {
        execSync('kubectl version --client', { stdio: 'ignore' });
      } catch {
        console.log('# ⚠️  Skipping cross-platform test - kubectl not available');
        return;
      }
      
      try {
        // Create AWS secret
        createTestFile('source.json', testJsonContent);
        runCopy('json', 'source.json', 'aws-secrets-manager', 'aws-secret', '--region us-east-1 -y');
        
        // Copy to Kubernetes
        const output = runCopy('aws-secrets-manager', 'aws-secret', 'kubernetes', 'k8s-secret', '--region us-east-1 --namespace default');
        assert(output.includes('Successfully') || output.includes('created'));
      } catch (error) {
        if (error.message.includes('no configuration') || error.message.includes('connection refused')) {
          console.log('# ⚠️  Skipping cross-platform test - no cluster configured');
          return;
        }
        throw error;
      }
    });
  });

  describe('kubernetes to aws-secrets-manager', () => {
    test('should copy Kubernetes to AWS (requires both)', () => {
      if (!process.env.LOCALSTACK_ENDPOINT) {
        console.log('# ⚠️  Skipping cross-platform test - LOCALSTACK_ENDPOINT not set');
        return;
      }
      
      try {
        execSync('kubectl version --client', { stdio: 'ignore' });
      } catch {
        console.log('# ⚠️  Skipping cross-platform test - kubectl not available');
        return;
      }
      
      try {
        // Create Kubernetes secret
        const timestamp = Date.now();
        createTestFile('source.json', testJsonContent);
        runCopy('json', 'source.json', 'kubernetes', `k8s-secret-${timestamp}`, '--namespace default -y');
        
        // Copy to AWS
        const output = runCopy('kubernetes', `k8s-secret-${timestamp}`, 'aws-secrets-manager', `aws-secret-${timestamp}`, '--namespace default --region us-east-1 -y');
        assert(output.includes('Successfully') || output.includes('created'));
      } catch (error) {
        if (error.message.includes('no configuration') || error.message.includes('connection refused')) {
          console.log('# ⚠️  Skipping cross-platform test - no cluster configured');
          return;
        }
        throw error;
      }
    });
  });

  describe('error cases', () => {
    test('should fail gracefully when source file does not exist', () => {
      assert.throws(() => {
        runCopy('env', 'nonexistent.env', 'json', 'target.json');
      }, /not found|does not exist/i);
    });

    test('should fail when copying nested JSON', () => {
      createTestFile('nested.json', '{"parent": {"child": "value"}}');
      
      assert.throws(() => {
        runCopy('json', 'nested.json', 'env', 'target.env');
      }, /nested|flat/i);
    });

    test('should require region for AWS operations', () => {
      createTestFile('source.env', testEnvContent);
      
      // Temporarily unset AWS region environment variables for this test
      const originalRegion = process.env.AWS_DEFAULT_REGION;
      const originalAwsRegion = process.env.AWS_REGION;
      delete process.env.AWS_DEFAULT_REGION;
      delete process.env.AWS_REGION;
      
      try {
        assert.throws(() => {
          runCopy('env', 'source.env', 'aws-secrets-manager', 'test-secret');
        }, /region/i);
      } finally {
        // Restore environment variables
        if (originalRegion) process.env.AWS_DEFAULT_REGION = originalRegion;
        if (originalAwsRegion) process.env.AWS_REGION = originalAwsRegion;
      }
    });

    test('should require namespace for Kubernetes operations', () => {
      createTestFile('source.env', testEnvContent);
      
      assert.throws(() => {
        runCopy('env', 'source.env', 'kubernetes', 'test-secret');
      }, /namespace/i);
    });
  });
});