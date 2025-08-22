const { colorize } = require('./colors');

// Import ErrorHandler lazily to avoid circular dependencies
let ErrorHandler = null;
function getErrorHandler() {
  if (!ErrorHandler) {
    ErrorHandler = require('./error-handler').ErrorHandler;
  }
  return ErrorHandler;
}

/**
 * Centralized configuration management for lowkey CLI
 * 
 * Handles environment variables, settings validation, and provides
 * a unified interface for all configuration across the application.
 */

/**
 * Environment variable configuration
 */
const ENV_VARS = {
  // Debug settings
  LOWKEY_DEBUG: {
    key: 'LOWKEY_DEBUG',
    type: 'boolean',
    default: false,
    description: 'Enable debug logging to file'
  },
  DEBUG: {
    key: 'DEBUG', 
    type: 'boolean',
    default: false,
    description: 'General debug flag (alternative to LOWKEY_DEBUG)'
  },
  
  // AWS settings
  AWS_REGION: {
    key: 'AWS_REGION',
    type: 'string',
    default: null,
    description: 'AWS region for operations',
    validation: (value) => {
      const regionPattern = /^[a-z0-9][a-z0-9\-]*[a-z0-9]$/;
      if (value && !regionPattern.test(value)) {
        throw new Error(`Invalid AWS region format: ${value}`);
      }
      return value;
    }
  },
  AWS_DEFAULT_REGION: {
    key: 'AWS_DEFAULT_REGION',
    type: 'string', 
    default: null,
    description: 'Fallback AWS region'
  },
  
  // Editor settings
  EDITOR: {
    key: 'EDITOR',
    type: 'string',
    default: 'vim',
    description: 'Text editor for interactive editing'
  },
  
  // Test environment
  NODE_ENV: {
    key: 'NODE_ENV',
    type: 'string',
    default: 'development',
    description: 'Node.js environment'
  },
  NODE_TEST_CONTEXT: {
    key: 'NODE_TEST_CONTEXT',
    type: 'boolean',
    default: false,
    description: 'Node.js test context flag'
  }
};

/**
 * Application configuration with defaults
 */
const DEFAULT_CONFIG = {
  // Debug settings
  debug: {
    enabled: false,
    logToFile: true,
    logDirectory: 'lowkey-logs',
    fileRetentionDays: 7
  },
  
  // AWS settings
  aws: {
    region: null,
    defaultStage: 'AWSCURRENT',
    timeoutMs: 30000,
    retryAttempts: 3
  },
  
  // Kubernetes settings
  kubernetes: {
    defaultNamespace: 'default',
    defaultContext: null,
    timeoutMs: 30000,
    secretType: 'Opaque'
  },
  
  // Editor settings
  editor: {
    command: 'vim',
    args: [],
    tempFilePrefix: 'lowkey-edit-',
    encoding: 'utf8'
  },
  
  // File operations
  files: {
    backupExtension: '.bak',
    createBackups: true,
    defaultPath: '.',
    jsonExcludes: [
      'package.json', 'package-lock.json', 'tsconfig.json', 'jsconfig.json',
      'webpack.config.json', 'vite.config.json', 'rollup.config.json',
      'babel.config.json', '.eslintrc.json', '.prettierrc.json',
      'jest.config.json', 'tailwind.config.json', 'next.config.json',
      'nuxt.config.json', 'angular.json', 'composer.json', 'manifest.json',
      'vercel.json', 'netlify.json'
    ]
  },
  
  // Interactive UI settings
  interactive: {
    renderTimeoutMs: 16, // ~60fps
    defaultTerminalHeight: 24,
    minAvailableHeight: 3,
    reservedLinesForUI: 6,
    valueTruncationLength: 60,
    valueTruncationSuffix: '...',
    pageSizeDivisor: 2
  },
  
  // Supported storage types
  storageTypes: ['aws-secrets-manager', 'json', 'env', 'kubernetes'],
  
  // Environment variable patterns
  env: {
    keyPattern: /^[A-Za-z_][A-Za-z0-9_]*$/,
    linePattern: /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/
  }
};

/**
 * Configuration manager class
 */
class ConfigManager {
  constructor() {
    this.config = null;
    this.envCache = new Map();
    this.initialized = false;
  }

  /**
   * Deep clone configuration while preserving RegExp objects
   */
  deepCloneConfig(obj) {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    
    if (obj instanceof RegExp) {
      return new RegExp(obj.source, obj.flags);
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.deepCloneConfig(item));
    }
    
    const cloned = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        cloned[key] = this.deepCloneConfig(obj[key]);
      }
    }
    return cloned;
  }

  /**
   * Initialize configuration by loading environment variables and merging with defaults
   */
  initialize() {
    if (this.initialized) {
      return this.config;
    }

    try {
      // Start with default configuration (deep clone while preserving RegExp objects)
      this.config = this.deepCloneConfig(DEFAULT_CONFIG);
      
      // Load and validate environment variables
      this.loadEnvironmentVariables();
      
      // Apply environment-based configuration
      this.applyEnvironmentConfig();
      
      this.initialized = true;
      return this.config;
      
    } catch (error) {
      const EH = getErrorHandler();
      throw EH.configuration(`Failed to initialize configuration: ${error.message}`, {
        suggestions: [
          'Check your environment variables are valid',
          'Verify AWS region format if using AWS',
          'Ensure all required settings are provided'
        ],
        originalError: error
      });
    }
  }

  /**
   * Load and validate environment variables
   */
  loadEnvironmentVariables() {
    for (const [name, envVar] of Object.entries(ENV_VARS)) {
      try {
        const rawValue = process.env[envVar.key];
        let processedValue;

        if (rawValue === undefined) {
          processedValue = envVar.default;
        } else {
          processedValue = this.parseEnvironmentValue(rawValue, envVar.type);
          
          // Apply validation if provided
          if (envVar.validation && processedValue !== null) {
            processedValue = envVar.validation(processedValue);
          }
        }

        this.envCache.set(envVar.key, processedValue);
        
      } catch (error) {
        console.warn(`Invalid environment variable ${envVar.key}: ${error.message}, using default`);
        this.envCache.set(envVar.key, envVar.default);
      }
    }
  }

  /**
   * Parse environment variable value based on type
   */
  parseEnvironmentValue(value, type) {
    switch (type) {
      case 'boolean':
        return value === 'true' || value === '1';
      
      case 'number':
        const num = Number(value);
        if (isNaN(num)) {
          throw new Error(`Expected number, got: ${value}`);
        }
        return num;
      
      case 'string':
        return value;
      
      case 'array':
        return value.split(',').map(item => item.trim());
      
      default:
        throw new Error(`Unknown environment variable type: ${type}`);
    }
  }

  /**
   * Apply environment-based configuration to the main config
   */
  applyEnvironmentConfig() {
    // Debug settings
    this.config.debug.enabled = this.envCache.get('LOWKEY_DEBUG') || this.envCache.get('DEBUG');
    
    // AWS settings
    this.config.aws.region = this.envCache.get('AWS_REGION') || this.envCache.get('AWS_DEFAULT_REGION');
    
    // Editor settings
    this.config.editor.command = this.envCache.get('EDITOR');
    
    // Test environment detection
    const isTestEnv = this.envCache.get('NODE_ENV') === 'test' || this.envCache.get('NODE_TEST_CONTEXT');
    if (isTestEnv) {
      // Only disable debug in tests if not explicitly enabled
      if (!this.envCache.get('LOWKEY_DEBUG') && !this.envCache.get('DEBUG')) {
        this.config.debug.enabled = false;
      }
      this.config.interactive.renderTimeoutMs = 0; // No render delay in tests
    }
  }

  /**
   * Get configuration value by path (dot notation)
   */
  get(path, defaultValue = undefined) {
    try {
      if (!this.initialized) {
        this.initialize();
      }

      const keys = path.split('.');
      let value = this.config;

      for (const key of keys) {
        if (value && typeof value === 'object' && key in value) {
          value = value[key];
        } else {
          return defaultValue;
        }
      }

      return value;
    } catch (error) {
      // If config initialization fails, return default value gracefully
      if (defaultValue !== undefined) {
        return defaultValue;
      }
      
      // If no default provided, try to return the original constant value from DEFAULT_CONFIG
      const keys = path.split('.');
      let fallbackValue = DEFAULT_CONFIG;
      for (const key of keys) {
        if (fallbackValue && typeof fallbackValue === 'object' && key in fallbackValue) {
          fallbackValue = fallbackValue[key];
        } else {
          console.warn(`Configuration error for ${path}: ${error.message}`);
          return undefined;
        }
      }
      
      return fallbackValue;
    }
  }

  /**
   * Set configuration value by path
   */
  set(path, value) {
    if (!this.initialized) {
      this.initialize();
    }

    const keys = path.split('.');
    const lastKey = keys.pop();
    let target = this.config;

    for (const key of keys) {
      if (!(key in target) || typeof target[key] !== 'object') {
        target[key] = {};
      }
      target = target[key];
    }

    target[lastKey] = value;
  }

  /**
   * Get environment variable value with caching
   */
  getEnv(key, defaultValue = null) {
    if (this.envCache.has(key)) {
      return this.envCache.get(key);
    }

    // If not cached, get from process.env directly
    const value = process.env[key];
    return value !== undefined ? value : defaultValue;
  }

  /**
   * Check if running in test environment
   */
  isTestEnvironment() {
    return this.get('debug.enabled') === false && 
           (this.getEnv('NODE_ENV') === 'test' || this.getEnv('NODE_TEST_CONTEXT'));
  }

  /**
   * Check if debug mode is enabled
   */
  isDebugEnabled() {
    return this.get('debug.enabled', false);
  }

  /**
   * Get AWS region with fallback logic
   */
  getAwsRegion() {
    return this.get('aws.region') || null;
  }

  /**
   * Get editor command
   */
  getEditor() {
    return this.get('editor.command', 'vim');
  }

  /**
   * Get full configuration object
   */
  getAll() {
    if (!this.initialized) {
      this.initialize();
    }
    return { ...this.config };
  }

  /**
   * Validate configuration completeness
   */
  validate() {
    if (!this.initialized) {
      this.initialize();
    }

    const errors = [];

    // Add any required configuration validations here
    // Example: Check if AWS region is set when using AWS operations
    
    if (errors.length > 0) {
      console.error('Configuration validation failed:', errors.join(', '));
      return false;
    }

    return true;
  }

  /**
   * Reset configuration (useful for testing)
   */
  reset() {
    this.config = null;
    this.envCache.clear();
    this.initialized = false;
  }

  /**
   * Reload environment variables (useful for testing when env vars change)
   */
  reloadEnvironment() {
    this.envCache.clear();
    this.loadEnvironmentVariables();
    this.applyEnvironmentConfig();
  }

  /**
   * Display current configuration (sanitized for logging)
   */
  toString() {
    if (!this.initialized) {
      this.initialize();
    }

    // Create a sanitized version for display
    const sanitized = { ...this.config };
    
    // Don't expose sensitive information in logs
    if (sanitized.aws) {
      sanitized.aws = { ...sanitized.aws };
      // Keep region visible as it's not sensitive
    }

    return JSON.stringify(sanitized, null, 2);
  }

  /**
   * Update AWS configuration (profile and region)
   * @param {Object} awsConfig - AWS configuration object
   * @param {string} awsConfig.profile - AWS profile name
   * @param {string} awsConfig.region - AWS region
   */
  updateAwsConfig(awsConfig) {
    if (!this.initialized) {
      this.initialize();
    }

    const { profile, region } = awsConfig;

    // Update environment variables (this affects current process)
    if (profile && profile !== 'default') {
      process.env.AWS_PROFILE = profile;
      this.envCache.set('AWS_PROFILE', profile);
    } else {
      delete process.env.AWS_PROFILE;
      this.envCache.delete('AWS_PROFILE');
    }

    if (region) {
      process.env.AWS_REGION = region;
      this.envCache.set('AWS_REGION', region);
      
      // Update our cached config
      this.config.aws.region = region;
    }

    // Log the change
    const debugLogger = require('./debug-logger');
    debugLogger.log('AWS configuration updated', {
      profile: profile || 'default',
      region: region
    });
  }

  /**
   * Get current AWS configuration
   */
  getAwsConfig() {
    if (!this.initialized) {
      this.initialize();
    }

    return {
      profile: this.envCache.get('AWS_PROFILE') || 'default',
      region: this.config.aws.region || this.envCache.get('AWS_REGION') || this.envCache.get('AWS_DEFAULT_REGION')
    };
  }
}

// Export singleton instance
const config = new ConfigManager();

// For backward compatibility, also export the constants structure
const CONSTANTS = {
  get INTERACTIVE() { return config.get('interactive'); },
  get FILES() { return config.get('files'); },
  get AWS() { return config.get('aws'); },
  get KUBERNETES() { return config.get('kubernetes'); },
  get STORAGE_TYPES() { return config.get('storageTypes'); },
  get ENV() { return config.get('env'); }
};

module.exports = {
  config,
  ConfigManager,
  CONSTANTS, // For backward compatibility
  ENV_VARS,
  DEFAULT_CONFIG
};