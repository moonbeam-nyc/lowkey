const { colorize } = require('../lib/colors');
const { fetchSecret, parseSecretData } = require('../lib/secrets');
const { parseCommonArgs, validateRequiredArgs, validateTypes, handleRegionFallback, validateAwsRegion, createCustomArgHandler } = require('../lib/arg-parser');
const { STORAGE_TYPES } = require('../lib/constants');

function parseInspectArgs(args) {
  const customArgHandler = createCustomArgHandler({
    '--type': { field: 'type', hasValue: true },
    '--name': { field: 'name', hasValue: true }
  });

  const options = parseCommonArgs(args, {
    defaults: { command: 'inspect' },
    showHelp: showInspectHelp,
    customArgs: customArgHandler
  });

  handleRegionFallback(options);

  if (!validateRequiredArgs(options, ['type', 'name'])) {
    showInspectHelp();
    process.exit(1);
  }

  const supportedTypes = STORAGE_TYPES;
  if (!validateTypes(options.type, supportedTypes)) {
    process.exit(1);
  }

  const requiresRegion = options.type === 'aws-secrets-manager';
  if (!validateAwsRegion(options, requiresRegion)) {
    showInspectHelp();
    process.exit(1);
  }

  return options;
}

function showInspectHelp() {
  console.log(`
${colorize('Usage:', 'cyan')} lowkey inspect --type <type> --name <name> [options]

Inspect a secret to see its keys and optionally values.

${colorize('Options:', 'cyan')}
  ${colorize('--type <type>', 'bold')}            Storage type (required)
  ${colorize('--name <name>', 'bold')}            Secret name or file path (required)
  ${colorize('--show-values', 'bold')}            Show actual secret values (default: false, shows only keys)
  ${colorize('--region <region>', 'bold')}        AWS region (or use AWS_REGION environment variable)
  ${colorize('--path <path>', 'bold')}            Directory path to search for files (default: current directory)
  ${colorize('--help, -h', 'bold')}               Show this help message

${colorize('Supported types:', 'cyan')}
  ${colorize('aws-secrets-manager', 'bold')}      Inspect AWS Secrets Manager secret
  ${colorize('json', 'bold')}                     Inspect JSON file
  ${colorize('env', 'bold')}                      Inspect environment file

${colorize('Examples:', 'cyan')}
  ${colorize('# Inspect AWS secret keys only', 'gray')}
  lowkey ${colorize('inspect', 'bold')} --type aws-secrets-manager --name myapp-secrets

  ${colorize('# Inspect AWS secret with values', 'gray')}
  lowkey ${colorize('inspect', 'bold')} --type aws-secrets-manager --name myapp-secrets --show-values

  ${colorize('# Inspect JSON file', 'gray')}
  lowkey ${colorize('inspect', 'bold')} --type json --name config.json

  ${colorize('# Inspect env file with values', 'gray')}
  lowkey ${colorize('inspect', 'bold')} --type env --name .env.production --show-values
`);
}

async function handleInspectCommand(options) {
  try {
    console.error(colorize(`Inspecting ${options.type}: '${options.name}'...`, 'gray'));
    
    // Fetch the secret data using the same format as copy command
    const fetchOptions = {
      inputType: options.type,
      inputName: options.name,
      region: options.region
    };
    
    const secretString = await fetchSecret(fetchOptions);
    const secretData = parseSecretData(secretString);
    
    if (typeof secretData !== 'object' || secretData === null) {
      console.error(colorize('Error: Secret data is not in a valid key-value format', 'red'));
      process.exit(1);
    }
    
    const keys = Object.keys(secretData);
    
    if (keys.length === 0) {
      console.log(colorize('No keys found in the secret', 'yellow'));
      return;
    }
    
    console.log(colorize(`Found ${keys.length} key(s):`, 'green'));
    console.log('');
    
    // Sort keys for consistent output
    keys.sort().forEach(key => {
      if (options.showValues) {
        const value = secretData[key];
        console.log(`  ${colorize(key, 'bright')}: ${colorize(value, 'cyan')}`);
      } else {
        console.log(`  ${colorize(key, 'bright')}`);
      }
    });
    
    if (!options.showValues) {
      console.log('');
      console.log(colorize('Use --show-values to see the actual values', 'gray'));
    }
    
  } catch (error) {
    console.error(colorize(`Error inspecting secret: ${error.message}`, 'red'));
    process.exit(1);
  }
}

module.exports = {
  parseInspectArgs,
  showInspectHelp,
  handleInspectCommand
};