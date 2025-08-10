const { colorize } = require('../lib/colors');
const { fetchSecret, parseSecretData } = require('../lib/secrets');

function parseInspectArgs(args) {
  const options = {
    command: 'inspect',
    type: null,
    name: null,
    showValues: false,
    region: null,
    path: '.'
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--type' && i + 1 < args.length) {
      options.type = args[++i];
    } else if (arg === '--name' && i + 1 < args.length) {
      options.name = args[++i];
    } else if (arg === '--show-values') {
      options.showValues = true;
    } else if (arg === '--region' && i + 1 < args.length) {
      options.region = args[++i];
    } else if (arg === '--path' && i + 1 < args.length) {
      options.path = args[++i];
    } else if (arg === '--help' || arg === '-h') {
      showInspectHelp();
      process.exit(0);
    } else {
      console.error(colorize(`Error: Unknown option '${arg}'. Use --help for usage information.`, 'red'));
      showInspectHelp();
      process.exit(1);
    }
  }

  if (!options.type) {
    console.error(colorize('Error: --type is required', 'red'));
    showInspectHelp();
    process.exit(1);
  }

  if (!options.name) {
    console.error(colorize('Error: --name is required', 'red'));
    showInspectHelp();
    process.exit(1);
  }

  if (options.type === 'aws-secrets-manager' && !options.region && !process.env.AWS_REGION && !process.env.AWS_DEFAULT_REGION) {
    console.error(colorize('Error: --region is required when using aws-secrets-manager (or set AWS_REGION/AWS_DEFAULT_REGION environment variable)', 'red'));
    showInspectHelp();
    process.exit(1);
  }

  if (!['aws-secrets-manager', 'json', 'env'].includes(options.type)) {
    console.error(colorize(`Error: Unsupported type '${options.type}'. Supported: aws-secrets-manager, json, env`, 'red'));
    process.exit(1);
  }

  return options;
}

function showInspectHelp() {
  console.log(`
Usage: lowkey inspect --type <type> --name <name> [options]

Inspect a secret to see its keys and optionally values.

Options:
  --type <type>            Storage type (required)
  --name <name>            Secret name or file path (required)
  --show-values            Show actual secret values (default: false, shows only keys)
  --region <region>        AWS region (or use AWS_REGION environment variable)
  --path <path>            Directory path to search for files (default: current directory)
  --help, -h               Show this help message

Supported types:
  aws-secrets-manager      Inspect AWS Secrets Manager secret
  json                     Inspect JSON file
  env                      Inspect environment file

Examples:
  # Inspect AWS secret keys only
  lowkey inspect --type aws-secrets-manager --name myapp-secrets

  # Inspect AWS secret with values
  lowkey inspect --type aws-secrets-manager --name myapp-secrets --show-values

  # Inspect JSON file
  lowkey inspect --type json --name config.json

  # Inspect env file with values
  lowkey inspect --type env --name .env.production --show-values
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