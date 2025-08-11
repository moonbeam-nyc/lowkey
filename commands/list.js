const { colorize } = require('../lib/colors');
const { listAwsSecrets } = require('../lib/aws');
const { listEnvFiles, listJsonFiles } = require('../lib/files');
const { parseCommonArgs, validateRequiredArgs, validateTypes, handleRegionFallback, validateAwsRegion, createCustomArgHandler } = require('../lib/arg-parser');
const { STORAGE_TYPES } = require('../lib/constants');

function parseListArgs(args) {
  const customArgHandler = createCustomArgHandler({
    '--type': { field: 'type', hasValue: true }
  });

  const options = parseCommonArgs(args, {
    defaults: { command: 'list' },
    showHelp: showListHelp,
    customArgs: customArgHandler
  });

  handleRegionFallback(options);

  if (!validateRequiredArgs(options, ['type'])) {
    showListHelp();
    process.exit(1);
  }

  const supportedTypes = STORAGE_TYPES;
  if (!validateTypes(options.type, supportedTypes)) {
    process.exit(1);
  }

  const requiresRegion = options.type === 'aws-secrets-manager';
  if (!validateAwsRegion(options, requiresRegion)) {
    showListHelp();
    process.exit(1);
  }

  return options;
}

function showListHelp() {
  console.log(`
Usage: lowkey list --type <type> [options]

List available secrets for each storage type.

Options:
  --type <type>            Storage type to list (required)
  --region <region>        AWS region (or use AWS_REGION environment variable)
  --path <path>            Directory path to search for files (default: current directory)
  --help, -h               Show this help message

Supported types:
  aws-secrets-manager      List AWS Secrets Manager secrets visible to this account
  json                     List *.json files
  env                      List .env* files

Examples:
  # List AWS secrets
  lowkey list --type aws-secrets-manager --region us-east-1

  # List env files in current directory
  lowkey list --type env

  # List JSON files in specific directory
  lowkey list --type json --path ./config
`);
}

async function handleListCommand(options) {
  console.error(colorize(`Listing ${options.type} secrets...`, 'gray'));
  
  switch (options.type) {
    case 'aws-secrets-manager':
      const secrets = await listAwsSecrets(options.region);
      if (secrets.length === 0) {
        console.log(colorize('No secrets found in AWS Secrets Manager', 'yellow'));
      } else {
        console.log(colorize(`Found ${secrets.length} secret(s):`, 'green'));
        secrets.sort((a, b) => a.Name.localeCompare(b.Name)).forEach(secret => {
          const lastChanged = secret.LastChangedDate ? new Date(secret.LastChangedDate).toISOString().split('T')[0] : 'Unknown';
          console.log(`  ${colorize(secret.Name, 'bright')} ${colorize(`(last changed: ${lastChanged})`, 'gray')}`);
        });
      }
      break;
      
    case 'env':
      const envFiles = listEnvFiles(options.path);
      if (envFiles.length === 0) {
        console.log(colorize(`No .env* files found in ${options.path}`, 'yellow'));
      } else {
        console.log(colorize(`Found ${envFiles.length} .env file(s):`, 'green'));
        envFiles.forEach(file => {
          console.log(`  ${colorize(file, 'bright')}`);
        });
      }
      break;
      
    case 'json':
      const jsonFiles = listJsonFiles(options.path);
      if (jsonFiles.length === 0) {
        console.log(colorize(`No *.json files found in ${options.path}`, 'yellow'));
      } else {
        console.log(colorize(`Found ${jsonFiles.length} JSON file(s):`, 'green'));
        jsonFiles.forEach(file => {
          console.log(`  ${colorize(file, 'bright')}`);
        });
      }
      break;
      
    default:
      throw new Error(`Unsupported type: ${options.type}`);
  }
}

module.exports = {
  parseListArgs,
  showListHelp,
  handleListCommand
};