const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const { 
  setupTestSecrets, 
  cleanupTestSecrets, 
  isLocalStackReady, 
  waitForLocalStack 
} = require('../helpers/localstack');
const { fetchFromAwsSecretsManager, uploadToAwsSecretsManager, listAwsSecrets } = require('../../lib/providers/aws');

// Only run LocalStack tests if LOCALSTACK_ENDPOINT is set
const shouldRunLocalStackTests = !!process.env.LOCALSTACK_ENDPOINT;

function skipIfNoLocalStack(testName) {
  if (!shouldRunLocalStackTests) {
    console.log(`⚠️  Skipping LocalStack test "${testName}" - LOCALSTACK_ENDPOINT not set`);
    return true;
  }
  return false;
}

describe('LocalStack AWS Integration Tests', () => {
  let localStackReady = false;
  
  before(async () => {
    if (skipIfNoLocalStack('setup')) return;
    
    console.log('🔄 Checking LocalStack availability...');
    
    // Wait for LocalStack to be ready (max 2 minutes)
    localStackReady = await waitForLocalStack(120000, 5000);
    
    if (!localStackReady) {
      console.log('❌ LocalStack not ready after 2 minutes - skipping tests');
      console.log('💡 Make sure LocalStack is running: make localstack-start');
      return;
    }
    
    console.log('✅ LocalStack is ready, setting up test secrets...');
    await setupTestSecrets();
    console.log('✅ Test environment ready');
  });
  
  after(async () => {
    if (skipIfNoLocalStack('cleanup') || !localStackReady) return;
    
    console.log('🧹 Cleaning up test secrets...');
    await cleanupTestSecrets();
  });
  
  describe('AWS Secrets Manager with LocalStack', () => {
    test('should fetch secrets from LocalStack', async () => {
      if (skipIfNoLocalStack('fetch secrets') || !localStackReady) return;
      
      const secretString = await fetchFromAwsSecretsManager('test-secret', 'us-east-1', 'AWSCURRENT');
      const secretData = JSON.parse(secretString);
      
      assert.strictEqual(secretData.username, 'testuser');
      assert.strictEqual(secretData.password, 'testpass');
      assert.strictEqual(secretData.api_key, 'test123');
    });
    
    test('should list secrets in LocalStack', async () => {
      if (skipIfNoLocalStack('list secrets') || !localStackReady) return;
      
      const secrets = await listAwsSecrets('us-east-1');
      
      assert(Array.isArray(secrets), 'Should return an array of secrets');
      assert(secrets.length >= 3, 'Should have at least 3 test secrets');
      
      const secretNames = secrets.map(s => s.Name);
      assert(secretNames.includes('test-secret'), 'Should include test-secret');
      assert(secretNames.includes('test-env-secret'), 'Should include test-env-secret');
      assert(secretNames.includes('test-simple-secret'), 'Should include test-simple-secret');
    });
    
    test('should upload new secrets to LocalStack', async () => {
      if (skipIfNoLocalStack('upload secrets') || !localStackReady) return;
      
      const newSecretData = {
        database_host: 'localhost',
        database_port: '5432',
        database_name: 'testdb'
      };
      
      // Upload new secret (auto-yes to create)
      const result = await uploadToAwsSecretsManager(
        newSecretData, 
        'test-new-secret', 
        'us-east-1', 
        'AWSCURRENT', 
        true
      );
      
      assert(result.includes('Successfully'), 'Should indicate successful upload');
      
      // Verify the secret was created by fetching it
      const fetchedSecretString = await fetchFromAwsSecretsManager('test-new-secret', 'us-east-1', 'AWSCURRENT');
      const fetchedSecretData = JSON.parse(fetchedSecretString);
      
      assert.strictEqual(fetchedSecretData.database_host, 'localhost');
      assert.strictEqual(fetchedSecretData.database_port, '5432');
      assert.strictEqual(fetchedSecretData.database_name, 'testdb');
    });
    
    test('should update existing secrets in LocalStack', async () => {
      if (skipIfNoLocalStack('update secrets') || !localStackReady) return;
      
      const updatedSecretData = {
        username: 'updateduser',
        password: 'updatedpass',
        api_key: 'updated123',
        new_field: 'new_value'
      };
      
      // Update existing secret
      const result = await uploadToAwsSecretsManager(
        updatedSecretData, 
        'test-secret', 
        'us-east-1', 
        'AWSCURRENT', 
        true
      );
      
      assert(result.includes('Successfully'), 'Should indicate successful upload');
      
      // Verify the secret was updated by fetching it
      const fetchedSecretString = await fetchFromAwsSecretsManager('test-secret', 'us-east-1', 'AWSCURRENT');
      const fetchedSecretData = JSON.parse(fetchedSecretString);
      
      assert.strictEqual(fetchedSecretData.username, 'updateduser');
      assert.strictEqual(fetchedSecretData.password, 'updatedpass');
      assert.strictEqual(fetchedSecretData.api_key, 'updated123');
      assert.strictEqual(fetchedSecretData.new_field, 'new_value');
    });
    
    test('should handle non-existent secrets gracefully', async () => {
      if (skipIfNoLocalStack('handle errors') || !localStackReady) return;
      
      try {
        await fetchFromAwsSecretsManager('non-existent-secret', 'us-east-1', 'AWSCURRENT');
        assert.fail('Should have thrown an error for non-existent secret');
      } catch (error) {
        assert(error.message.includes('not found'), 'Should indicate secret not found');
      }
    });
    
    test('should work with environment variable secrets', async () => {
      if (skipIfNoLocalStack('env var secrets') || !localStackReady) return;
      
      const secretString = await fetchFromAwsSecretsManager('test-env-secret', 'us-east-1', 'AWSCURRENT');
      const secretData = JSON.parse(secretString);
      
      assert.strictEqual(secretData.DATABASE_URL, 'postgresql://localhost:5432/testdb');
      assert.strictEqual(secretData.API_KEY, 'sk-test123');
      assert.strictEqual(secretData.DEBUG, 'true');
    });
  });
  
  describe('LocalStack Connection Tests', () => {
    test('should detect LocalStack endpoint configuration', async () => {
      if (skipIfNoLocalStack('connection config')) return;
      
      assert(process.env.LOCALSTACK_ENDPOINT, 'LOCALSTACK_ENDPOINT should be set');
      assert(await isLocalStackReady(), 'LocalStack should be ready and responding');
    });
    
    test('should use test credentials for LocalStack', async () => {
      if (skipIfNoLocalStack('test credentials') || !localStackReady) return;
      
      // This test verifies that LocalStack accepts dummy credentials
      // by successfully listing secrets (which would fail with real AWS if credentials were invalid)
      const secrets = await listAwsSecrets('us-east-1');
      assert(Array.isArray(secrets), 'Should successfully authenticate with test credentials');
    });
  });
});

// Export test skipping utility for use in other test files
module.exports = {
  shouldRunLocalStackTests,
  skipIfNoLocalStack
};