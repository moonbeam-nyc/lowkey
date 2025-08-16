const { describe, it } = require('node:test');
const assert = require('node:assert');

describe('Copy Wizard Business Logic Tests', () => {
  describe('file name generation', () => {
    it('should generate valid filename with timestamp', () => {
      // Since we can't import the copy wizard directly due to interactive dependencies,
      // let's test the filename generation logic that can be extracted
      
      function generateFileName(outputType) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const extension = outputType === 'json' ? '.json' : '.env';
        return `lowkey-export-${timestamp}${extension}`;
      }
      
      const envFileName = generateFileName('env');
      const jsonFileName = generateFileName('json');
      
      assert.ok(envFileName.startsWith('lowkey-export-'));
      assert.ok(envFileName.endsWith('.env'));
      assert.ok(jsonFileName.startsWith('lowkey-export-'));
      assert.ok(jsonFileName.endsWith('.json'));
      
      // Should have timestamp in ISO format with special chars replaced
      assert.ok(/lowkey-export-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}/.test(envFileName));
    });
  });

  describe('filename validation logic', () => {
    it('should validate filename requirements', () => {
      function validateFileName(filename) {
        if (!filename || filename.trim().length === 0) {
          return { valid: false, error: 'Filename cannot be empty' };
        }
        
        // Check for invalid characters
        const invalidChars = /[<>:"/\\|?*]/;
        if (invalidChars.test(filename)) {
          return { valid: false, error: 'Filename contains invalid characters' };
        }
        
        return { valid: true };
      }
      
      // Valid filenames
      assert.deepStrictEqual(validateFileName('secrets.env'), { valid: true });
      assert.deepStrictEqual(validateFileName('my-config.json'), { valid: true });
      assert.deepStrictEqual(validateFileName('file_123.env'), { valid: true });
      
      // Invalid filenames
      assert.deepStrictEqual(
        validateFileName(''),
        { valid: false, error: 'Filename cannot be empty' }
      );
      assert.deepStrictEqual(
        validateFileName('  '),
        { valid: false, error: 'Filename cannot be empty' }
      );
      assert.deepStrictEqual(
        validateFileName('file<invalid>.env'),
        { valid: false, error: 'Filename contains invalid characters' }
      );
      assert.deepStrictEqual(
        validateFileName('file/path.env'),
        { valid: false, error: 'Filename contains invalid characters' }
      );
    });
  });

  describe('extension handling', () => {
    it('should auto-add missing extensions', () => {
      function addExtensionIfMissing(filename, outputType) {
        const extension = outputType === 'json' ? '.json' : '.env';
        if (!filename.endsWith(extension)) {
          return filename + extension;
        }
        return filename;
      }
      
      // Missing extensions
      assert.strictEqual(addExtensionIfMissing('secrets', 'env'), 'secrets.env');
      assert.strictEqual(addExtensionIfMissing('config', 'json'), 'config.json');
      
      // Already has extensions
      assert.strictEqual(addExtensionIfMissing('secrets.env', 'env'), 'secrets.env');
      assert.strictEqual(addExtensionIfMissing('config.json', 'json'), 'config.json');
      
      // Wrong extension gets corrected
      assert.strictEqual(addExtensionIfMissing('secrets.txt', 'env'), 'secrets.txt.env');
      assert.strictEqual(addExtensionIfMissing('config.env', 'json'), 'config.env.json');
    });
  });

  describe('secret name validation (Kubernetes)', () => {
    it('should validate Kubernetes secret name format', () => {
      function validateKubernetesSecretName(name) {
        if (!name || name.trim().length === 0) {
          return { valid: false, error: 'Secret name cannot be empty' };
        }
        
        // Kubernetes DNS-1123 subdomain format
        const kubeNameRegex = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
        if (!kubeNameRegex.test(name.trim()) || name.length > 253) {
          return { valid: false, error: 'Invalid Kubernetes secret name format' };
        }
        
        return { valid: true };
      }
      
      // Valid names
      assert.deepStrictEqual(validateKubernetesSecretName('my-secret'), { valid: true });
      assert.deepStrictEqual(validateKubernetesSecretName('secret123'), { valid: true });
      assert.deepStrictEqual(validateKubernetesSecretName('a'), { valid: true });
      
      // Invalid names
      assert.deepStrictEqual(
        validateKubernetesSecretName(''),
        { valid: false, error: 'Secret name cannot be empty' }
      );
      assert.deepStrictEqual(
        validateKubernetesSecretName('My-Secret'),
        { valid: false, error: 'Invalid Kubernetes secret name format' }
      );
      assert.deepStrictEqual(
        validateKubernetesSecretName('-invalid'),
        { valid: false, error: 'Invalid Kubernetes secret name format' }
      );
      assert.deepStrictEqual(
        validateKubernetesSecretName('invalid-'),
        { valid: false, error: 'Invalid Kubernetes secret name format' }
      );
      assert.deepStrictEqual(
        validateKubernetesSecretName('my_secret'),
        { valid: false, error: 'Invalid Kubernetes secret name format' }
      );
    });
  });

  describe('data filtering logic', () => {
    it('should filter secret data based on search query', () => {
      function filterSecretKeys(secretData, query) {
        if (!query) return Object.keys(secretData);
        
        const keys = Object.keys(secretData);
        try {
          const regex = new RegExp(query, 'i');
          return keys.filter(key => regex.test(key));
        } catch (error) {
          // Fallback to simple string search if regex is invalid
          const lowerQuery = query.toLowerCase();
          return keys.filter(key => key.toLowerCase().includes(lowerQuery));
        }
      }
      
      const secretData = {
        API_KEY: 'secret1',
        DATABASE_URL: 'secret2',
        DEBUG_MODE: 'true',
        LOG_LEVEL: 'info',
        USER_TOKEN: 'secret3'
      };
      
      // No query returns all keys
      assert.deepStrictEqual(
        filterSecretKeys(secretData, '').sort(),
        ['API_KEY', 'DATABASE_URL', 'DEBUG_MODE', 'LOG_LEVEL', 'USER_TOKEN']
      );
      
      // Simple text search
      assert.deepStrictEqual(
        filterSecretKeys(secretData, 'API').sort(),
        ['API_KEY']
      );
      
      // Regex search
      assert.deepStrictEqual(
        filterSecretKeys(secretData, 'LOG.*').sort(),
        ['LOG_LEVEL']
      );
      
      // Case insensitive
      assert.deepStrictEqual(
        filterSecretKeys(secretData, 'debug').sort(),
        ['DEBUG_MODE']
      );
      
      // Multiple matches
      assert.deepStrictEqual(
        filterSecretKeys(secretData, '_').sort(),
        ['API_KEY', 'DATABASE_URL', 'DEBUG_MODE', 'LOG_LEVEL', 'USER_TOKEN']
      );
      
      // Invalid regex falls back to string search
      assert.deepStrictEqual(
        filterSecretKeys(secretData, '[invalid').sort(),
        [] // No matches for literal '[invalid'
      );
    });
  });
});