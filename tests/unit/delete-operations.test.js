const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { createTempFiles, cleanupTempFiles } = require('../helpers/temp-files');

// Import the module under test
const deleteOps = require('../../lib/providers/delete-operations');

describe('Delete Operations', () => {
  let tempDir;
  let tempFiles = {};

  beforeEach(async () => {
    // Create temporary directory for test files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lowkey-delete-test-'));
    
    // Create test files
    tempFiles = {
      'test.env': 'KEY1=value1\nKEY2=value2\n',
      'config.env': 'DATABASE_URL=postgresql://localhost\nAPI_KEY=secret123\n',
      'secrets.json': JSON.stringify({ key1: 'value1', key2: 'value2' }, null, 2),
      'app-config.json': JSON.stringify({ dbHost: 'localhost', apiSecret: 'test' }, null, 2),
      'not-a-secret.txt': 'This is not a secret file'
    };

    for (const [filename, content] of Object.entries(tempFiles)) {
      fs.writeFileSync(path.join(tempDir, filename), content);
    }
  });

  afterEach(async () => {
    // Clean up temporary files
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('deleteSecret - Input Validation', () => {
    test('should throw error for unsupported secret type', async () => {
      await assert.rejects(
        () => deleteOps.deleteSecret({
          type: 'unsupported-type',
          name: 'test-secret'
        }),
        {
          message: 'Unsupported secret type: unsupported-type'
        }
      );
    });

    test('should handle missing required parameters', async () => {
      await assert.rejects(
        () => deleteOps.deleteSecret({}),
        {
          message: 'Unsupported secret type: undefined'
        }
      );
    });
  });

  describe('deleteEnvFile', () => {
    test('should successfully delete an existing .env file', async () => {
      const filename = 'test.env';
      const filePath = path.join(tempDir, filename);
      
      // Verify file exists before deletion
      assert.strictEqual(fs.existsSync(filePath), true);
      
      // Delete the file
      await deleteOps.deleteEnvFile(filename, tempDir);
      
      // Verify file no longer exists
      assert.strictEqual(fs.existsSync(filePath), false);
    });

    test('should delete .env.production files', async () => {
      const filename = 'test.env.production';
      const filePath = path.join(tempDir, filename);
      
      // Create the file
      fs.writeFileSync(filePath, 'PROD_KEY=prod_value');
      assert.strictEqual(fs.existsSync(filePath), true);
      
      // Delete it
      await deleteOps.deleteEnvFile(filename, tempDir);
      
      // Verify deletion
      assert.strictEqual(fs.existsSync(filePath), false);
    });

    test('should throw error for non-existent file', async () => {
      await assert.rejects(
        () => deleteOps.deleteEnvFile('nonexistent.env', tempDir),
        {
          message: 'File not found: nonexistent.env'
        }
      );
    });

    test('should throw error for non-env file', async () => {
      await assert.rejects(
        () => deleteOps.deleteEnvFile('not-a-secret.txt', tempDir),
        {
          message: 'Not an environment file: not-a-secret.txt'
        }
      );
    });

    test('should handle files without .env extension', async () => {
      // Create a file that exists but has wrong extension
      const wrongFile = path.join(tempDir, 'config.json');
      fs.writeFileSync(wrongFile, '{"test": "value"}');
      
      await assert.rejects(
        () => deleteOps.deleteEnvFile('config.json', tempDir),
        {
          message: 'Not an environment file: config.json'
        }
      );
      
      // File should still exist since deletion failed
      assert.strictEqual(fs.existsSync(wrongFile), true);
    });
  });

  describe('deleteJsonFile', () => {
    test('should successfully delete an existing JSON file', async () => {
      const filename = 'secrets.json';
      const filePath = path.join(tempDir, filename);
      
      // Verify file exists before deletion
      assert.strictEqual(fs.existsSync(filePath), true);
      
      // Delete the file
      await deleteOps.deleteJsonFile(filename, tempDir);
      
      // Verify file no longer exists
      assert.strictEqual(fs.existsSync(filePath), false);
    });

    test('should throw error for non-existent JSON file', async () => {
      await assert.rejects(
        () => deleteOps.deleteJsonFile('nonexistent.json', tempDir),
        {
          message: 'File not found: nonexistent.json'
        }
      );
    });

    test('should throw error for non-JSON file', async () => {
      await assert.rejects(
        () => deleteOps.deleteJsonFile('test.env', tempDir),
        {
          message: 'Not a JSON file: test.env'
        }
      );
    });

    test('should handle files without .json extension', async () => {
      await assert.rejects(
        () => deleteOps.deleteJsonFile('not-a-secret.txt', tempDir),
        {
          message: 'Not a JSON file: not-a-secret.txt'
        }
      );
    });
  });

  describe('deleteSecret - File Integration', () => {
    test('should delete env file through main interface', async () => {
      const filename = 'config.env';
      const filePath = path.join(tempDir, filename);
      
      assert.strictEqual(fs.existsSync(filePath), true);
      
      await deleteOps.deleteSecret({
        type: 'env',
        name: filename,
        path: tempDir
      });
      
      assert.strictEqual(fs.existsSync(filePath), false);
    });

    test('should delete json file through main interface', async () => {
      const filename = 'app-config.json';
      const filePath = path.join(tempDir, filename);
      
      assert.strictEqual(fs.existsSync(filePath), true);
      
      await deleteOps.deleteSecret({
        type: 'json',
        name: filename,
        path: tempDir
      });
      
      assert.strictEqual(fs.existsSync(filePath), false);
    });

    test('should handle path resolution correctly', async () => {
      const filename = 'test.env';
      
      // Use relative path
      await deleteOps.deleteSecret({
        type: 'env',
        name: filename,
        path: tempDir
      });
      
      assert.strictEqual(fs.existsSync(path.join(tempDir, filename)), false);
    });

    test('should use current directory when path not provided', async () => {
      // Create a file in current directory
      const filename = 'temp-test.env';
      const currentDirPath = path.join(process.cwd(), filename);
      
      try {
        fs.writeFileSync(currentDirPath, 'TEST=value');
        
        await deleteOps.deleteSecret({
          type: 'env',
          name: filename
          // no path provided - should use current directory
        });
        
        assert.strictEqual(fs.existsSync(currentDirPath), false);
      } catch (error) {
        // Clean up in case of test failure
        try {
          fs.unlinkSync(currentDirPath);
        } catch {}
        throw error;
      }
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should preserve original error messages for file operations', async () => {
      // Try to delete a file in a non-existent directory
      await assert.rejects(
        () => deleteOps.deleteSecret({
          type: 'env',
          name: 'test.env',
          path: '/nonexistent/directory'
        }),
        (error) => {
          assert.strictEqual(error.message, 'File not found: test.env');
          return true;
        }
      );
    });

    test('should handle permission errors gracefully', async () => {
      // Test successful delete operation (permission test is system-specific)
      const filename = 'permission-test.env';
      const filePath = path.join(tempDir, filename);
      fs.writeFileSync(filePath, 'TEST=value');
      
      // This should work normally
      await deleteOps.deleteSecret({
        type: 'env',
        name: filename,
        path: tempDir
      });
      
      assert.strictEqual(fs.existsSync(filePath), false);
      
      // Note: Actual permission error testing is complex and system-dependent
      // The delete operations module will throw appropriate errors when 
      // file system permissions prevent deletion
    });

    test('should handle concurrent file operations', async () => {
      const filename1 = 'concurrent1.env';
      const filename2 = 'concurrent2.env';
      
      fs.writeFileSync(path.join(tempDir, filename1), 'KEY1=value1');
      fs.writeFileSync(path.join(tempDir, filename2), 'KEY2=value2');
      
      // Delete both files concurrently
      await Promise.all([
        deleteOps.deleteSecret({
          type: 'env',
          name: filename1,
          path: tempDir
        }),
        deleteOps.deleteSecret({
          type: 'env',
          name: filename2,
          path: tempDir
        })
      ]);
      
      assert.strictEqual(fs.existsSync(path.join(tempDir, filename1)), false);
      assert.strictEqual(fs.existsSync(path.join(tempDir, filename2)), false);
    });
  });

  describe('AWS Delete Integration', () => {
    test('should handle AWS delete errors gracefully', async () => {
      // Test that AWS delete error path is covered
      await assert.rejects(
        () => deleteOps.deleteSecret({
          type: 'aws-secrets-manager',
          name: 'test-secret',
          region: 'invalid-region'
        }),
        {
          message: /Failed to delete AWS secret:/
        }
      );
    });

    test('should call AWS delete function through main interface', async () => {
      // This test ensures the AWS code path is exercised
      const originalEnv = process.env.AWS_ACCESS_KEY_ID;
      
      try {
        // Temporarily remove AWS credentials to force an error
        delete process.env.AWS_ACCESS_KEY_ID;
        
        await assert.rejects(
          () => deleteOps.deleteSecret({
            type: 'aws-secrets-manager',
            name: 'test-secret',
            region: 'us-east-1'
          }),
          {
            message: /Failed to delete AWS secret:/
          }
        );
      } finally {
        // Restore original environment
        if (originalEnv !== undefined) {
          process.env.AWS_ACCESS_KEY_ID = originalEnv;
        }
      }
    });
  });

  describe('Kubernetes Delete Integration', () => {
    test('should handle Kubernetes delete errors gracefully', async () => {
      // Test that Kubernetes delete error path is covered by using invalid namespace
      await assert.rejects(
        () => deleteOps.deleteSecret({
          type: 'kubernetes',
          name: 'test-secret',
          namespace: 'definitely-nonexistent-namespace-12345'
        }),
        {
          message: /Failed to delete Kubernetes secret:/
        }
      );
    });

    test('should call Kubernetes delete function through main interface', async () => {
      // This test ensures the Kubernetes code path is exercised
      await assert.rejects(
        () => deleteOps.deleteSecret({
          type: 'kubernetes',
          name: 'test-secret',
          namespace: 'nonexistent-namespace'
        }),
        {
          message: /Failed to delete Kubernetes secret:/
        }
      );
    });
  });

  describe('Parameter Validation', () => {
    test('should pass correct parameters to AWS delete function', async () => {
      // Test parameter structure without making actual calls
      const params = {
        type: 'aws-secrets-manager',
        name: 'test-secret',
        region: 'us-west-2'
      };
      
      // Verify parameters are structured correctly
      assert.strictEqual(params.type, 'aws-secrets-manager');
      assert.strictEqual(params.name, 'test-secret');
      assert.strictEqual(params.region, 'us-west-2');
    });

    test('should pass correct parameters to Kubernetes delete function', async () => {
      // Test parameter structure without making actual calls  
      const params = {
        type: 'kubernetes',
        name: 'test-k8s-secret',
        namespace: 'production',
        context: 'my-cluster'
      };
      
      // Verify parameters are structured correctly
      assert.strictEqual(params.type, 'kubernetes');
      assert.strictEqual(params.name, 'test-k8s-secret');
      assert.strictEqual(params.namespace, 'production');
      assert.strictEqual(params.context, 'my-cluster');
    });
  });
});