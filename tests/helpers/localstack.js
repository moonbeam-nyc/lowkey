/**
 * LocalStack test helper utilities
 * Provides configuration and utilities for testing against LocalStack
 */

const { SecretsManagerClient } = require('@aws-sdk/client-secrets-manager');

/**
 * Create an AWS SDK client configured for LocalStack or real AWS
 * @param {Object} options - Configuration options
 * @param {string} options.region - AWS region
 * @param {boolean} options.useLocalStack - Whether to use LocalStack endpoint
 * @returns {SecretsManagerClient} Configured Secrets Manager client
 */
function createSecretsManagerClient(options = {}) {
  const {
    region = 'us-east-1',
    useLocalStack = !!process.env.LOCALSTACK_ENDPOINT
  } = options;

  const clientConfig = {
    region
  };

  if (useLocalStack) {
    const endpoint = process.env.LOCALSTACK_ENDPOINT || 'http://localhost:4566';
    
    clientConfig.endpoint = endpoint;
    clientConfig.credentials = {
      accessKeyId: 'test',
      secretAccessKey: 'test'
    };
    
    // LocalStack configuration
    clientConfig.forcePathStyle = true;
    clientConfig.s3ForcePathStyle = true;
  }

  return new SecretsManagerClient(clientConfig);
}

/**
 * Check if LocalStack is available and ready
 * @returns {Promise<boolean>} True if LocalStack is ready
 */
async function isLocalStackReady() {
  if (!process.env.LOCALSTACK_ENDPOINT) {
    return false;
  }

  try {
    const endpoint = process.env.LOCALSTACK_ENDPOINT || 'http://localhost:4566';
    const response = await fetch(`${endpoint}/_localstack/health`);
    const health = await response.json();
    
    // Check if Secrets Manager is running
    return health.services && health.services.secretsmanager === 'running';
  } catch (error) {
    return false;
  }
}

/**
 * Wait for LocalStack to be ready
 * @param {number} maxWaitMs - Maximum time to wait in milliseconds
 * @param {number} intervalMs - Check interval in milliseconds
 * @returns {Promise<boolean>} True if LocalStack becomes ready
 */
async function waitForLocalStack(maxWaitMs = 60000, intervalMs = 2000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitMs) {
    if (await isLocalStackReady()) {
      return true;
    }
    
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  
  return false;
}

/**
 * Create test secrets in LocalStack for testing
 * @returns {Promise<Object>} Created test data
 */
async function setupTestSecrets() {
  const client = createSecretsManagerClient();
  
  const testSecrets = {
    'test-secret': {
      username: 'testuser',
      password: 'testpass',
      api_key: 'test123'
    },
    'test-env-secret': {
      DATABASE_URL: 'postgresql://localhost:5432/testdb',
      API_KEY: 'sk-test123',
      DEBUG: 'true'
    },
    'test-simple-secret': {
      value: 'simple-string-value'
    }
  };

  const { CreateSecretCommand } = require('@aws-sdk/client-secrets-manager');
  
  for (const [secretName, secretValue] of Object.entries(testSecrets)) {
    try {
      await client.send(new CreateSecretCommand({
        Name: secretName,
        SecretString: JSON.stringify(secretValue)
      }));
    } catch (error) {
      // Secret might already exist, ignore ResourceExistsException
      if (!error.name?.includes('ResourceExists')) {
        throw error;
      }
    }
  }
  
  return testSecrets;
}

/**
 * Clean up test secrets from LocalStack
 * @returns {Promise<void>}
 */
async function cleanupTestSecrets() {
  const client = createSecretsManagerClient();
  const { DeleteSecretCommand } = require('@aws-sdk/client-secrets-manager');
  
  const testSecretNames = ['test-secret', 'test-env-secret', 'test-simple-secret'];
  
  for (const secretName of testSecretNames) {
    try {
      await client.send(new DeleteSecretCommand({
        SecretId: secretName,
        ForceDeleteWithoutRecovery: true
      }));
    } catch (error) {
      // Secret might not exist, ignore
    }
  }
}

/**
 * Get the appropriate AWS configuration for current environment
 * @returns {Object} AWS configuration object
 */
function getAwsConfig() {
  const isLocalStack = !!process.env.LOCALSTACK_ENDPOINT;
  
  if (isLocalStack) {
    return {
      endpoint: process.env.LOCALSTACK_ENDPOINT || 'http://localhost:4566',
      region: 'us-east-1',
      credentials: {
        accessKeyId: 'test',
        secretAccessKey: 'test'
      }
    };
  }
  
  return {
    region: process.env.AWS_REGION || 'us-east-1'
  };
}

module.exports = {
  createSecretsManagerClient,
  isLocalStackReady,
  waitForLocalStack,
  setupTestSecrets,
  cleanupTestSecrets,
  getAwsConfig
};