const { colorize } = require('../core/colors');
const { parseCommonArgs, validateRequiredArgs, validateTypes, handleRegionFallback, validateAwsRegion, createCustomArgHandler } = require('./arg-parser');
const { config } = require('../core/config');

/**
 * Unified command parser to eliminate duplication across commands
 * 
 * Each command configuration specifies:
 * - Custom arguments and their field mappings
 * - Required arguments
 * - Validation rules (AWS region, Kubernetes namespace, etc.)
 * - Help display function
 */
class CommandParser {
  /**
   * Parse command arguments using a configuration object
   * 
   * @param {Array} args - Command line arguments
   * @param {Object} commandConfig - Command configuration
   * @param {Object} commandConfig.customArgs - Custom argument definitions
   * @param {Array} commandConfig.requiredArgs - Required argument field names
   * @param {Function} commandConfig.showHelp - Help display function
   * @param {string} commandConfig.commandName - Command name for defaults
   * @param {boolean} commandConfig.requiresStorageType - Whether command needs --type validation
   * @param {boolean} commandConfig.requiresAwsRegion - Whether to validate AWS region when using AWS
   * @param {boolean} commandConfig.requiresKubernetesNamespace - Whether to require --namespace for kubernetes
   * @param {Array} commandConfig.supportedTypes - Override default supported types
   * @returns {Object} Parsed and validated options
   */
  static parseCommand(args, commandConfig) {
    const {
      customArgs = {},
      requiredArgs = [],
      showHelp,
      commandName,
      requiresStorageType = false,
      requiresAwsRegion = true,
      requiresKubernetesNamespace = true,
      supportedTypes = config.get('storageTypes', ['aws-secrets-manager', 'json', 'env', 'kubernetes'])
    } = commandConfig;

    // Create custom argument handler
    const customArgHandler = createCustomArgHandler(customArgs);

    // Parse common arguments
    const options = parseCommonArgs(args, {
      defaults: { command: commandName },
      showHelp: showHelp,
      customArgs: customArgHandler
    });

    // Handle AWS region fallback from environment variables
    handleRegionFallback(options);

    // Validate required arguments
    if (!validateRequiredArgs(options, requiredArgs)) {
      showHelp();
      process.exit(1);
    }

    // Validate storage type if required
    if (requiresStorageType && options.type) {
      if (!validateTypes(options.type, supportedTypes)) {
        process.exit(1);
      }
    }

    // AWS region validation
    if (requiresAwsRegion) {
      const needsRegion = options.type === 'aws-secrets-manager' || 
                         options.inputType === 'aws-secrets-manager' || 
                         options.outputType === 'aws-secrets-manager';
      
      if (!validateAwsRegion(options, needsRegion)) {
        showHelp();
        process.exit(1);
      }
    }

    // Kubernetes namespace validation
    if (requiresKubernetesNamespace) {
      const needsNamespace = options.type === 'kubernetes' || 
                             options.inputType === 'kubernetes' || 
                             options.outputType === 'kubernetes';
      
      if (needsNamespace && !options.namespace) {
        console.error(colorize('Error: --namespace is required when using kubernetes type', 'red'));
        process.exit(1);
      }
    }

    return options;
  }

  /**
   * Create a configuration object for the copy command
   */
  static getCopyConfig(showHelp) {
    return {
      customArgs: {
        '--input-type': { field: 'inputType', hasValue: true },
        '--input-name': { field: 'inputName', hasValue: true },
        '--output-type': { field: 'outputType', hasValue: true },
        '--output-name': { field: 'outputName', hasValue: true },
        '--namespace': { field: 'namespace', hasValue: true }
      },
      requiredArgs: ['inputType', 'inputName', 'outputType'],
      showHelp: showHelp,
      commandName: 'copy',
      requiresStorageType: false, // We validate inputType and outputType separately
      requiresAwsRegion: true,
      requiresKubernetesNamespace: true
    };
  }

  /**
   * Create a configuration object for the list command
   */
  static getListConfig(showHelp) {
    return {
      customArgs: {
        '--type': { field: 'type', hasValue: true },
        '--namespace': { field: 'namespace', hasValue: true }
      },
      requiredArgs: ['type'],
      showHelp: showHelp,
      commandName: 'list',
      requiresStorageType: true,
      requiresAwsRegion: true,
      requiresKubernetesNamespace: true
    };
  }

  /**
   * Create a configuration object for the inspect command
   */
  static getInspectConfig(showHelp) {
    return {
      customArgs: {
        '--type': { field: 'type', hasValue: true },
        '--name': { field: 'name', hasValue: true },
        '--namespace': { field: 'namespace', hasValue: true }
      },
      requiredArgs: ['type', 'name'],
      showHelp: showHelp,
      commandName: 'inspect',
      requiresStorageType: true,
      requiresAwsRegion: true,
      requiresKubernetesNamespace: false // Only needed for kubernetes type, handled by general logic
    };
  }

  /**
   * Create a configuration object for the interactive command
   */
  static getInteractiveConfig(showHelp) {
    return {
      customArgs: {
        '--namespace': { field: 'namespace', hasValue: true }
      },
      requiredArgs: [],
      showHelp: showHelp,
      commandName: 'interactive',
      requiresStorageType: false,
      requiresAwsRegion: false, // Interactive mode handles this dynamically
      requiresKubernetesNamespace: false // Interactive mode handles this dynamically
    };
  }

  /**
   * Additional validation for copy command that requires special handling
   */
  static validateCopyCommand(options) {
    // Validate input and output types separately
    const supportedTypes = config.get('storageTypes');
    
    if (!validateTypes(options.inputType, supportedTypes)) {
      process.exit(1);
    }

    if (!validateTypes(options.outputType, supportedTypes)) {
      process.exit(1);
    }
  }
}

module.exports = { CommandParser };