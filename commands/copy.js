const fs = require('fs');
const { colorize } = require('../lib/colors');
const { fetchSecret, parseSecretData, generateOutput } = require('../lib/secrets');
const { validateEnvKey, backupFile } = require('../lib/files');

function parseCopyArgs(args) {
  const options = {
    command: 'copy',
    inputType: null,
    inputName: null,
    region: null,
    outputType: null,
    outputName: null,
    stage: 'AWSCURRENT',
    autoYes: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--input-type' && i + 1 < args.length) {
      options.inputType = args[++i];
    } else if (arg === '--input-name' && i + 1 < args.length) {
      options.inputName = args[++i];
    } else if (arg === '--region' && i + 1 < args.length) {
      options.region = args[++i];
    } else if (arg === '--output-type' && i + 1 < args.length) {
      options.outputType = args[++i];
    } else if (arg === '--output-name' && i + 1 < args.length) {
      options.outputName = args[++i];
    } else if (arg === '--stage' && i + 1 < args.length) {
      options.stage = args[++i];
    } else if (arg === '-y' || arg === '--yes') {
      options.autoYes = true;
    } else if (arg === '--help' || arg === '-h') {
      showCopyHelp();
      process.exit(0);
    } else {
      console.error(colorize(`Error: Unknown option '${arg}'`, 'red'));
      showCopyHelp();
      process.exit(1);
    }
  }

  if (!options.inputType) {
    console.error(colorize('Error: --input-type is required', 'red'));
    showCopyHelp();
    process.exit(1);
  }

  if (!options.inputName) {
    console.error(colorize('Error: --input-name is required', 'red'));
    showCopyHelp();
    process.exit(1);
  }

  if (!options.outputType) {
    console.error(colorize('Error: --output-type is required', 'red'));
    showCopyHelp();
    process.exit(1);
  }

  if ((options.inputType === 'aws-secrets-manager' || options.outputType === 'aws-secrets-manager') && !options.region && !process.env.AWS_REGION && !process.env.AWS_DEFAULT_REGION) {
    console.error(colorize('Error: --region is required when using aws-secrets-manager as input or output type (or set AWS_REGION/AWS_DEFAULT_REGION environment variable)', 'red'));
    showCopyHelp();
    process.exit(1);
  }

  if (!['aws-secrets-manager', 'json', 'env'].includes(options.inputType)) {
    console.error(colorize(`Error: Unsupported input type '${options.inputType}'. Supported: aws-secrets-manager, json, env`, 'red'));
    process.exit(1);
  }

  if (!['env', 'json', 'aws-secrets-manager'].includes(options.outputType)) {
    console.error(colorize(`Error: Unsupported output type '${options.outputType}'. Supported: env, json, aws-secrets-manager`, 'red'));
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