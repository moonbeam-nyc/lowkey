const { colorize } = require('./colors');

/**
 * Standardized error handling system for lowkey CLI
 * 
 * Provides consistent error formatting, categorization, and user-friendly messages
 * across all commands and operations.
 */

/**
 * Error categories for classification
 */
const ErrorCategory = {
  VALIDATION: 'validation',
  AUTHENTICATION: 'authentication', 
  AUTHORIZATION: 'authorization',
  NETWORK: 'network',
  FILE_SYSTEM: 'file_system',
  CONFIGURATION: 'configuration',
  PROVIDER_ERROR: 'provider_error',
  USER_INPUT: 'user_input',
  SYSTEM: 'system',
  UNKNOWN: 'unknown'
};

/**
 * Error severity levels
 */
const ErrorSeverity = {
  LOW: 'low',
  MEDIUM: 'medium', 
  HIGH: 'high',
  CRITICAL: 'critical'
};

/**
 * Standard error class with categorization and user-friendly messaging
 */
class LowkeyError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'LowkeyError';
    this.category = options.category || ErrorCategory.UNKNOWN;
    this.severity = options.severity || ErrorSeverity.MEDIUM;
    this.code = options.code || 'UNKNOWN_ERROR';
    this.userMessage = options.userMessage || message;
    this.suggestions = options.suggestions || [];
    this.context = options.context || {};
    this.originalError = options.originalError || null;
    
    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, LowkeyError);
    }
  }

  /**
   * Get formatted error message for user display
   */
  getFormattedMessage() {
    return colorize(`Error: ${this.userMessage}`, 'red');
  }

  /**
   * Get suggestions as formatted text
   */
  getFormattedSuggestions() {
    if (this.suggestions.length === 0) return '';
    
    const suggestionText = this.suggestions
      .map(suggestion => `  • ${suggestion}`)
      .join('\n');
    
    return '\n' + colorize('Suggestions:', 'cyan') + '\n' + suggestionText;
  }

  /**
   * Get full formatted error with suggestions
   */
  getFullMessage() {
    return this.getFormattedMessage() + this.getFormattedSuggestions();
  }

  /**
   * Convert to JSON for logging/debugging
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      userMessage: this.userMessage,
      category: this.category,
      severity: this.severity,
      code: this.code,
      suggestions: this.suggestions,
      context: this.context,
      stack: this.stack,
      originalError: this.originalError ? {
        name: this.originalError.name,
        message: this.originalError.message,
        stack: this.originalError.stack
      } : null
    };
  }
}

/**
 * Error handler with predefined error types and messaging
 */
class ErrorHandler {
  /**
   * Create a validation error
   */
  static validation(message, options = {}) {
    return new LowkeyError(message, {
      category: ErrorCategory.VALIDATION,
      severity: ErrorSeverity.MEDIUM,
      code: 'VALIDATION_ERROR',
      ...options
    });
  }

  /**
   * Create an authentication error
   */
  static authentication(message, options = {}) {
    return new LowkeyError(message, {
      category: ErrorCategory.AUTHENTICATION,
      severity: ErrorSeverity.HIGH,
      code: 'AUTH_ERROR',
      suggestions: [
        'Check your AWS credentials configuration',
        'Verify AWS_REGION environment variable is set',
        'Run "aws configure" to set up your credentials'
      ],
      ...options
    });
  }

  /**
   * Create a network error  
   */
  static network(message, options = {}) {
    return new LowkeyError(message, {
      category: ErrorCategory.NETWORK,
      severity: ErrorSeverity.HIGH,
      code: 'NETWORK_ERROR',
      suggestions: [
        'Check your internet connection',
        'Verify the service endpoint is accessible',
        'Try again in a few moments'
      ],
      ...options
    });
  }

  /**
   * Create a file system error
   */
  static fileSystem(message, options = {}) {
    return new LowkeyError(message, {
      category: ErrorCategory.FILE_SYSTEM,
      severity: ErrorSeverity.MEDIUM,
      code: 'FILE_ERROR',
      suggestions: [
        'Check file permissions',
        'Verify the file path exists',
        'Ensure you have write access to the directory'
      ],
      ...options
    });
  }

  /**
   * Create a configuration error
   */
  static configuration(message, options = {}) {
    return new LowkeyError(message, {
      category: ErrorCategory.CONFIGURATION,
      severity: ErrorSeverity.MEDIUM,
      code: 'CONFIG_ERROR',
      ...options
    });
  }

  /**
   * Create a provider-specific error (AWS, Kubernetes, etc.)
   */
  static provider(providerName, message, options = {}) {
    return new LowkeyError(message, {
      category: ErrorCategory.PROVIDER_ERROR,
      severity: ErrorSeverity.HIGH,
      code: `${providerName.toUpperCase()}_ERROR`,
      context: { provider: providerName },
      ...options
    });
  }

  /**
   * Create a user input error
   */
  static userInput(message, options = {}) {
    return new LowkeyError(message, {
      category: ErrorCategory.USER_INPUT,
      severity: ErrorSeverity.LOW,
      code: 'USER_INPUT_ERROR',
      ...options
    });
  }

  /**
   * Wrap an existing error with better context
   */
  static wrap(originalError, userMessage, options = {}) {
    const category = this._categorizeError(originalError);
    
    return new LowkeyError(userMessage || originalError.message, {
      category,
      severity: ErrorSeverity.HIGH,
      code: options.code || `${category.toUpperCase()}_ERROR`,
      originalError,
      userMessage,
      ...options
    });
  }

  /**
   * Handle AWS-specific errors with better messaging
   */
  static aws(originalError, context = {}) {
    const { secretName, region, operation } = context;
    
    if (originalError.code === 'ResourceNotFoundException') {
      return this.provider('aws', `Secret '${secretName}' not found in region ${region}`, {
        suggestions: [
          'Check the secret name spelling',
          'Verify you\'re using the correct AWS region',
          'Ensure the secret exists in AWS Secrets Manager'
        ],
        context
      });
    }
    
    if (originalError.code === 'UnauthorizedOperation' || originalError.code === 'AccessDenied') {
      return this.authentication(`Access denied for AWS ${operation}`, {
        context,
        suggestions: [
          'Check your AWS IAM permissions',
          'Ensure your AWS credentials are valid',
          'Verify you have the required IAM policies attached'
        ]
      });
    }
    
    if (originalError.code === 'InvalidParameterException') {
      return this.validation(`Invalid parameter for AWS operation: ${originalError.message}`, {
        context,
        suggestions: [
          'Check your input parameters',
          'Verify the secret name format',
          'Ensure all required parameters are provided'
        ]
      });
    }
    
    return this.provider('aws', `AWS operation failed: ${originalError.message}`, {
      originalError,
      context,
      suggestions: [
        'Check AWS service status',
        'Verify your AWS credentials and permissions',
        'Try the operation again'
      ]
    });
  }

  /**
   * Handle Kubernetes-specific errors
   */
  static kubernetes(originalError, context = {}) {
    const { secretName, namespace, operation } = context;
    
    if (originalError.message.includes('not found')) {
      if (secretName) {
        return this.provider('kubernetes', `Secret '${secretName}' not found in namespace '${namespace}'`, {
          suggestions: [
            'Check the secret name spelling',
            'Verify you\'re in the correct Kubernetes namespace',
            'Ensure the secret exists: kubectl get secrets -n ' + namespace
          ],
          context
        });
      } else if (namespace) {
        return this.provider('kubernetes', `Namespace '${namespace}' not found`, {
          suggestions: [
            'Check the namespace name spelling',
            'List available namespaces: kubectl get namespaces',
            'Create the namespace: kubectl create namespace ' + namespace
          ],
          context
        });
      }
    }
    
    if (originalError.message.includes('command not found') || originalError.message.includes('kubectl')) {
      return this.configuration('kubectl command not found', {
        suggestions: [
          'Install kubectl: https://kubernetes.io/docs/tasks/tools/',
          'Ensure kubectl is in your PATH',
          'Verify your Kubernetes cluster connection'
        ],
        context
      });
    }
    
    if (originalError.message.includes('connection refused') || originalError.message.includes('timeout')) {
      return this.network('Cannot connect to Kubernetes cluster', {
        originalError,
        suggestions: [
          'Check your Kubernetes cluster status',
          'Verify your kubeconfig is correct',
          'Ensure you\'re connected to the right cluster context'
        ],
        context
      });
    }
    
    return this.provider('kubernetes', `Kubernetes operation failed: ${originalError.message}`, {
      originalError,
      context,
      suggestions: [
        'Check your Kubernetes cluster connection',
        'Verify your permissions in the namespace',
        'Ensure kubectl is properly configured'
      ]
    });
  }

  /**
   * Handle file system errors with context
   */
  static file(originalError, filePath, operation = 'access') {
    if (originalError.code === 'ENOENT') {
      return this.fileSystem(`File not found: ${filePath}`, {
        suggestions: [
          'Check the file path spelling',
          'Verify the file exists',
          'Ensure you\'re in the correct directory'
        ],
        context: { filePath, operation }
      });
    }
    
    if (originalError.code === 'EACCES') {
      return this.fileSystem(`Permission denied: ${filePath}`, {
        suggestions: [
          'Check file permissions: ls -la ' + filePath,
          'Run with appropriate permissions',
          'Ensure you have access to the parent directory'
        ],
        context: { filePath, operation }
      });
    }
    
    if (originalError.code === 'EISDIR') {
      return this.fileSystem(`Expected file but found directory: ${filePath}`, {
        suggestions: [
          'Specify a file name, not a directory',
          'Check the target path'
        ],
        context: { filePath, operation }
      });
    }
    
    return this.fileSystem(`File operation failed: ${originalError.message}`, {
      originalError,
      context: { filePath, operation }
    });
  }

  /**
   * Categorize error by analyzing the original error
   */
  static _categorizeError(error) {
    const message = error.message?.toLowerCase() || '';
    
    if (message.includes('credential') || message.includes('unauthorized') || message.includes('access denied')) {
      return ErrorCategory.AUTHENTICATION;
    }
    
    if (message.includes('network') || message.includes('timeout') || message.includes('connection')) {
      return ErrorCategory.NETWORK;
    }
    
    if (message.includes('file') || message.includes('directory') || error.code?.startsWith('E')) {
      return ErrorCategory.FILE_SYSTEM;
    }
    
    if (message.includes('validation') || message.includes('invalid') || message.includes('required')) {
      return ErrorCategory.VALIDATION;
    }
    
    return ErrorCategory.UNKNOWN;
  }

  /**
   * Log error for debugging (with sanitization)
   */
  static log(error) {
    const debugLogger = require('./debug-logger');
    
    if (error instanceof LowkeyError) {
      debugLogger.log('LowkeyError', error.toJSON());
    } else {
      debugLogger.log('Error', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
    }
  }

  /**
   * Display error to user and optionally exit
   */
  static handle(error, exitCode = null) {
    this.log(error);
    
    if (error instanceof LowkeyError) {
      console.error(error.getFullMessage());
    } else {
      console.error(colorize(`Error: ${error.message}`, 'red'));
    }
    
    if (exitCode !== null) {
      process.exit(exitCode);
    }
  }
}

module.exports = {
  LowkeyError,
  ErrorHandler,
  ErrorCategory,
  ErrorSeverity
};