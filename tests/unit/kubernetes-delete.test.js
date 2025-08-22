const { test, describe } = require('node:test');
const assert = require('node:assert');

describe('Kubernetes Delete Provider Functionality', () => {
  
  describe('Function Availability', () => {
    test('should export deleteSecret function', () => {
      const kubernetesProvider = require('../../lib/providers/kubernetes');
      assert.strictEqual(typeof kubernetesProvider.deleteSecret, 'function');
    });
  });
});