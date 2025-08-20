const { colorize } = require('../lib/core/colors');
const { CommandParser } = require('../lib/cli/command-parser');
const { CommandHandlers } = require('../lib/cli/command-handlers');

function parseCopyArgs(args) {
  const config = CommandParser.getCopyConfig(showCopyHelp);
  const options = CommandParser.parseCommand(args, config);
  
  // Additional validation specific to copy command
  CommandParser.validateCopyCommand(options);
  
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
  // Map CLI options to CommandHandlers format
  const copyOptions = {
    inputType: options.inputType,
    inputName: options.inputName,
    outputType: options.outputType,
    outputName: options.outputName,
    region: options.region,
    namespace: options.namespace,
    outputNamespace: options.outputNamespace, // Pass through outputNamespace if provided
    stage: options.stage,
    autoYes: options.autoYes,
    onProgress: (message) => {
      // Send progress messages to stderr so they don't interfere with stdout output
      console.error(colorize(message, 'gray'));
    }
  };

  const result = await CommandHandlers.copySecret(copyOptions);

  if (!result.success) {
    throw new Error(colorize(result.error, 'red'));
  }

  // Handle different result types
  if (result.type === 'aws-upload') {
    console.error(result.message);
  } else if (result.type === 'kubernetes-upload') {
    console.error(result.message);
  } else if (result.type === 'file-output') {
    console.error(colorize(result.message, 'green'));
  } else if (result.type === 'stdout-output') {
    process.stdout.write(result.content);
  }
}

module.exports = {
  parseCopyArgs,
  showCopyHelp,
  handleCopyCommand
};