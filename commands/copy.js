const fs = require('fs');
const { colorize } = require('../lib/colors');
const { fetchSecret, parseSecretData, generateOutput } = require('../lib/secrets');
const { validateEnvKey, backupFile } = require('../lib/files');
const { parseCommonArgs, validateRequiredArgs, validateTypes, handleRegionFallback, validateAwsRegion, createCustomArgHandler } = require('../lib/arg-parser');
const { STORAGE_TYPES } = require('../lib/constants');

function parseCopyArgs(args) {
  const customArgHandler = createCustomArgHandler({
    '--input-type': { field: 'inputType', hasValue: true },
    '--input-name': { field: 'inputName', hasValue: true },
    '--output-type': { field: 'outputType', hasValue: true },
    '--output-name': { field: 'outputName', hasValue: true },
    '--namespace': { field: 'namespace', hasValue: true }
  });

  const options = parseCommonArgs(args, {
    defaults: { command: 'copy' },
    showHelp: showCopyHelp,
    customArgs: customArgHandler
  });

  handleRegionFallback(options);

  if (!validateRequiredArgs(options, ['inputType', 'inputName', 'outputType'])) {
    showCopyHelp();
    process.exit(1);
  }

  const supportedTypes = STORAGE_TYPES;
  if (!validateTypes(options.inputType, supportedTypes)) {
    process.exit(1);
  }

  if (!validateTypes(options.outputType, supportedTypes)) {
    process.exit(1);
  }

  const requiresRegion = options.inputType === 'aws-secrets-manager' || options.outputType === 'aws-secrets-manager';
  if (!validateAwsRegion(options, requiresRegion)) {
    showCopyHelp();
    process.exit(1);
  }

  // Validate namespace for kubernetes
  const requiresNamespace = options.inputType === 'kubernetes' || options.outputType === 'kubernetes';
  if (requiresNamespace && !options.namespace) {
    console.error(colorize('Error: --namespace is required when using kubernetes type', 'red'));
    process.exit(1);
  }

  return options;
}

function showCopyHelp() {
  console.log(`
${colorize('Usage:', 'cyan')} lowkey copy --input-type <type> --input-name <name|path> --output-type <type> [options]

Copy secrets between different storage types.

${colorize('Options:', 'cyan')}
  ${colorize('--input-type <type>', 'bold')}      Input source type (required)
  ${colorize('--input-name <name>', 'bold')}      Input source name/path (required)
  ${colorize('--region <region>', 'bold')}        AWS region (or use AWS_REGION environment variable)
  ${colorize('--namespace <namespace>', 'bold')}  Kubernetes namespace (required for kubernetes type)
  ${colorize('--output-type <type>', 'bold')}     Output format (required)
  ${colorize('--output-name <file>', 'bold')}     Output file path (default: stdout)
  ${colorize('--stage <stage>', 'bold')}          Secret version stage (default: AWSCURRENT)
  ${colorize('-y, --yes', 'bold')}                Auto-confirm prompts (e.g., secret creation)
  ${colorize('--help, -h', 'bold')}               Show this help message

${colorize('Supported types:', 'cyan')}
  ${colorize('aws-secrets-manager', 'bold')}      AWS Secrets Manager
  ${colorize('json', 'bold')}                     JSON file
  ${colorize('env', 'bold')}                      Environment file (.env format)
  ${colorize('kubernetes', 'bold')}               Kubernetes secrets

${colorize('Examples:', 'cyan')}
  ${colorize('# AWS Secrets Manager to stdout', 'gray')}
  lowkey ${colorize('copy', 'bold')} --input-type aws-secrets-manager --input-name my-app-secrets --output-type env

  ${colorize('# JSON file to env file', 'gray')}
  lowkey ${colorize('copy', 'bold')} --input-type json --input-name secrets.json --output-type env --output-name .env

  ${colorize('# Env file to JSON', 'gray')}
  lowkey ${colorize('copy', 'bold')} --input-type env --input-name .env --output-type json

  ${colorize('# AWS to JSON file', 'gray')}
  lowkey ${colorize('copy', 'bold')} --input-type aws-secrets-manager --input-name my-secrets --output-type json --output-name config.json

  ${colorize('# Upload JSON file to AWS Secrets Manager', 'gray')}
  lowkey ${colorize('copy', 'bold')} --input-type json --input-name config.json --output-type aws-secrets-manager --output-name my-uploaded-secret

  ${colorize('# Auto-create secret if it doesn\'t exist', 'gray')}
  lowkey ${colorize('copy', 'bold')} --input-type env --input-name .env --output-type aws-secrets-manager --output-name new-secret -y

  ${colorize('# Copy from Kubernetes secret to JSON file', 'gray')}
  lowkey ${colorize('copy', 'bold')} --input-type kubernetes --input-name my-app-secret --namespace default --output-type json --output-name secrets.json

  ${colorize('# Copy from JSON to Kubernetes secret', 'gray')}
  lowkey ${colorize('copy', 'bold')} --input-type json --input-name config.json --output-type kubernetes --output-name app-config --namespace production
`);
}

async function handleCopyCommand(options) {
  // Send progress messages to stderr so they don't interfere with stdout output
  console.error(colorize(`Fetching data from ${options.inputType}: '${options.inputName}'...`, 'gray'));
  const secretString = await fetchSecret(options);
  
  console.error(colorize('Parsing secret data...', 'gray'));
  const secretData = parseSecretData(secretString);
  
  // Validate keys for env output type
  if (options.outputType === 'env') {
    for (const key of Object.keys(secretData)) {
      if (!validateEnvKey(key)) {
        throw new Error(colorize(`Invalid environment variable key: '${key}'. Keys must match pattern [A-Za-z_][A-Za-z0-9_]*`, 'red'));
      }
    }
  }
  
  // Handle output based on type
  if (options.outputType === 'aws-secrets-manager') {
    // AWS Secrets Manager requires an output name
    if (!options.outputName) {
      throw new Error(colorize('--output-name is required when output type is aws-secrets-manager', 'red'));
    }
    
    console.error(colorize('Uploading to AWS Secrets Manager...', 'gray'));
    const result = await generateOutput(secretData, options.outputType, options.outputName, options.region, options.stage, options.autoYes);
    console.error(result);
    
  } else if (options.outputType === 'kubernetes') {
    // Kubernetes requires an output name (secret name)
    if (!options.outputName) {
      throw new Error(colorize('--output-name is required when output type is kubernetes', 'red'));
    }
    
    console.error(colorize('Uploading to Kubernetes...', 'gray'));
    const result = await generateOutput(secretData, options.outputType, options.outputName, options.region, options.stage, options.autoYes, options.namespace);
    console.error(result);
    
  } else {
    // File or stdout output
    const outputContent = await generateOutput(secretData, options.outputType, options.outputName, options.region, options.stage, options.autoYes);
    
    if (options.outputName) {
      // Output to file
      backupFile(options.outputName);
      fs.writeFileSync(options.outputName, outputContent);
      
      const keyCount = Object.keys(secretData).length;
      const itemType = options.outputType === 'env' ? 'environment variables' : 'keys';
      console.error(colorize(`Successfully written to ${options.outputName} (${keyCount} ${itemType})`, 'green'));
    } else {
      // Output to stdout
      process.stdout.write(outputContent);
    }
  }
}

module.exports = {
  parseCopyArgs,
  showCopyHelp,
  handleCopyCommand
};