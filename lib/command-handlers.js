const { colorize } = require('./colors');
const { fetchSecret, parseSecretData, generateOutput } = require('./secrets');
const { validateEnvKey } = require('./files');
const { backupFile } = require('./files');
const fs = require('fs');

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
      stage = 'AWSCURRENT',
      autoYes = false,
      secretData: providedSecretData,
      filteredKeys,
      onProgress
    } = options;

    try {
      // Step 1: Fetch secret data (if not provided)
      let secretData;
      if (providedSecretData) {
        secretData = providedSecretData;
        onProgress?.('Using provided secret data...');
      } else {
        onProgress?.(`Fetching data from ${inputType}: '${inputName}'...`);
        const secretString = await fetchSecret({
          inputType,
          inputName,
          region,
          namespace,
          stage,
          path: '.' // Default to current directory for file operations
        });
        
        onProgress?.('Parsing secret data...');
        secretData = parseSecretData(secretString);
      }

      // Step 2: Filter keys if specified (for copy wizard filtered copying)
      let dataToExport = secretData;
      if (filteredKeys && Array.isArray(filteredKeys)) {
        dataToExport = {};
        filteredKeys.forEach(key => {
          if (secretData.hasOwnProperty(key)) {
            dataToExport[key] = secretData[key];
          }
        });
        onProgress?.(`Filtered to ${filteredKeys.length} keys`);
      }

      // Step 3: Validate data for specific output types
      if (outputType === 'env') {
        const invalidKeys = Object.keys(dataToExport).filter(key => !validateEnvKey(key));
        if (invalidKeys.length > 0) {
          throw new Error(`Invalid environment variable keys: ${invalidKeys.join(', ')}. Keys must match pattern [A-Za-z_][A-Za-z0-9_]*`);
        }
      }

      // Step 4: Handle output based on type
      let result;

      if (outputType === 'aws-secrets-manager') {
        // AWS Secrets Manager upload
        if (!outputName) {
          throw new Error('Output name is required when output type is aws-secrets-manager');
        }
        
        onProgress?.('Uploading to AWS Secrets Manager...');
        result = await generateOutput(dataToExport, outputType, outputName, region, stage, autoYes);
        
        return {
          success: true,
          type: 'aws-upload',
          message: result,
          secretName: outputName,
          region: region
        };

      } else if (outputType === 'kubernetes') {
        // Kubernetes secret upload
        if (!outputName) {
          throw new Error('Output name is required when output type is kubernetes');
        }
        
        onProgress?.('Uploading to Kubernetes...');
        result = await generateOutput(dataToExport, outputType, outputName, region, stage, autoYes, namespace);
        
        return {
          success: true,
          type: 'kubernetes-upload',
          message: result,
          secretName: outputName,
          namespace: namespace
        };

      } else {
        // File or stdout output
        const outputContent = await generateOutput(dataToExport, outputType, outputName, region, stage, autoYes);
        
        if (outputName) {
          // File output - create backup if file exists
          if (fs.existsSync(outputName)) {
            onProgress?.('Creating backup of existing file...');
            backupFile(outputName);
          }
          
          onProgress?.(`Writing to file: ${outputName}`);
          fs.writeFileSync(outputName, outputContent);
          
          return {
            success: true,
            type: 'file-output',
            message: `Successfully wrote to ${outputName}`,
            filePath: outputName,
            outputType: outputType
          };
        } else {
          // Stdout output
          return {
            success: true,
            type: 'stdout-output',
            content: outputContent,
            outputType: outputType
          };
        }
      }

    } catch (error) {
      return {
        success: false,
        error: error.message,
        type: 'error'
      };
    }
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
      let secrets = [];
      
      if (type === 'aws-secrets-manager') {
        const { listAwsSecrets } = require('./aws');
        secrets = await listAwsSecrets(region);
      } else if (type === 'kubernetes') {
        const { listSecrets } = require('./kubernetes');
        secrets = await listSecrets(namespace);
      } else if (type === 'env') {
        const { listEnvFiles } = require('./files');
        secrets = listEnvFiles(path);
      } else if (type === 'json') {
        const { listJsonFiles } = require('./files');
        secrets = listJsonFiles(path);
      } else {
        throw new Error(`Unsupported storage type: ${type}`);
      }

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
      const secretString = await fetchSecret({
        inputType: type,
        inputName: name,
        region,
        namespace,
        path
      });
      
      const secretData = parseSecretData(secretString);
      
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