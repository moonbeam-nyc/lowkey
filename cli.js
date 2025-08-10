#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { SecretsManagerClient, GetSecretValueCommand, PutSecretValueCommand, CreateSecretCommand, ListSecretsCommand } = require('@aws-sdk/client-secrets-manager');

// Global error handlers for debugging
process.on('uncaughtException', (error) => {
  console.error('\x1b[31mUNCAUGHT EXCEPTION:\x1b[0m', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('\x1b[31mUNHANDLED REJECTION:\x1b[0m', reason);
  console.error('Promise:', promise);
  process.exit(1);
});

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

function colorize(text, color) {
  // Only colorize if outputting to a terminal
  if (process.stderr.isTTY) {
    return `${colors[color]}${text}${colors.reset}`;
  }
  return text;
}

function parseArgs() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    showHelp();
    process.exit(1);
  }
  
  const command = args[0];
  
  if (command === '--version' || command === '-v') {
    showVersion();
    process.exit(0);
  } else if (command === '--help' || command === '-h') {
    showHelp();
    process.exit(0);
  }
  
  if (!['copy', 'list', 'inspect', 'interactive', 'x'].includes(command)) {
    console.error(colorize(`Error: Unknown command '${command}'. Available commands: copy, list, inspect, interactive (x)`, 'red'));
    showHelp();
    process.exit(1);
  }
  
  if (command === 'copy') {
    return parseCopyArgs(args.slice(1));
  } else if (command === 'list') {
    return parseListArgs(args.slice(1));
  } else if (command === 'inspect') {
    return parseInspectArgs(args.slice(1));
  } else if (command === 'interactive' || command === 'x') {
    return parseInteractiveArgs(args.slice(1));
  }
}

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

function parseListArgs(args) {
  const options = {
    command: 'list',
    type: null,
    region: null,
    path: '.'
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--type' && i + 1 < args.length) {
      options.type = args[++i];
    } else if (arg === '--region' && i + 1 < args.length) {
      options.region = args[++i];
    } else if (arg === '--path' && i + 1 < args.length) {
      options.path = args[++i];
    } else if (arg === '--help' || arg === '-h') {
      showListHelp();
      process.exit(0);
    } else {
      console.error(colorize(`Error: Unknown option '${arg}'`, 'red'));
      showListHelp();
      process.exit(1);
    }
  }

  if (!options.type) {
    console.error(colorize('Error: --type is required', 'red'));
    showListHelp();
    process.exit(1);
  }

  if (options.type === 'aws-secrets-manager' && !options.region && !process.env.AWS_REGION && !process.env.AWS_DEFAULT_REGION) {
    console.error(colorize('Error: --region is required when listing aws-secrets-manager (or set AWS_REGION/AWS_DEFAULT_REGION environment variable)', 'red'));
    showListHelp();
    process.exit(1);
  }

  if (!['aws-secrets-manager', 'json', 'env'].includes(options.type)) {
    console.error(colorize(`Error: Unsupported type '${options.type}'. Supported: aws-secrets-manager, json, env`, 'red'));
    process.exit(1);
  }

  return options;
}

function parseInspectArgs(args) {
  const options = {
    command: 'inspect'
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--help' || arg === '-h') {
      showInspectHelp();
      process.exit(0);
    } else {
      console.error(colorize(`Error: Unknown option '${arg}'. Use --help for usage information.`, 'red'));
      showInspectHelp();
      process.exit(1);
    }
  }

  return options;
}

function parseInteractiveArgs(args) {
  const options = {
    command: 'interactive',
    region: null,
    path: '.'
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--region' && i + 1 < args.length) {
      options.region = args[++i];
    } else if (arg === '--path' && i + 1 < args.length) {
      options.path = args[++i];
    } else if (arg === '--help' || arg === '-h') {
      showInteractiveHelp();
      process.exit(0);
    } else {
      console.error(colorize(`Error: Unknown option '${arg}'`, 'red'));
      showInteractiveHelp();
      process.exit(1);
    }
  }

  return options;
}

function showVersion() {
  const packageJson = require('./package.json');
  console.log(`lowkey v${packageJson.version}`);
}

function promptUser(question) {
  return new Promise((resolve) => {
    process.stdin.setEncoding('utf8');
    process.stderr.write(colorize(question, 'cyan'));
    
    process.stdin.once('data', (data) => {
      const answer = data.toString().trim().toLowerCase();
      resolve(answer === 'y' || answer === 'yes');
    });
  });
}

function showHelp() {
  console.log(`
Usage: lowkey <command> [options]

Commands:
  copy                     Copy secrets between storage types
  list                     List available secrets for each storage type
  inspect                  Show help for inspecting secrets
  interactive, x           Interactive secret browser and inspector

Global Options:
  --version, -v            Show version number
  --help, -h               Show this help message

Use 'lowkey <command> --help' for more information about a command.

Examples:
  lowkey copy --input-type env --input-name .env --output-type json
  lowkey list --type aws-secrets-manager --region us-east-1
  lowkey list --type env --path ./config
  lowkey interactive                   # Interactive secret browser
  lowkey x                            # Same as interactive (alias)
  lowkey inspect --help               # Show inspect help
`);
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

function showInteractiveHelp() {
  console.log(`
Usage: lowkey interactive [options]
       lowkey x [options]

Launch an interactive secret browser and inspector.

Options:
  --region <region>        AWS region (or use AWS_REGION environment variable)
  --path <path>            Directory path to search for files (default: current directory)
  --help, -h               Show this help message

Features:
  • Fuzzy searchable interface for browsing secrets
  • Navigate with arrow keys and type to filter
  • Toggle between showing keys only or keys with values
  • Support for AWS Secrets Manager, environment files, and JSON files
  • Breadcrumb navigation with escape key to go back

Examples:
  # Launch interactive mode
  lowkey interactive

  # Short alias
  lowkey x

  # Specify AWS region
  lowkey x --region us-west-2

  # Search in specific directory for files
  lowkey x --path ./config
`);
}

function validateEnvKey(key) {
  const keyPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;
  return keyPattern.test(key);
}

function escapeEnvValue(value) {
  // Convert to string if not already
  const stringValue = String(value);
  
  // Escape backslashes and double quotes
  let escaped = stringValue
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
  
  // Always wrap in double quotes for safety
  return `"${escaped}"`;
}

function backupFile(filePath) {
  if (fs.existsSync(filePath)) {
    const backupPath = `${filePath}.bak`;
    fs.copyFileSync(filePath, backupPath);
    console.error(colorize(`Backed up existing file to ${backupPath}`, 'yellow'));
  }
}

async function fetchFromAwsSecretsManager(sourceName, region, stage) {
  const clientConfig = region ? { region } : {};
  const client = new SecretsManagerClient(clientConfig);
  
  try {
    const command = new GetSecretValueCommand({
      SecretId: sourceName,
      VersionStage: stage
    });
    
    const response = await client.send(command);
    return response.SecretString;
  } catch (error) {
    if (error.name === 'ResourceNotFoundException') {
      throw new Error(`Secret '${sourceName}' not found in region '${region}'`);
    } else if (error.name === 'InvalidRequestException') {
      throw new Error(`Invalid request: ${error.message}`);
    } else if (error.name === 'InvalidParameterException') {
      throw new Error(`Invalid parameter: ${error.message}`);
    } else if (error.name === 'DecryptionFailureException') {
      throw new Error(`Failed to decrypt secret: ${error.message}`);
    } else if (error.name === 'InternalServiceErrorException') {
      throw new Error(`AWS internal service error: ${error.message}`);
    } else {
      throw new Error(`AWS error: ${error.message}`);
    }
  }
}

async function fetchFromJsonFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return content;
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`JSON file not found: ${filePath}`);
    }
    throw new Error(`Failed to read JSON file: ${error.message}`);
  }
}

function fetchFromEnvFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const envData = {};
    
    // Parse .env file format
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
        if (match) {
          let [, key, value] = match;
          // Remove quotes if present
          if ((value.startsWith('"') && value.endsWith('"')) || 
              (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
            // Unescape common escape sequences
            value = value
              .replace(/\\n/g, '\n')
              .replace(/\\r/g, '\r')
              .replace(/\\"/g, '"')
              .replace(/\\\\/g, '\\');
          }
          envData[key] = value;
        }
      }
    }
    
    return JSON.stringify(envData);
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`Env file not found: ${filePath}`);
    }
    throw new Error(`Failed to read env file: ${error.message}`);
  }
}

async function fetchSecret(options) {
  switch (options.inputType) {
    case 'aws-secrets-manager':
      return await fetchFromAwsSecretsManager(options.inputName, options.region, options.stage);
    case 'json':
      return await fetchFromJsonFile(options.inputName);
    case 'env':
      return fetchFromEnvFile(options.inputName);
    default:
      throw new Error(`Unsupported input type: ${options.inputType}`);
  }
}

function parseSecretData(secretString) {
  let parsed;
  
  try {
    parsed = JSON.parse(secretString);
  } catch (error) {
    throw new Error('Secret value is not valid JSON');
  }
  
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Secret must be a JSON object (not array, null, or primitive)');
  }
  
  // Check that all values are primitives (flat object)
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === 'object' && value !== null) {
      throw new Error(`Secret must be a flat object. Key '${key}' contains nested object/array`);
    }
  }
  
  return parsed;
}

function generateEnvContent(secretData) {
  const lines = [];
  
  for (const [key, value] of Object.entries(secretData)) {
    if (!validateEnvKey(key)) {
      throw new Error(`Invalid environment variable key: '${key}'. Keys must match pattern [A-Za-z_][A-Za-z0-9_]*`);
    }
    
    const escapedValue = escapeEnvValue(value);
    lines.push(`${key}=${escapedValue}`);
  }
  
  return lines.join('\n') + '\n';
}

function generateJsonContent(secretData) {
  return JSON.stringify(secretData, null, 2) + '\n';
}

async function createSecret(client, outputName, secretData) {
  const command = new CreateSecretCommand({
    Name: outputName,
    SecretString: JSON.stringify(secretData)
  });
  
  await client.send(command);
}

async function uploadToAwsSecretsManager(secretData, outputName, region, stage, autoYes) {
  const clientConfig = region ? { region } : {};
  const client = new SecretsManagerClient(clientConfig);
  
  try {
    const command = new PutSecretValueCommand({
      SecretId: outputName,
      SecretString: JSON.stringify(secretData),
      VersionStage: stage
    });
    
    await client.send(command);
    return colorize(`Successfully uploaded to AWS Secrets Manager: ${outputName}`, 'green');
  } catch (error) {
    if (error.name === 'ResourceNotFoundException') {
      // Secret doesn't exist, prompt to create it
      let shouldCreate = autoYes;
      
      if (!autoYes) {
        shouldCreate = await promptUser(`Secret '${outputName}' not found. Create it? (y/N): `);
      }
      
      if (shouldCreate) {
        try {
          await createSecret(client, outputName, secretData);
          return colorize(`Successfully created and uploaded secret: ${outputName}`, 'green');
        } catch (createError) {
          if (createError.name === 'ResourceExistsException') {
            // Secret was created by someone else, try upload again
            const retryCommand = new PutSecretValueCommand({
              SecretId: outputName,
              SecretString: JSON.stringify(secretData),
              VersionStage: stage
            });
            await client.send(retryCommand);
            return colorize(`Successfully uploaded to AWS Secrets Manager: ${outputName}`, 'green');
          } else {
            throw new Error(colorize(`Failed to create secret: ${createError.message}`, 'red'));
          }
        }
      } else {
        throw new Error(colorize(`Secret '${outputName}' not found and creation declined`, 'yellow'));
      }
    } else if (error.name === 'InvalidRequestException') {
      throw new Error(colorize(`Invalid request: ${error.message}`, 'red'));
    } else if (error.name === 'InvalidParameterException') {
      throw new Error(colorize(`Invalid parameter: ${error.message}`, 'red'));
    } else if (error.name === 'EncryptionFailureException') {
      throw new Error(colorize(`Failed to encrypt secret: ${error.message}`, 'red'));
    } else if (error.name === 'InternalServiceErrorException') {
      throw new Error(colorize(`AWS internal service error: ${error.message}`, 'red'));
    } else {
      throw new Error(colorize(`AWS error: ${error.message}`, 'red'));
    }
  }
}

async function generateOutput(secretData, outputType, outputName, region, stage, autoYes) {
  switch (outputType) {
    case 'env':
      return generateEnvContent(secretData);
    case 'json':
      return generateJsonContent(secretData);
    case 'aws-secrets-manager':
      return await uploadToAwsSecretsManager(secretData, outputName, region, stage, autoYes);
    default:
      throw new Error(`Unsupported output type: ${outputType}`);
  }
}

async function listAwsSecrets(region) {
  const clientConfig = region ? { region } : {};
  const client = new SecretsManagerClient(clientConfig);
  
  try {
    let allSecrets = [];
    let nextToken = null;
    
    do {
      const command = new ListSecretsCommand({
        NextToken: nextToken
      });
      
      const response = await client.send(command);
      allSecrets = allSecrets.concat(response.SecretList || []);
      nextToken = response.NextToken;
    } while (nextToken);
    
    return allSecrets;
  } catch (error) {
    if (error.name === 'UnauthorizedOperation' || error.name === 'AccessDeniedException') {
      throw new Error(`Access denied: ${error.message}`);
    } else if (error.name === 'InvalidRequestException') {
      throw new Error(`Invalid request: ${error.message}`);
    } else if (error.name === 'InternalServiceErrorException') {
      throw new Error(`AWS internal service error: ${error.message}`);
    } else {
      throw new Error(`AWS error: ${error.message}`);
    }
  }
}

function listEnvFiles(directory) {
  try {
    const files = fs.readdirSync(directory);
    const envFiles = files.filter(file => {
      const fullPath = path.join(directory, file);
      return fs.statSync(fullPath).isFile() && file.match(/^\.env/);
    });
    
    return envFiles;
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`Directory not found: ${directory}`);
    } else if (error.code === 'EACCES') {
      throw new Error(`Permission denied: ${directory}`);
    }
    throw new Error(`Failed to read directory: ${error.message}`);
  }
}

function listJsonFiles(directory) {
  try {
    const files = fs.readdirSync(directory);
    
    // Common standard JSON files to exclude
    const excludeFiles = [
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
    ];
    
    const jsonFiles = files.filter(file => {
      const fullPath = path.join(directory, file);
      return fs.statSync(fullPath).isFile() && 
             file.endsWith('.json') && 
             !excludeFiles.includes(file.toLowerCase());
    });
    
    return jsonFiles;
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`Directory not found: ${directory}`);
    } else if (error.code === 'EACCES') {
      throw new Error(`Permission denied: ${directory}`);
    }
    throw new Error(`Failed to read directory: ${error.message}`);
  }
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

// handleInspectCommand is no longer needed since inspect just shows help

async function handleInteractiveCommand(options) {
  try {
    // Start the interactive flow immediately
    const interactiveOptions = await runInteractiveInspect(options);
    
    console.error(colorize(`Inspecting ${interactiveOptions.type} secret: '${interactiveOptions.name}'...`, 'gray'));
    
    try {
      // Fetch the secret data - map inspect options to fetchSecret format
      const fetchOptions = {
        inputType: interactiveOptions.type,
        inputName: interactiveOptions.name,
        region: interactiveOptions.region,
        path: interactiveOptions.path
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
      
      // Use interactive key browser
      const breadcrumbs = [`type: ${interactiveOptions.type}`, `name: ${interactiveOptions.name}`];
      const result = await interactiveKeyBrowser(secretData, interactiveOptions.showValues, breadcrumbs);
      
      if (result === 'BACK') {
        // Go back to secret selection - restart the whole flow
        return await handleInteractiveCommand(options);
      }
      
    } catch (error) {
      console.error(colorize(`Error inspecting secret: ${error.message}`, 'red'));
      process.exit(1);
    }
  } catch (error) {
    console.error(colorize(`Fatal error in interactive command: ${error.message}`, 'red'));
    console.error(colorize(`Stack: ${error.stack}`, 'gray'));
    process.exit(1);
  }
}

// Fuzzy search function
function fuzzySearch(query, items) {
  if (!query) return items;
  
  try {
    // Treat query as regex pattern (case-insensitive by default)
    const regex = new RegExp(query, 'i');
    
    return items.filter(item => {
      const name = typeof item === 'string' ? item : (item.Name || item.name || item);
      return regex.test(name);
    });
    
  } catch (error) {
    // If regex is invalid, fall back to simple text search
    const lowerQuery = query.toLowerCase();
    return items.filter(item => {
      const name = typeof item === 'string' ? item : (item.Name || item.name || item);
      return name.toLowerCase().includes(lowerQuery);
    });
  }
}

// Interactive fuzzy search prompt
async function fuzzyPrompt(question, choices, displayFn = null, breadcrumbs = [], errorMessage = null) {
  // Make a copy of breadcrumbs to prevent mutation issues
  const safeBreadcrumbs = Array.isArray(breadcrumbs) ? [...breadcrumbs] : [];
  
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    let query = '';
    let filteredChoices = choices;
    let selectedIndex = 0;
    let lastRenderedLines = 0;
    let renderTimeout = null;
    let searchMode = false;
    
    function render(immediate = false) {
      if (renderTimeout) {
        clearTimeout(renderTimeout);
      }
      
      if (immediate) {
        doRender();
      } else {
        renderTimeout = setTimeout(doRender, 16); // ~60fps
      }
    }
    
    function doRender() {
      try {
        // Move cursor to top 
        process.stdout.write('\x1b[H');
      
      let currentLine = 0;
      
      // Show breadcrumbs if available
      if (safeBreadcrumbs.length > 0) {
        const breadcrumbText = safeBreadcrumbs.join(' > ');
        process.stdout.write('\x1b[K'); // Clear line
        console.log(colorize(`📍 ${breadcrumbText}`, 'gray'));
        process.stdout.write('\x1b[K'); // Clear line
        console.log('');
        currentLine += 2;
      }
      
      process.stdout.write('\x1b[K'); // Clear line
      console.log(colorize(question, 'cyan'));
      
      if (searchMode || query.length > 0) {
        process.stdout.write('\x1b[K'); // Clear line
        console.log(`Search: ${colorize(query, 'bright')}`);
        process.stdout.write('\x1b[K'); // Clear line
        console.log('');
        currentLine += 3;
      } else {
        process.stdout.write('\x1b[K'); // Clear line
        console.log('');
        currentLine += 2;
      }
      
      filteredChoices = fuzzySearch(query, choices);
      
      if (filteredChoices.length === 0) {
        if (choices.length === 0 && errorMessage) {
          // Show error message for empty choices
          process.stdout.write('\x1b[K'); // Clear line
          console.log(colorize('(No items available)', 'yellow'));
        } else {
          // Show no matches found for search query
          process.stdout.write('\x1b[K'); // Clear line
          console.log(colorize('No matches found', 'yellow'));
        }
        currentLine += 1;
        // Clear remaining lines and store count
        process.stdout.write('\x1b[J');
        lastRenderedLines = currentLine;
        return;
      }
      
      // Keep selected index within bounds
      selectedIndex = Math.min(selectedIndex, filteredChoices.length - 1);
      selectedIndex = Math.max(selectedIndex, 0);
      
      // Calculate available height for choices
      const terminalHeight = process.stdout.rows || 24;
      const breadcrumbLines = safeBreadcrumbs.length > 0 ? 2 : 0; // breadcrumb + empty line
      const searchLines = (searchMode || query.length > 0) ? 3 : 2; // Question + Search + empty line OR Question + empty line
      const errorLines = errorMessage ? 2 : 0; // Error message if provided
      const headerLines = searchLines + breadcrumbLines; // Variable based on search mode + breadcrumbs
      const footerLines = 4 + errorLines; // possible "more items" + instructions + error message + empty line + buffer
      const availableHeight = Math.max(3, terminalHeight - headerLines - footerLines);
      
      // Center the selection in the available view
      const halfHeight = Math.floor(availableHeight / 2);
      const startIndex = Math.max(0, selectedIndex - halfHeight);
      const endIndex = Math.min(filteredChoices.length, startIndex + availableHeight);
      
      for (let i = startIndex; i < endIndex; i++) {
        const choice = filteredChoices[i];
        const display = displayFn ? displayFn(choice) : (typeof choice === 'string' ? choice : choice.Name || choice);
        const isSelected = i === selectedIndex && !searchMode;
        const prefix = isSelected ? colorize('> ', 'green') : '  ';
        const color = isSelected ? 'bright' : 'reset';
        process.stdout.write('\x1b[K'); // Clear line
        console.log(`${prefix}${colorize(display, color)}`);
        currentLine += 1;
      }
      
      if (filteredChoices.length > availableHeight) {
        const showing = endIndex - startIndex;
        const remaining = filteredChoices.length - showing;
        if (remaining > 0) {
          process.stdout.write('\x1b[K'); // Clear line
          console.log(colorize(`\n... ${remaining} more items`, 'gray'));
          currentLine += 2;
        }
      }
      
        // Show error message if provided
        if (errorMessage) {
          process.stdout.write('\x1b[K'); // Clear line
          console.log(''); // Empty line
          process.stdout.write('\x1b[K'); // Clear line
          console.log(colorize(`⚠️  ${errorMessage}`, 'red'));
          currentLine += 2;
        }
        
        const escapeText = safeBreadcrumbs.length > 0 ? 'Esc to go back, ' : '';
        const instructions = safeBreadcrumbs.length > 0 
          ? `Use ↑↓/jk to navigate, / or type to search, Enter to select, ${escapeText}Ctrl+C to cancel`
          : `Use ↑↓/jk to navigate, / or type to search, Enter to select, Ctrl+C to exit`;
        process.stdout.write('\x1b[K'); // Clear line
        console.log(''); // Empty line
        process.stdout.write('\x1b[K'); // Clear line
        console.log(colorize(instructions, 'gray'));
        currentLine += 2;
        
        // Clear any remaining lines from previous render
        process.stdout.write('\x1b[J');
        lastRenderedLines = currentLine;
      } catch (error) {
        console.error(colorize(`Render error: ${error.message}`, 'red'));
      }
    }
    
    render(true); // Initial render should be immediate
    
    // Handle raw input for arrow keys
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', (key) => {
      try {
        const keyStr = key.toString();
      
      if (keyStr === '\u0003') { // Ctrl+C
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeAllListeners('data');
        rl.close();
        process.exit(0);
      } else if (keyStr === '\u001b') { // Escape
        if (searchMode) {
          // First escape: exit search mode (preserve search text)
          searchMode = false;
          render(true);
        } else if (query.length > 0) {
          // Second escape: clear search query
          query = '';
          selectedIndex = 0;
          render(true);
        } else if (safeBreadcrumbs && safeBreadcrumbs.length > 0) {
          // Third escape: go back (only if breadcrumbs available)
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.removeAllListeners('data');
          rl.close();
          // Small delay to prevent flicker when going back
          setTimeout(() => resolve(null), 50);
        } else {
          // At top level with no search, ignore escape key - do nothing
        }
      } else if (keyStr === '\r' || keyStr === '\n') { // Enter
        if (filteredChoices.length === 0) {
          // Can't select from empty list, ignore enter
          return;
        }
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeAllListeners('data');
        rl.close();
        resolve(filteredChoices[selectedIndex]);
      } else if (keyStr === '\u001b[A' || keyStr === 'k') { // Up arrow or k
        selectedIndex = Math.max(0, selectedIndex - 1);
        render(true); // Immediate for navigation
      } else if (keyStr === '\u001b[B' || keyStr === 'j') { // Down arrow or j
        selectedIndex = Math.min(filteredChoices.length - 1, selectedIndex + 1);
        render(true); // Immediate for navigation
      } else if (keyStr === '\u007f' || keyStr === '\b') { // Backspace
        query = query.slice(0, -1);
        selectedIndex = 0;
        render(); // Debounced for typing
      } else if (keyStr === '/') { // Forward slash starts search mode
        if (!searchMode) {
          searchMode = true;
          render(true); // Immediate for mode change
        }
      } else if (keyStr.length === 1 && keyStr >= ' ') { // Regular character
        if (searchMode || query.length > 0) {
          query += keyStr;
          selectedIndex = 0;
          render(); // Debounced for typing
        } else if (keyStr === keyStr.toLowerCase() && keyStr >= 'a' && keyStr <= 'z') {
          // Allow letters to start search mode automatically (like k9s)
          searchMode = true;
          query += keyStr;
          selectedIndex = 0;
          render(); // Debounced for typing
        }
      }
      } catch (error) {
        console.error(colorize(`Fuzzy prompt key handler error: ${error.message}`, 'red'));
      }
    });
  });
}

// Interactive yes/no prompt
async function confirmPrompt(question, defaultValue = false) {
  return new Promise((resolve) => {
    const defaultText = defaultValue ? 'Y/n' : 'y/N';
    console.log(colorize(`${question} (${defaultText}): `, 'cyan'));
    
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.once('data', (key) => {
      const keyStr = key.toString().toLowerCase();
      
      process.stdin.setRawMode(false);
      process.stdin.pause();
      
      if (keyStr === '\u0003') { // Ctrl+C
        process.exit(0);
      } else if (keyStr === 'y') {
        console.log('y');
        resolve(true);
      } else if (keyStr === 'n') {
        console.log('n');
        resolve(false);
      } else if (keyStr === '\r' || keyStr === '\n') { // Enter
        console.log(defaultValue ? 'y' : 'n');
        resolve(defaultValue);
      } else {
        // For any other key, use default
        console.log(defaultValue ? 'y' : 'n');
        resolve(defaultValue);
      }
    });
  });
}

async function runInteractiveInspect(options) {
  try {
    let currentStep = 'type';
    let selectedType = null;
    let selectedSecret = null;
    let typeErrorMessage = null;
    
    while (true) {
    if (currentStep === 'type') {
      console.log(colorize('🔍 Interactive Secret Inspector', 'bright'));
      console.log('');
      
      const types = [
        { name: 'aws-secrets-manager', description: 'AWS Secrets Manager' },
        { name: 'env', description: 'Environment files (.env*)' },
        { name: 'json', description: 'JSON files' }
      ];
      
      const result = await fuzzyPrompt(
        'Select secret type:',
        types,
        (type) => `${type.name} - ${type.description}`,
        [], // Empty breadcrumbs = no escape allowed
        typeErrorMessage
      );
      
      if (result === null) {
        // This shouldn't happen at the root level since escape is disabled
        process.exit(0);
      }
      
      selectedType = result;
      
      // Check if the selected type has available secrets before proceeding
      console.log(colorize(`\nChecking ${selectedType.name} secrets...`, 'gray'));
      
      try {
        let choices = [];
        
        if (selectedType.name === 'aws-secrets-manager') {
          const secrets = await listAwsSecrets(options.region);
          choices = secrets.map(secret => ({
            name: secret.Name,
            lastChanged: secret.LastChangedDate ? new Date(secret.LastChangedDate).toISOString().split('T')[0] : 'Unknown'
          }));
        } else if (selectedType.name === 'env') {
          const files = listEnvFiles(options.path || '.');
          choices = files.map(file => ({ name: file }));
        } else if (selectedType.name === 'json') {
          const files = listJsonFiles(options.path || '.');
          choices = files.map(file => ({ name: file }));
        }
        
        if (choices.length === 0) {
          typeErrorMessage = `No ${selectedType.name} secrets found`;
          continue; // Stay on type selection
        }
        
        // Clear error message and proceed to secret selection with fetched choices
        typeErrorMessage = null;
        currentStep = 'secret';
        selectedSecret = { choices }; // Pass choices to next step
        
      } catch (error) {
        typeErrorMessage = `Error accessing ${selectedType.name}: ${error.message}`;
        continue; // Stay on type selection with error
      }
      
    } else if (currentStep === 'secret') {
      // Use pre-fetched choices from type selection
      const choices = selectedSecret.choices;
      
      const result = await fuzzyPrompt(
        `Select ${selectedType.name} secret:`,
        choices,
        (choice) => {
          if (choice.lastChanged) {
            return `${choice.name} ${colorize(`(${choice.lastChanged})`, 'gray')}`;
          }
          return choice.name;
        },
        [`type: ${selectedType.name}`]
      );
      
      if (result === null) {
        // Go back to type selection
        currentStep = 'type';
        continue;
      }
      
      selectedSecret = result;
      break; // Exit the loop to proceed with inspection
    }
  }
  
    options.type = selectedType.name;
    options.name = selectedSecret.name;
    options.showValues = false;
    
    return options;
  } catch (error) {
    console.error(colorize(`Error in interactive inspect: ${error.message}`, 'red'));
    console.error(colorize(`Stack: ${error.stack}`, 'gray'));
    throw error;
  }
}

// Interactive key browser with fuzzy search and value toggle
async function interactiveKeyBrowser(secretData, initialShowValues = false, breadcrumbs = []) {
  return new Promise((resolve) => {
    const keys = Object.keys(secretData).sort();
    let query = '';
    let showValues = initialShowValues;
    let selectedIndex = 0;
    let filteredKeys = keys;
    let lastRenderedLines = 0;
    let renderTimeout = null;
    let searchMode = false;
    
    function render(immediate = false) {
      if (renderTimeout) {
        clearTimeout(renderTimeout);
      }
      
      if (immediate) {
        doRender();
      } else {
        renderTimeout = setTimeout(doRender, 16); // ~60fps
      }
    }
    
    function doRender() {
      try {
        // Move cursor to top
        process.stdout.write('\x1b[H');
      
      let currentLine = 0;
      
      // Show breadcrumbs
      if (breadcrumbs.length > 0) {
        const breadcrumbText = breadcrumbs.join(' > ');
        process.stdout.write('\x1b[K'); // Clear line
        console.log(colorize(`📍 ${breadcrumbText}`, 'gray'));
        process.stdout.write('\x1b[K'); // Clear line
        console.log('');
        currentLine += 2;
      }
      
      if (searchMode || query.length > 0) {
        process.stdout.write('\x1b[K'); // Clear line
        console.log(`Search: ${colorize(query, 'bright')}`);
      }
      process.stdout.write('\x1b[K'); // Clear line
      console.log(colorize(`Values: ${showValues ? 'ON' : 'OFF'} (Ctrl+V to toggle)`, 'gray'));
      process.stdout.write('\x1b[K'); // Clear line
      console.log('');
      currentLine += (searchMode || query.length > 0) ? 4 : 3;
      
      filteredKeys = fuzzySearch(query, keys);
      
      if (filteredKeys.length === 0) {
        process.stdout.write('\x1b[K'); // Clear line
        console.log(colorize('No matches found', 'yellow'));
        process.stdout.write('\x1b[K'); // Clear line
        console.log(colorize('\n/ or type to search, Ctrl+V to toggle values, Ctrl+C to exit', 'gray'));
        currentLine += 3;
        // Clear remaining lines
        process.stdout.write('\x1b[J');
        lastRenderedLines = currentLine;
        return;
      }
      
      // Keep selected index within bounds
      selectedIndex = Math.min(selectedIndex, filteredKeys.length - 1);
      selectedIndex = Math.max(selectedIndex, 0);
      
      // Calculate available height (terminal height - header lines - footer lines)
      const terminalHeight = process.stdout.rows || 24;
      const breadcrumbLines = breadcrumbs.length > 0 ? 2 : 0; // breadcrumb + empty line
      const searchLines = (searchMode || query.length > 0) ? 1 : 0; // Search line if in search mode
      const headerLines = 3 + searchLines + breadcrumbLines; // Values + empty line + optional search + breadcrumbs
      const footerLines = 4; // count line + instructions + potential "more items" + buffer
      const availableHeight = Math.max(3, terminalHeight - headerLines - footerLines);
      
      // Center the selection in the available view
      const halfHeight = Math.floor(availableHeight / 2);
      const startIndex = Math.max(0, selectedIndex - halfHeight);
      const endIndex = Math.min(filteredKeys.length, startIndex + availableHeight);
      
      for (let i = startIndex; i < endIndex; i++) {
        const key = filteredKeys[i];
        const isSelected = i === selectedIndex && !searchMode;
        const prefix = isSelected ? colorize('> ', 'green') : '  ';
        const keyColor = isSelected ? 'bright' : 'reset';
        
        process.stdout.write('\x1b[K'); // Clear line
        if (showValues) {
          const value = secretData[key];
          const displayValue = String(value);
          // Truncate long values
          const truncatedValue = displayValue.length > 60 
            ? displayValue.substring(0, 57) + '...' 
            : displayValue;
          console.log(`${prefix}${colorize(key, keyColor)}: ${colorize(truncatedValue, 'cyan')}`);
        } else {
          console.log(`${prefix}${colorize(key, keyColor)}`);
        }
        currentLine += 1;
      }
      
      if (filteredKeys.length > availableHeight) {
        const showing = endIndex - startIndex;
        const remaining = filteredKeys.length - showing;
        if (remaining > 0) {
          process.stdout.write('\x1b[K'); // Clear line
          console.log(colorize(`\n... ${remaining} more items`, 'gray'));
          currentLine += 2;
        }
      }
      
      process.stdout.write('\x1b[K'); // Clear line
      console.log(colorize(`\nShowing ${filteredKeys.length} of ${keys.length} keys`, 'gray'));
        const escapeText = breadcrumbs.length > 0 ? 'Esc to go back, ' : '';
        process.stdout.write('\x1b[K'); // Clear line
        console.log(colorize(`Use ↑↓/jk to navigate, / or type to search, Ctrl+V to toggle values, ${escapeText}Ctrl+C to exit`, 'gray'));
        currentLine += 3;
        
        // Clear any remaining lines from previous render
        process.stdout.write('\x1b[J');
        lastRenderedLines = currentLine;
      } catch (error) {
        console.error(colorize(`Key browser render error: ${error.message}`, 'red'));
      }
    }
    
    render(true); // Initial render should be immediate
    
    // Handle raw input
    process.stdin.setRawMode(true);
    process.stdin.resume();
    
    const handleKeyPress = (key) => {
      try {
        const keyStr = key.toString();
      
      if (keyStr === '\u0003') { // Ctrl+C
        process.stdin.setRawMode(false);
        process.stdin.removeListener('data', handleKeyPress);
        process.stdin.pause();
        resolve();
      } else if (keyStr === '\u001b') { // Escape
        if (searchMode) {
          // First escape: exit search mode (preserve search text)
          searchMode = false;
          render(true);
        } else if (query.length > 0) {
          // Second escape: clear search query
          query = '';
          selectedIndex = 0;
          render(true);
        } else if (breadcrumbs.length > 0) {
          // Third escape: go back (only if breadcrumbs available)
          process.stdin.setRawMode(false);
          process.stdin.removeListener('data', handleKeyPress);
          process.stdin.pause();
          // Small delay to prevent flicker when going back
          setTimeout(() => resolve('BACK'), 50);
        } else {
          // At top level with no search, ignore escape key - do nothing
        }
      } else if (keyStr === '\u0016') { // Ctrl+V
        showValues = !showValues;
        render(true); // Immediate for toggle
      } else if (keyStr === '\u001b[A' || keyStr === 'k') { // Up arrow or k
        selectedIndex = Math.max(0, selectedIndex - 1);
        render(true); // Immediate for navigation
      } else if (keyStr === '\u001b[B' || keyStr === 'j') { // Down arrow or j
        selectedIndex = Math.min(filteredKeys.length - 1, selectedIndex + 1);
        render(true); // Immediate for navigation
      } else if (keyStr === '\u007f' || keyStr === '\b') { // Backspace
        query = query.slice(0, -1);
        selectedIndex = 0;
        render(); // Debounced for typing
      } else if (keyStr === '/') { // Forward slash starts search mode
        if (!searchMode) {
          searchMode = true;
          render(true); // Immediate for mode change
        }
      } else if (keyStr.length === 1 && keyStr >= ' ') { // Regular character
        if (searchMode || query.length > 0) {
          query += keyStr;
          selectedIndex = 0;
          render(); // Debounced for typing
        } else if (keyStr === keyStr.toLowerCase() && keyStr >= 'a' && keyStr <= 'z') {
          // Allow letters to start search mode automatically (like k9s)
          searchMode = true;
          query += keyStr;
          selectedIndex = 0;
          render(); // Debounced for typing
        }
      }
      } catch (error) {
        console.error(colorize(`Key handler error: ${error.message}`, 'red'));
      }
    };
    
    process.stdin.on('data', handleKeyPress);
  });
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

async function main() {
  try {
    const options = parseArgs();
    
    if (options.command === 'copy') {
      await handleCopyCommand(options);
    } else if (options.command === 'list') {
      await handleListCommand(options);
    } else if (options.command === 'inspect') {
      showInspectHelp();
    } else if (options.command === 'interactive') {
      await handleInteractiveCommand(options);
    } else {
      throw new Error(`Unknown command: ${options.command}`);
    }
    
    // Ensure the process exits cleanly
    process.exit(0);
    
  } catch (error) {
    console.error(colorize(`Error: ${error.message}`, 'red'));
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}