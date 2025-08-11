const fs = require('fs');
const { colorize } = require('../lib/colors');
const { fetchSecret, parseSecretData, generateOutput } = require('../lib/secrets');
const { validateEnvKey, backupFile } = require('../lib/files');
const { parseCommonArgs, validateRequiredArgs, validateTypes, handleRegionFallback, validateAwsRegion, createCustomArgHandler } = require('../lib/arg-parser');

function parseCopyArgs(args) {
  const customArgHandler = createCustomArgHandler({
    '--input-type': { field: 'inputType', hasValue: true },
    '--input-name': { field: 'inputName', hasValue: true },
    '--output-type': { field: 'outputType', hasValue: true },
    '--output-name': { field: 'outputName', hasValue: true }
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

  const supportedTypes = ['aws-secrets-manager', 'json', 'env'];
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

  return options;
}

function showCopyHelp() {
  console.log(`
Usage: lowkey copy --input-type <type> --input-name <name|path> --output-type <type> [options]

Copy secrets between different storage types.

Options:
  --input-type <type>      Input source type (required)
  --input-name <name>      Input source name/path (required)
  --region <region>        AWS region (or use AWS_REGION environment variable)
  --output-type <type>     Output format (required)
  --output-name <file>     Output file path (default: stdout)
  --stage <stage>          Secret version stage (default: AWSCURRENT)
  -y, --yes                Auto-confirm prompts (e.g., secret creation)
  --help, -h               Show this help message

Supported types:
  aws-secrets-manager      AWS Secrets Manager
  json                     JSON file
  env                      Environment file (.env format)

Examples:
  # AWS Secrets Manager to stdout
  lowkey copy --input-type aws-secrets-manager --input-name my-app-secrets --output-type env

  # JSON file to env file
  lowkey copy --input-type json --input-name secrets.json --output-type env --output-name .env

  # Env file to JSON
  lowkey copy --input-type env --input-name .env --output-type json

  # AWS to JSON file
  lowkey copy --input-type aws-secrets-manager --input-name my-secrets --output-type json --output-name config.json

  # Upload JSON file to AWS Secrets Manager
  lowkey copy --input-type json --input-name config.json --output-type aws-secrets-manager --output-name my-uploaded-secret

  # Auto-create secret if it doesn't exist
  lowkey copy --input-type env --input-name .env --output-type aws-secrets-manager --output-name new-secret -y
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