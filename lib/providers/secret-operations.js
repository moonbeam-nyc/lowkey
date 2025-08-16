const { ErrorHandler } = require('../core/error-handler');

/**
 * Unified secret operations interface with provider abstraction
 * 
 * This module provides a consistent interface for secret operations across
 * different storage providers (AWS Secrets Manager, Kubernetes, local files)
 */

/**
 * Base class for secret providers
 */
class SecretProvider {
  constructor(type) {
    this.type = type;
  }

  /**
   * Fetch a secret from the provider
   * @param {string} name - Secret name/path
   * @param {Object} options - Provider-specific options
   * @returns {Promise<Object>} Secret data as key-value pairs
   */
  async fetch(name, options = {}) {
    throw ErrorHandler.configuration(`fetch() not implemented for provider: ${this.type}`);
  }

  /**
   * Store a secret to the provider
   * @param {string} name - Secret name/path
   * @param {Object} data - Secret data as key-value pairs
   * @param {Object} options - Provider-specific options
   * @returns {Promise<string>} Success message
   */
  async store(name, data, options = {}) {
    throw ErrorHandler.configuration(`store() not implemented for provider: ${this.type}`);
  }

  /**
   * List available secrets for this provider
   * @param {Object} options - Provider-specific options
   * @returns {Promise<Array>} Array of secret names
   */
  async list(options = {}) {
    throw ErrorHandler.configuration(`list() not implemented for provider: ${this.type}`);
  }

  /**
   * Check if a secret exists
   * @param {string} name - Secret name/path
   * @param {Object} options - Provider-specific options
   * @returns {Promise<boolean>} True if secret exists
   */
  async exists(name, options = {}) {
    try {
      await this.fetch(name, options);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Validate secret data for this provider
   * @param {Object} data - Secret data to validate
   * @throws {Error} If data is invalid for this provider
   */
  validateData(data) {
    // Base validation - ensure flat object with string values
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      throw ErrorHandler.validation('Secret data must be a flat object', {
        suggestions: [
          'Ensure secret data is a JSON object, not an array or primitive value',
          'Check that your input file contains valid JSON object format'
        ]
      });
    }

    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'object' && value !== null) {
        throw ErrorHandler.validation(`Secret must be a flat object. Key '${key}' contains nested object/array`, {
          suggestions: [
            'Flatten nested objects into separate keys',
            'Convert nested data to string format if needed',
            'Check your JSON structure for nested objects or arrays'
          ],
          context: { key, valueType: typeof value }
        });
      }
    }
  }
}

/**
 * AWS Secrets Manager provider
 */
class AwsSecretsManagerProvider extends SecretProvider {
  constructor() {
    super('aws-secrets-manager');
  }

  async fetch(name, options = {}) {
    const { fetchFromAwsSecretsManager } = require('./aws');
    const { region, stage = 'AWSCURRENT' } = options;
    
    if (!region) {
      throw ErrorHandler.configuration('AWS region is required for aws-secrets-manager operations', {
        suggestions: [
          'Provide --region parameter',
          'Set AWS_REGION environment variable',
          'Configure default region with: aws configure'
        ]
      });
    }

    try {
      const secretString = await fetchFromAwsSecretsManager(name, region, stage);
      return this._parseSecretString(secretString);
    } catch (error) {
      throw ErrorHandler.aws(error, { secretName: name, region, operation: 'fetch' });
    }
  }

  async store(name, data, options = {}) {
    const { uploadToAwsSecretsManager } = require('./aws');
    const { region, stage = 'AWSCURRENT', autoYes = false } = options;
    
    if (!region) {
      throw ErrorHandler.configuration('AWS region is required for aws-secrets-manager operations', {
        suggestions: [
          'Provide --region parameter',
          'Set AWS_REGION environment variable',
          'Configure default region with: aws configure'
        ]
      });
    }

    this.validateData(data);
    
    try {
      return await uploadToAwsSecretsManager(data, name, region, stage, autoYes);
    } catch (error) {
      throw ErrorHandler.aws(error, { secretName: name, region, operation: 'store' });
    }
  }

  async list(options = {}) {
    const { listAwsSecrets } = require('./aws');
    const { region } = options;
    
    if (!region) {
      throw ErrorHandler.configuration('AWS region is required for aws-secrets-manager operations', {
        suggestions: [
          'Provide --region parameter',
          'Set AWS_REGION environment variable',
          'Configure default region with: aws configure'
        ]
      });
    }

    try {
      return await listAwsSecrets(region);
    } catch (error) {
      throw ErrorHandler.aws(error, { region, operation: 'list' });
    }
  }

  _parseSecretString(secretString) {
    let parsed;
    
    try {
      parsed = JSON.parse(secretString);
    } catch (error) {
      throw ErrorHandler.validation('AWS secret value is not valid JSON', {
        suggestions: [
          'Ensure the AWS secret contains valid JSON format',
          'Check the secret value in AWS Secrets Manager console',
          'Verify the secret is not stored as plain text instead of JSON'
        ],
        originalError: error
      });
    }
    
    this.validateData(parsed);
    return parsed;
  }
}

/**
 * Kubernetes secrets provider
 */
class KubernetesProvider extends SecretProvider {
  constructor() {
    super('kubernetes');
  }

  async fetch(name, options = {}) {
    const { getSecret } = require('./kubernetes');
    const { namespace } = options;
    
    if (!namespace) {
      throw ErrorHandler.configuration('Kubernetes namespace is required for kubernetes operations', {
        suggestions: [
          'Provide --namespace parameter',
          'Use the default namespace with --namespace default',
          'List available namespaces: kubectl get namespaces'
        ]
      });
    }

    try {
      const secretData = await getSecret(name, namespace);
      this.validateData(secretData);
      return secretData;
    } catch (error) {
      throw ErrorHandler.kubernetes(error, { secretName: name, namespace, operation: 'fetch' });
    }
  }

  async store(name, data, options = {}) {
    const { setSecret } = require('./kubernetes');
    const { namespace } = options;
    
    if (!namespace) {
      throw ErrorHandler.configuration('Kubernetes namespace is required for kubernetes operations', {
        suggestions: [
          'Provide --namespace parameter',
          'Use the default namespace with --namespace default',
          'List available namespaces: kubectl get namespaces'
        ]
      });
    }

    this.validateData(data);
    
    try {
      await setSecret(name, data, namespace);
      return `Successfully uploaded secret '${name}' to Kubernetes namespace '${namespace}'`;
    } catch (error) {
      throw ErrorHandler.kubernetes(error, { secretName: name, namespace, operation: 'store' });
    }
  }

  async list(options = {}) {
    const { listSecrets } = require('./kubernetes');
    const { namespace } = options;
    
    if (!namespace) {
      throw ErrorHandler.configuration('Kubernetes namespace is required for kubernetes operations', {
        suggestions: [
          'Provide --namespace parameter',
          'Use the default namespace with --namespace default',
          'List available namespaces: kubectl get namespaces'
        ]
      });
    }

    try {
      return await listSecrets(namespace);
    } catch (error) {
      throw ErrorHandler.kubernetes(error, { namespace, operation: 'list' });
    }
  }

  validateData(data) {
    super.validateData(data);
    
    // Kubernetes-specific validation - all values must be strings
    for (const [key, value] of Object.entries(data)) {
      if (typeof value !== 'string') {
        throw ErrorHandler.validation(`Kubernetes secret values must be strings. Key '${key}' has value of type ${typeof value}`, {
          suggestions: [
            'Convert non-string values to strings',
            'Use JSON.stringify() for complex values',
            'Ensure all values in your source data are strings'
          ],
          context: { key, valueType: typeof value, value }
        });
      }
    }
  }
}

/**
 * JSON file provider
 */
class JsonFileProvider extends SecretProvider {
  constructor() {
    super('json');
  }

  async fetch(name, options = {}) {
    const { fetchFromJsonFile } = require('./files');
    
    try {
      const secretString = await fetchFromJsonFile(name);
      return this._parseSecretString(secretString);
    } catch (error) {
      throw ErrorHandler.file(error, name, 'read');
    }
  }

  async store(name, data, options = {}) {
    const fs = require('fs');
    const { backupFile } = require('./files');
    
    this.validateData(data);
    
    try {
      // Create backup if file exists
      if (fs.existsSync(name)) {
        backupFile(name);
      }
      
      const content = JSON.stringify(data, null, 2) + '\n';
      fs.writeFileSync(name, content);
      
      return `Successfully wrote to ${name}`;
    } catch (error) {
      throw ErrorHandler.file(error, name, 'write');
    }
  }

  async list(options = {}) {
    const { listJsonFiles } = require('./files');
    const { path = '.' } = options;
    
    try {
      return listJsonFiles(path);
    } catch (error) {
      throw ErrorHandler.file(error, path, 'list');
    }
  }

  _parseSecretString(secretString) {
    let parsed;
    
    try {
      parsed = JSON.parse(secretString);
    } catch (error) {
      throw ErrorHandler.validation('JSON file contains invalid JSON', {
        suggestions: [
          'Check your JSON syntax for missing commas or brackets',
          'Validate JSON format with a JSON validator',
          'Ensure the file contains valid JSON object format'
        ],
        originalError: error
      });
    }
    
    this.validateData(parsed);
    return parsed;
  }
}

/**
 * Environment file provider
 */
class EnvFileProvider extends SecretProvider {
  constructor() {
    super('env');
  }

  async fetch(name, options = {}) {
    const { fetchFromEnvFile } = require('./files');
    
    try {
      const secretString = fetchFromEnvFile(name);
      return this._parseSecretString(secretString);
    } catch (error) {
      throw ErrorHandler.file(error, name, 'read');
    }
  }

  async store(name, data, options = {}) {
    const fs = require('fs');
    const { backupFile, validateEnvKey, escapeEnvValue } = require('./files');
    
    this.validateData(data);
    
    // Validate all keys for env format
    for (const key of Object.keys(data)) {
      if (!validateEnvKey(key)) {
        throw ErrorHandler.validation(`Invalid environment variable key: '${key}'. Keys must match pattern [A-Za-z_][A-Za-z0-9_]*`, {
          suggestions: [
            'Environment variable names must start with a letter or underscore',
            'Use only letters, numbers, and underscores in variable names',
            'Convert spaces and special characters to underscores'
          ],
          context: { key, pattern: '[A-Za-z_][A-Za-z0-9_]*' }
        });
      }
    }
    
    try {
      // Create backup if file exists
      if (fs.existsSync(name)) {
        backupFile(name);
      }
      
      // Generate env content
      const lines = [];
      for (const [key, value] of Object.entries(data)) {
        const escapedValue = escapeEnvValue(value);
        lines.push(`${key}=${escapedValue}`);
      }
      
      const content = lines.join('\n') + '\n';
      fs.writeFileSync(name, content);
      
      return `Successfully wrote to ${name}`;
    } catch (error) {
      throw ErrorHandler.file(error, name, 'write');
    }
  }

  async list(options = {}) {
    const { listEnvFiles } = require('./files');
    const { path = '.' } = options;
    
    try {
      return listEnvFiles(path);
    } catch (error) {
      throw ErrorHandler.file(error, path, 'list');
    }
  }

  _parseSecretString(secretString) {
    let parsed;
    
    try {
      parsed = JSON.parse(secretString);
    } catch (error) {
      throw ErrorHandler.validation('Environment file data is not valid JSON', {
        suggestions: [
          'Check that the env file was parsed correctly',
          'Ensure all environment variable values are properly quoted',
          'Verify there are no syntax errors in the .env file'
        ],
        originalError: error
      });
    }
    
    this.validateData(parsed);
    return parsed;
  }
}

/**
 * Secret operations manager - main interface
 */
class SecretOperations {
  constructor() {
    this.providers = new Map();
    this._registerProviders();
  }

  _registerProviders() {
    this.providers.set('aws-secrets-manager', new AwsSecretsManagerProvider());
    this.providers.set('kubernetes', new KubernetesProvider());
    this.providers.set('json', new JsonFileProvider());
    this.providers.set('env', new EnvFileProvider());
  }

  /**
   * Get a provider by type
   * @param {string} type - Provider type
   * @returns {SecretProvider} Provider instance
   */
  getProvider(type) {
    const provider = this.providers.get(type);
    if (!provider) {
      throw new Error(`Unsupported provider type: ${type}`);
    }
    return provider;
  }

  /**
   * Get list of supported provider types
   * @returns {Array<string>} Array of provider type names
   */
  getSupportedTypes() {
    return Array.from(this.providers.keys());
  }

  /**
   * Fetch a secret from any provider
   * @param {string} type - Provider type
   * @param {string} name - Secret name/path
   * @param {Object} options - Provider-specific options
   * @returns {Promise<Object>} Secret data
   */
  async fetch(type, name, options = {}) {
    const provider = this.getProvider(type);
    return await provider.fetch(name, options);
  }

  /**
   * Store a secret to any provider
   * @param {string} type - Provider type
   * @param {string} name - Secret name/path
   * @param {Object} data - Secret data
   * @param {Object} options - Provider-specific options
   * @returns {Promise<string>} Success message
   */
  async store(type, name, data, options = {}) {
    const provider = this.getProvider(type);
    return await provider.store(name, data, options);
  }

  /**
   * List secrets for any provider
   * @param {string} type - Provider type
   * @param {Object} options - Provider-specific options
   * @returns {Promise<Array>} Array of secret names
   */
  async list(type, options = {}) {
    const provider = this.getProvider(type);
    return await provider.list(options);
  }

  /**
   * Copy secrets between providers
   * @param {Object} source - Source provider config {type, name, options}
   * @param {Object} target - Target provider config {type, name, options}
   * @param {Object} copyOptions - Copy-specific options
   * @returns {Promise<Object>} Copy result
   */
  async copy(source, target, copyOptions = {}) {
    const { filteredKeys, onProgress } = copyOptions;
    
    try {
      // Fetch from source
      onProgress?.(`Fetching from ${source.type}: '${source.name}'...`);
      let secretData = await this.fetch(source.type, source.name, source.options);
      
      // Filter keys if specified
      if (filteredKeys && Array.isArray(filteredKeys)) {
        const filtered = {};
        filteredKeys.forEach(key => {
          if (secretData.hasOwnProperty(key)) {
            filtered[key] = secretData[key];
          }
        });
        secretData = filtered;
        onProgress?.(`Filtered to ${filteredKeys.length} keys`);
      }
      
      // Store to target
      onProgress?.(`Storing to ${target.type}: '${target.name}'...`);
      const result = await this.store(target.type, target.name, secretData, target.options);
      
      return {
        success: true,
        message: result,
        sourceType: source.type,
        targetType: target.type,
        keyCount: Object.keys(secretData).length
      };
      
    } catch (error) {
      return {
        success: false,
        error: error.message,
        sourceType: source.type,
        targetType: target.type
      };
    }
  }
}

// Export singleton instance
const secretOperations = new SecretOperations();

module.exports = {
  SecretOperations,
  SecretProvider,
  AwsSecretsManagerProvider,
  KubernetesProvider,
  JsonFileProvider,
  EnvFileProvider,
  secretOperations // Default instance
};