#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { SecretsManagerClient, GetSecretValueCommand, PutSecretValueCommand, CreateSecretCommand, ListSecretsCommand } = require('@aws-sdk/client-secrets-manager');

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
  
  if (!['copy', 'list'].includes(command)) {
    console.error(colorize(`Error: Unknown command '${command}'. Available commands: copy, list`, 'red'));
    showHelp();
    process.exit(1);
  }
  
  if (command === 'copy') {
    return parseCopyArgs(args.slice(1));
  } else if (command === 'list') {
    return parseListArgs(args.slice(1));
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

Global Options:
  --version, -v            Show version number
  --help, -h               Show this help message

Use 'lowkey <command> --help' for more information about a command.

Examples:
  lowkey copy --input-type env --input-name .env --output-type json
  lowkey list --type aws-secrets-manager --region us-east-1
  lowkey list --type env --path ./config
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