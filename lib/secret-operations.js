const { colorize } = require('./colors');

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
    throw new Error(`fetch() not implemented for provider: ${this.type}`);
  }

  /**
   * Store a secret to the provider
   * @param {string} name - Secret name/path
   * @param {Object} data - Secret data as key-value pairs
   * @param {Object} options - Provider-specific options
   * @returns {Promise<string>} Success message
   */
  async store(name, data, options = {}) {
    throw new Error(`store() not implemented for provider: ${this.type}`);
  }

  /**
   * List available secrets for this provider
   * @param {Object} options - Provider-specific options
   * @returns {Promise<Array>} Array of secret names
   */
  async list(options = {}) {
    throw new Error(`list() not implemented for provider: ${this.type}`);
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
      throw new Error('Secret data must be a flat object');
    }

    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'object' && value !== null) {
        throw new Error(`Secret must be a flat object. Key '${key}' contains nested object/array`);
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
      throw new Error('AWS region is required for aws-secrets-manager operations');
    }

    const secretString = await fetchFromAwsSecretsManager(name, region, stage);
    return this._parseSecretString(secretString);
  }

  async store(name, data, options = {}) {
    const { uploadToAwsSecretsManager } = require('./aws');
    const { region, stage = 'AWSCURRENT', autoYes = false } = options;
    
    if (!region) {
      throw new Error('AWS region is required for aws-secrets-manager operations');
    }

    this.validateData(data);
    return await uploadToAwsSecretsManager(data, name, region, stage, autoYes);
  }

  async list(options = {}) {
    const { listAwsSecrets } = require('./aws');
    const { region } = options;
    
    if (!region) {
      throw new Error('AWS region is required for aws-secrets-manager operations');
    }

    return await listAwsSecrets(region);
  }

  _parseSecretString(secretString) {
    let parsed;
    
    try {
      parsed = JSON.parse(secretString);
    } catch (error) {
      throw new Error('AWS secret value is not valid JSON');
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
      throw new Error('Kubernetes namespace is required for kubernetes operations');
    }

    const secretData = await getSecret(name, namespace);
    this.validateData(secretData);
    return secretData;
  }

  async store(name, data, options = {}) {
    const { setSecret } = require('./kubernetes');
    const { namespace } = options;
    
    if (!namespace) {
      throw new Error('Kubernetes namespace is required for kubernetes operations');
    }

    this.validateData(data);
    await setSecret(name, data, namespace);
    return `Successfully uploaded secret '${name}' to Kubernetes namespace '${namespace}'`;
  }

  async list(options = {}) {
    const { listSecrets } = require('./kubernetes');
    const { namespace } = options;
    
    if (!namespace) {
      throw new Error('Kubernetes namespace is required for kubernetes operations');
    }

    return await listSecrets(namespace);
  }

  validateData(data) {
    super.validateData(data);
    
    // Kubernetes-specific validation - all values must be strings
    for (const [key, value] of Object.entries(data)) {
      if (typeof value !== 'string') {
        throw new Error(`Kubernetes secret values must be strings. Key '${key}' has value of type ${typeof value}`);
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
    const secretString = await fetchFromJsonFile(name);
    return this._parseSecretString(secretString);
  }

  async store(name, data, options = {}) {
    const fs = require('fs');
    const { backupFile } = require('./files');
    
    this.validateData(data);
    
    // Create backup if file exists
    if (fs.existsSync(name)) {
      backupFile(name);
    }
    
    const content = JSON.stringify(data, null, 2) + '\n';
    fs.writeFileSync(name, content);
    
    return `Successfully wrote to ${name}`;
  }

  async list(options = {}) {
    const { listJsonFiles } = require('./files');
    const { path = '.' } = options;
    return listJsonFiles(path);
  }

  _parseSecretString(secretString) {
    let parsed;
    
    try {
      parsed = JSON.parse(secretString);
    } catch (error) {
      throw new Error('JSON file contains invalid JSON');
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
    const secretString = fetchFromEnvFile(name);
    return this._parseSecretString(secretString);
  }

  async store(name, data, options = {}) {
    const fs = require('fs');
    const { backupFile, validateEnvKey, escapeEnvValue } = require('./files');
    
    this.validateData(data);
    
    // Validate all keys for env format
    for (const key of Object.keys(data)) {
      if (!validateEnvKey(key)) {
        throw new Error(`Invalid environment variable key: '${key}'. Keys must match pattern [A-Za-z_][A-Za-z0-9_]*`);
      }
    }
    
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
  }

  async list(options = {}) {
    const { listEnvFiles } = require('./files');
    const { path = '.' } = options;
    return listEnvFiles(path);
  }

  _parseSecretString(secretString) {
    let parsed;
    
    try {
      parsed = JSON.parse(secretString);
    } catch (error) {
      throw new Error('Environment file data is not valid JSON');
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