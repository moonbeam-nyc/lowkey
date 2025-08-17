// Configuration constants for lowkey CLI

// Interactive terminal rendering
const INTERACTIVE = {
  // Rendering performance - ~60fps
  RENDER_TIMEOUT_MS: 16,
  
  // Terminal display calculations
  DEFAULT_TERMINAL_HEIGHT: 24,
  MIN_AVAILABLE_HEIGHT: 3,
  RESERVED_LINES_FOR_UI: 6,
  
  // Value display
  VALUE_TRUNCATION_LENGTH: 60,
  VALUE_TRUNCATION_SUFFIX: '...',
  
  // Pagination
  PAGE_SIZE_DIVISOR: 2, // Page size = terminal height / 2
};

// File operations
const FILES = {
  // Standard JSON files to exclude when listing JSON files
  JSON_EXCLUDE_LIST: [
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    'jsconfig.json',
    'webpack.config.json',
    'vite.config.json',
    'rollup.config.json',
    'babel.config.json',
    '.eslintrc.json',
    '.prettierrc.json',
    'jest.config.json',
    'tailwind.config.json',
    'next.config.json',
    'nuxt.config.json',
    'angular.json',
    'composer.json',
    'manifest.json',
    'vercel.json',
    'netlify.json'
  ],
  
  // File backup extension
  BACKUP_EXTENSION: '.bak'
};

// AWS configuration
const AWS = {
  // Default version stage for secrets
  DEFAULT_STAGE: 'AWSCURRENT',
  
  // AWS regions list for profile selection
  REGIONS: [
    'us-east-1',
    'us-east-2', 
    'us-west-1',
    'us-west-2',
    'ca-central-1',
    'eu-west-1',
    'eu-west-2',
    'eu-west-3',
    'eu-central-1',
    'eu-north-1',
    'ap-northeast-1',
    'ap-northeast-2',
    'ap-southeast-1',
    'ap-southeast-2',
    'ap-south-1',
    'sa-east-1'
  ]
};

// Kubernetes configuration
const KUBERNETES = {
  // Default namespace
  DEFAULT_NAMESPACE: 'default',
  
  // Default context (can be overridden)
  DEFAULT_CONTEXT: null, // Use current context
  
  // Secret type for lowkey-managed secrets
  SECRET_TYPE: 'Opaque'
};

// Supported storage types
const STORAGE_TYPES = ['aws-secrets-manager', 'json', 'env', 'kubernetes'];

// Environment variable patterns
const ENV = {
  // Valid environment variable key pattern
  KEY_PATTERN: /^[A-Za-z_][A-Za-z0-9_]*$/,
  
  // Environment variable parsing pattern
  LINE_PATTERN: /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/
};

module.exports = {
  INTERACTIVE,
  FILES,
  AWS,
  KUBERNETES,
  STORAGE_TYPES,
  ENV
};