const { test, describe } = require('node:test');
const assert = require('node:assert');

describe('AWS Delete Provider Functionality', () => {
  
  describe('Function Availability', () => {
    test('should export deleteAwsSecret function', () => {
      const awsProvider = require('../../lib/providers/aws');
      assert.strictEqual(typeof awsProvider.deleteAwsSecret, 'function');
    });
    
    test('should import DeleteSecretCommand from AWS SDK', () => {
      // Verify the AWS SDK import works
      const { DeleteSecretCommand } = require('@aws-sdk/client-secrets-manager');
      assert.strictEqual(typeof DeleteSecretCommand, 'function');
    });
  });
});