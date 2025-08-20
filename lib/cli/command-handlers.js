const { colorize } = require('../core/colors');
const { secretOperations } = require('../providers/secret-operations');

/**
 * Unified command handlers to eliminate duplication between
 * interactive and non-interactive command modes
 */
class CommandHandlers {
  /**
   * Copy secrets from one storage type to another
   * Used by both commands/copy.js and copy-wizard-screen.js
   * 
   * @param {Object} options - Copy options
   * @param {string} options.inputType - Source storage type (aws-secrets-manager, env, json, kubernetes)
   * @param {string} options.inputName - Source secret/file name
   * @param {string} options.outputType - Target storage type
   * @param {string} options.outputName - Target secret/file name (optional for stdout)
   * @param {string} options.region - AWS region (for AWS operations)
   * @param {string} options.namespace - Kubernetes namespace (for K8s operations)
   * @param {string} options.stage - AWS stage (default: AWSCURRENT)
   * @param {boolean} options.autoYes - Skip confirmation prompts
   * @param {Object} options.secretData - Pre-fetched secret data (optional, for wizard)
   * @param {Array} options.filteredKeys - Keys to copy (optional, for filtered copying)
   * @param {Function} options.onProgress - Progress callback (optional)
   * @returns {Object} Result object with success status and data
   */
  static async copySecret(options) {
    const {
      inputType,
      inputName,
      outputType,
      outputName,
      region,
      namespace,
      outputNamespace, // Support separate output namespace
      stage = 'AWSCURRENT',
      autoYes = false,
      secretData: providedSecretData,
      filteredKeys,
      onProgress
    } = options;

    try {
      // Step 1: Prepare source and target configurations
      const sourceConfig = {
        type: inputType,
        name: inputName,
        options: {
          region,
          namespace,
          stage,
          path: '.'
        }
      };

      const targetConfig = {
        type: outputType,
        name: outputName,
        options: {
          region,
          namespace: outputNamespace || namespace, // Use outputNamespace if provided, otherwise fall back to namespace
          stage,
          autoYes,
          path: '.'
        }
      };

      // Step 2: Handle pre-provided secret data or use copy operation
      if (providedSecretData) {
        onProgress?.('Using provided secret data...');
        
        // Filter keys if specified
        let dataToExport = providedSecretData;
        if (filteredKeys && Array.isArray(filteredKeys)) {
          dataToExport = {};
          filteredKeys.forEach(key => {
            if (providedSecretData.hasOwnProperty(key)) {
              dataToExport[key] = providedSecretData[key];
            }
          });
          onProgress?.(`Filtered to ${filteredKeys.length} keys`);
        }

        // Store directly using secret operations
        if (!outputName && (outputType === 'env' || outputType === 'json')) {
          // Handle stdout output for file types
          const provider = secretOperations.getProvider(outputType);
          const content = outputType === 'env' 
            ? this._generateEnvContent(dataToExport)
            : JSON.stringify(dataToExport, null, 2) + '\n';
          
          return {
            success: true,
            type: 'stdout-output',
            content: content,
            outputType: outputType
          };
        }

        onProgress?.(`Storing to ${outputType}: '${outputName}'...`);
        const result = await secretOperations.store(outputType, outputName, dataToExport, targetConfig.options);
        
        return {
          success: true,
          type: this._getResultType(outputType),
          message: result,
          secretName: outputName,
          region: region,
          namespace: outputNamespace || namespace
        };

      } else {
        // Use unified copy operation
        const copyOptions = {
          filteredKeys,
          onProgress
        };

        const result = await secretOperations.copy(sourceConfig, targetConfig, copyOptions);

        if (!result.success) {
          throw new Error(result.error);
        }

        // Handle stdout output for file types without output name
        if (!outputName && (outputType === 'env' || outputType === 'json')) {
          const secretData = await secretOperations.fetch(inputType, inputName, sourceConfig.options);
          const content = outputType === 'env' 
            ? this._generateEnvContent(secretData)
            : JSON.stringify(secretData, null, 2) + '\n';
          
          return {
            success: true,
            type: 'stdout-output',
            content: content,
            outputType: outputType
          };
        }

        return {
          success: true,
          type: this._getResultType(outputType),
          message: result.message,
          secretName: outputName,
          region: region,
          namespace: outputNamespace || namespace
        };
      }

    } catch (error) {
      return {
        success: false,
        error: error.message,
        type: 'error'
      };
    }
  }

  static _getResultType(outputType) {
    switch (outputType) {
      case 'aws-secrets-manager':
        return 'aws-upload';
      case 'kubernetes':
        return 'kubernetes-upload';
      default:
        return 'file-output';
    }
  }

  static _generateEnvContent(secretData) {
    const { validateEnvKey, escapeEnvValue } = require('./files');
    const lines = [];
    
    for (const [key, value] of Object.entries(secretData)) {
      if (!validateEnvKey(key)) {
        throw new Error(`Invalid environment variable key: '${key}'. Keys must match pattern [A-Za-z_][A-Za-z0-9_]*`);
      }
      
      const escapedValue = escapeEnvValue(value);
      lines.push(`${key}=${escapedValue}`);
    }
    
    return lines.join('\n') + '\n';
  }

  /**
   * List secrets for a given storage type
   * Used by both commands/list.js and interactive screens
   * 
   * @param {Object} options - List options
   * @param {string} options.type - Storage type to list
   * @param {string} options.region - AWS region (for AWS operations)
   * @param {string} options.namespace - Kubernetes namespace (for K8s operations)
   * @param {string} options.path - Directory path (for file operations)
   * @returns {Object} Result object with success status and data
   */
  static async listSecrets(options) {
    const { type, region, namespace, path = '.' } = options;

    try {
      const listOptions = {
        region,
        namespace,
        path
      };

      const secrets = await secretOperations.list(type, listOptions);

      return {
        success: true,
        secrets: secrets,
        type: type,
        location: region || namespace || path
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        type: 'error'
      };
    }
  }

  /**
   * Inspect/fetch a specific secret
   * Used by both commands/inspect.js and interactive screens
   * 
   * @param {Object} options - Inspect options
   * @param {string} options.type - Storage type
   * @param {string} options.name - Secret/file name
   * @param {string} options.region - AWS region (for AWS operations)
   * @param {string} options.namespace - Kubernetes namespace (for K8s operations)
   * @param {string} options.path - Directory path (for file operations)
   * @returns {Object} Result object with success status and data
   */
  static async inspectSecret(options) {
    const { type, name, region, namespace, path = '.' } = options;

    try {
      const fetchOptions = {
        region,
        namespace,
        path
      };

      const secretData = await secretOperations.fetch(type, name, fetchOptions);
      
      return {
        success: true,
        data: secretData,
        name: name,
        type: type,
        location: region || namespace || path
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        type: 'error'
      };
    }
  }

  /**
   * Validate copy operation parameters
   * Shared validation logic for both interactive and non-interactive modes
   */
  static validateCopyOptions(options) {
    const { inputType, inputName, outputType } = options;
    const errors = [];

    // Required parameters
    if (!inputType) errors.push('Input type is required');
    if (!inputName) errors.push('Input name is required');
    if (!outputType) errors.push('Output type is required');

    // Type-specific validations
    if (outputType === 'aws-secrets-manager' && !options.outputName) {
      errors.push('Output name is required when output type is aws-secrets-manager');
    }
    
    if (outputType === 'kubernetes' && !options.outputName) {
      errors.push('Output name is required when output type is kubernetes');
    }

    if (inputType === 'aws-secrets-manager' && !options.region) {
      errors.push('Region is required when input type is aws-secrets-manager');
    }

    if (outputType === 'aws-secrets-manager' && !options.region) {
      errors.push('Region is required when output type is aws-secrets-manager');
    }

    return {
      valid: errors.length === 0,
      errors: errors
    };
  }
}

module.exports = { CommandHandlers };