const { colorize } = require('../core/colors');
const { config } = require('../core/config');

function parseCommonArgs(args, validOptions = {}) {
  const options = {
    region: null,
    path: config.get('files.defaultPath', '.'),
    autoYes: false,
    showValues: false,
    stage: config.get('aws.defaultStage', 'AWSCURRENT'),
    ...validOptions.defaults
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--region' && i + 1 < args.length) {
      options.region = args[++i];
    } else if (arg === '--path' && i + 1 < args.length) {
      options.path = args[++i];
    } else if (arg === '--stage' && i + 1 < args.length) {
      options.stage = args[++i];
    } else if (arg === '-y' || arg === '--yes') {
      options.autoYes = true;
    } else if (arg === '--show-values') {
      options.showValues = true;
    } else if (arg === '--help' || arg === '-h') {
      if (validOptions.showHelp) {
        validOptions.showHelp();
        process.exit(0);
      }
    } else if (validOptions.customArgs && validOptions.customArgs(arg, args, i, options)) {
      // Custom argument was handled, skip to next
      i = validOptions.customArgs(arg, args, i, options) - 1 || i;
    } else {
      console.error(colorize(`Error: Unknown option '${arg}'`, 'red'));
      if (validOptions.showHelp) {
        validOptions.showHelp();
      }
      process.exit(1);
    }
  }

  return options;
}

function validateRequiredArgs(options, required) {
  for (const field of required) {
    if (!options[field]) {
      console.error(colorize(`Error: --${field.replace(/([A-Z])/g, '-$1').toLowerCase()} is required`, 'red'));
      return false;
    }
  }
  return true;
}

function validateTypes(type, supportedTypes) {
  if (!supportedTypes.includes(type)) {
    console.error(colorize(`Error: Unsupported type '${type}'. Supported: ${supportedTypes.join(', ')}`, 'red'));
    return false;
  }
  return true;
}

function handleRegionFallback(options) {
  if (!options.region) {
    // Get AWS region from config first, but fallback to direct env access for test compatibility
    let region = config.getAwsRegion();
    if (!region) {
      region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || null;
    }
    options.region = region;
  }
}

function validateAwsRegion(options, requiresRegion = false) {
  if (requiresRegion && !options.region) {
    console.error(colorize('Error: --region is required when using aws-secrets-manager (or set AWS_REGION/AWS_DEFAULT_REGION environment variable)', 'red'));
    return false;
  }
  return true;
}

function createCustomArgHandler(argMap) {
  return (arg, args, i, options) => {
    if (argMap[arg]) {
      const handler = argMap[arg];
      if (handler.hasValue && i + 1 < args.length) {
        options[handler.field] = args[++i];
        return i + 1;
      } else if (!handler.hasValue) {
        options[handler.field] = handler.value !== undefined ? handler.value : true;
        return i + 1;
      }
    }
    return false;
  };
}

module.exports = {
  parseCommonArgs,
  validateRequiredArgs,
  validateTypes,
  handleRegionFallback,
  validateAwsRegion,
  createCustomArgHandler
};