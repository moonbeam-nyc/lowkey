const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Import the modules under test
const deleteOps = require('../../lib/providers/delete-operations');

describe('File Delete Integration Tests', () => {
  let tempDir;
  let testFiles;

  beforeEach(async () => {
    // Create temporary directory for test files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lowkey-file-delete-test-'));
    
    // Create comprehensive test files
    testFiles = {
      // Environment files
      'app.env': 'NODE_ENV=production\\nAPI_KEY=secret123\\nDATABASE_URL=postgresql://localhost:5432/app',
      'config.env': 'DEBUG=true\\nLOG_LEVEL=info',
      'secrets.env.local': 'LOCAL_SECRET=dev123\\nTEST_KEY=value',
      'production.env': 'PROD_KEY=prod_secret\\nREDIS_URL=redis://prod-redis:6379',
      '.env': 'DEFAULT_VAR=default_value',
      '.env.development': 'DEV_MODE=true\\nDEV_API=http://dev.api.com',
      '.env.production': 'PROD_MODE=true\\nPROD_API=https://api.example.com',
      '.env.test': 'TEST_MODE=true\\nTEST_DB=test_database',

      // JSON files
      'config.json': JSON.stringify({
        database: { host: 'localhost', port: 5432 },
        api: { url: 'https://api.example.com', key: 'secret' }
      }, null, 2),
      'secrets.json': JSON.stringify({
        apiKey: 'secret123',
        dbPassword: 'db_secret',
        jwtSecret: 'jwt_token_secret'
      }, null, 2),
      'app-settings.json': JSON.stringify({
        theme: 'dark',
        language: 'en',
        notifications: true
      }, null, 2),
      'nested/config.json': JSON.stringify({ nested: 'value' }, null, 2),

      // Non-secret files (should not be deletable)
      'package.json': JSON.stringify({ name: 'test-app', version: '1.0.0' }, null, 2),
      'README.md': '# Test Application\\n\\nThis is a test application.',
      'script.sh': '#!/bin/bash\\necho "Hello World"',
      'data.txt': 'Some text data\\nMultiple lines',
      'image.png': 'PNG_BINARY_DATA_PLACEHOLDER',
      'document.pdf': 'PDF_BINARY_DATA_PLACEHOLDER'
    };

    // Create all test files
    for (const [filename, content] of Object.entries(testFiles)) {
      const filePath = path.join(tempDir, filename);
      const dirPath = path.dirname(filePath);
      
      // Create directory if it doesn't exist
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
      
      fs.writeFileSync(filePath, content);
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

  describe('Environment File Deletion', () => {
    test('should delete standard .env file', async () => {
      const filename = 'app.env';
      const filePath = path.join(tempDir, filename);
      
      // Verify file exists
      assert.strictEqual(fs.existsSync(filePath), true);
      
      // Delete file
      await deleteOps.deleteSecret({
        type: 'env',
        name: filename,
        path: tempDir
      });
      
      // Verify file was deleted
      assert.strictEqual(fs.existsSync(filePath), false);
    });

    test('should delete .env files with various extensions', async () => {
      const envFiles = [
        '.env',
        '.env.development', 
        '.env.production',
        '.env.test',
        'config.env',
        'secrets.env.local',
        'production.env'
      ];

      for (const filename of envFiles) {
        const filePath = path.join(tempDir, filename);
        
        assert.strictEqual(fs.existsSync(filePath), true, `File ${filename} should exist before deletion`);
        
        await deleteOps.deleteSecret({
          type: 'env',
          name: filename,
          path: tempDir
        });
        
        assert.strictEqual(fs.existsSync(filePath), false, `File ${filename} should be deleted`);
      }
    });

    test('should handle env file deletion with absolute paths', async () => {
      const filename = 'config.env';
      const absolutePath = path.resolve(tempDir, filename);
      const directory = path.dirname(absolutePath);
      
      assert.strictEqual(fs.existsSync(absolutePath), true);
      
      await deleteOps.deleteSecret({
        type: 'env',
        name: filename,
        path: directory
      });
      
      assert.strictEqual(fs.existsSync(absolutePath), false);
    });

    test('should reject deletion of non-env files', async () => {
      await assert.rejects(
        () => deleteOps.deleteSecret({
          type: 'env',
          name: 'package.json',
          path: tempDir
        }),
        {
          message: 'Not an environment file: package.json'
        }
      );

      // Verify file still exists
      assert.strictEqual(fs.existsSync(path.join(tempDir, 'package.json')), true);
    });

    test('should handle missing env files gracefully', async () => {
      await assert.rejects(
        () => deleteOps.deleteSecret({
          type: 'env',
          name: 'nonexistent.env',
          path: tempDir
        }),
        {
          message: 'File not found: nonexistent.env'
        }
      );
    });
  });

  describe('JSON File Deletion', () => {
    test('should delete standard JSON files', async () => {
      const jsonFiles = ['config.json', 'secrets.json', 'app-settings.json'];

      for (const filename of jsonFiles) {
        const filePath = path.join(tempDir, filename);
        
        assert.strictEqual(fs.existsSync(filePath), true, `File ${filename} should exist before deletion`);
        
        await deleteOps.deleteSecret({
          type: 'json',
          name: filename,
          path: tempDir
        });
        
        assert.strictEqual(fs.existsSync(filePath), false, `File ${filename} should be deleted`);
      }
    });

    test('should delete JSON files in subdirectories', async () => {
      const filename = 'nested/config.json';
      const filePath = path.join(tempDir, filename);
      
      assert.strictEqual(fs.existsSync(filePath), true);
      
      await deleteOps.deleteSecret({
        type: 'json',
        name: filename,
        path: tempDir
      });
      
      assert.strictEqual(fs.existsSync(filePath), false);
    });

    test('should reject deletion of non-JSON files', async () => {
      const nonJsonFiles = ['README.md', 'script.sh', 'data.txt'];

      for (const filename of nonJsonFiles) {
        await assert.rejects(
          () => deleteOps.deleteSecret({
            type: 'json',
            name: filename,
            path: tempDir
          }),
          {
            message: `Not a JSON file: ${filename}`
          }
        );

        // Verify file still exists
        assert.strictEqual(fs.existsSync(path.join(tempDir, filename)), true);
      }
    });

    test('should handle missing JSON files gracefully', async () => {
      await assert.rejects(
        () => deleteOps.deleteSecret({
          type: 'json',
          name: 'nonexistent.json',
          path: tempDir
        }),
        {
          message: 'File not found: nonexistent.json'
        }
      );
    });
  });

  describe('File System Integration', () => {
    test('should handle concurrent file deletions', async () => {
      const filesToDelete = [
        { type: 'env', name: 'app.env' },
        { type: 'env', name: 'config.env' },
        { type: 'json', name: 'config.json' },
        { type: 'json', name: 'secrets.json' }
      ];

      // Verify all files exist
      filesToDelete.forEach(({ name }) => {
        assert.strictEqual(fs.existsSync(path.join(tempDir, name)), true);
      });

      // Delete all files concurrently
      await Promise.all(
        filesToDelete.map(({ type, name }) =>
          deleteOps.deleteSecret({ type, name, path: tempDir })
        )
      );

      // Verify all files are deleted
      filesToDelete.forEach(({ name }) => {
        assert.strictEqual(fs.existsSync(path.join(tempDir, name)), false);
      });
    });

    test('should handle basic success and failure scenarios', async () => {
      // Test successful deletion
      const successFile = path.join(tempDir, 'success.env');
      fs.writeFileSync(successFile, 'SUCCESS=true');
      
      await deleteOps.deleteSecret({
        type: 'env',
        name: 'success.env',
        path: tempDir
      });
      
      assert.strictEqual(fs.existsSync(successFile), false);
      
      // Test failure scenario
      await assert.rejects(
        () => deleteOps.deleteSecret({
          type: 'env',
          name: 'nonexistent.env',
          path: tempDir
        }),
        {
          message: 'File not found: nonexistent.env'
        }
      );
    });

    test('should preserve directory structure after file deletion', async () => {
      // Delete file in subdirectory
      await deleteOps.deleteSecret({
        type: 'json',
        name: 'nested/config.json',
        path: tempDir
      });

      // Verify file is deleted but directory remains
      assert.strictEqual(fs.existsSync(path.join(tempDir, 'nested/config.json')), false);
      assert.strictEqual(fs.existsSync(path.join(tempDir, 'nested')), true);
    });

    test('should handle relative path resolution', async () => {
      // Test with different relative path formats
      const relativePaths = [
        tempDir,
        path.relative(process.cwd(), tempDir),
        './' + path.relative(process.cwd(), tempDir)
      ];

      let fileCounter = 0;
      for (const relPath of relativePaths) {
        const testFile = `test-relative-${fileCounter}.env`;
        const fullPath = path.join(tempDir, testFile);
        
        // Create test file
        fs.writeFileSync(fullPath, 'TEST=value');
        fileCounter++;

        assert.strictEqual(fs.existsSync(fullPath), true);

        await deleteOps.deleteSecret({
          type: 'env',
          name: testFile,
          path: relPath
        });

        assert.strictEqual(fs.existsSync(fullPath), false);
      }
    });
  });

  describe('Simple File Operations', () => {
    test('should handle basic file operations', async () => {
      // Create and delete a simple file
      const testFile = path.join(tempDir, 'simple.env');
      fs.writeFileSync(testFile, 'SIMPLE=test');
      
      assert.strictEqual(fs.existsSync(testFile), true);
      
      await deleteOps.deleteSecret({
        type: 'env',
        name: 'simple.env',
        path: tempDir
      });
      
      assert.strictEqual(fs.existsSync(testFile), false);
    });
  });

  describe('Basic Error Scenarios', () => {
    test('should handle missing files gracefully', async () => {
      await assert.rejects(
        () => deleteOps.deleteSecret({
          type: 'env',
          name: 'nonexistent.env',
          path: tempDir
        }),
        {
          message: 'File not found: nonexistent.env'
        }
      );
    });
    
    test('should handle invalid file types', async () => {
      const txtFile = path.join(tempDir, 'invalid.txt');
      fs.writeFileSync(txtFile, 'not a secret');
      
      await assert.rejects(
        () => deleteOps.deleteSecret({
          type: 'env',
          name: 'invalid.txt',
          path: tempDir
        }),
        {
          message: 'Not an environment file: invalid.txt'
        }
      );
      
      // File should still exist
      assert.strictEqual(fs.existsSync(txtFile), true);
    });
  });

  describe('Integration with Current Working Directory', () => {
    test('should work when no path is specified (uses CWD)', async () => {
      // Create a test file in the current working directory
      const filename = 'cwd-test.env';
      const cwdPath = path.join(process.cwd(), filename);
      
      try {
        fs.writeFileSync(cwdPath, 'CWD_TEST=true');
        assert.strictEqual(fs.existsSync(cwdPath), true);

        await deleteOps.deleteSecret({
          type: 'env',
          name: filename
          // No path specified - should use current working directory
        });

        assert.strictEqual(fs.existsSync(cwdPath), false);
      } catch (error) {
        // Clean up in case of test failure
        try {
          fs.unlinkSync(cwdPath);
        } catch {}
        throw error;
      }
    });
  });
});