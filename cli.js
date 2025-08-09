#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    sourceType: 'aws-secrets-manager',
    sourceName: null,
    region: null,
    outputType: 'env',
    outputName: null,
    stage: 'AWSCURRENT'
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--source-type' && i + 1 < args.length) {
      options.sourceType = args[++i];
    } else if (arg === '--source-name' && i + 1 < args.length) {
      options.sourceName = args[++i];
    } else if (arg === '--region' && i + 1 < args.length) {
      options.region = args[++i];
    } else if (arg === '--output-type' && i + 1 < args.length) {
      options.outputType = args[++i];
    } else if (arg === '--output-name' && i + 1 < args.length) {
      options.outputName = args[++i];
    } else if (arg === '--stage' && i + 1 < args.length) {
      options.stage = args[++i];
    } else if (arg === '--version' || arg === '-v') {
      showVersion();
      process.exit(0);
    } else if (arg === '--help' || arg === '-h') {
      showHelp();
      process.exit(0);
    }
  }

  if (!options.sourceName) {
    console.error('Error: --source-name is required');
    showHelp();
    process.exit(1);
  }

  if (options.sourceType === 'aws-secrets-manager' && !options.region && !process.env.AWS_REGION && !process.env.AWS_DEFAULT_REGION) {
    console.error('Error: --region is required for AWS Secrets Manager (or set AWS_REGION/AWS_DEFAULT_REGION environment variable)');
    showHelp();
    process.exit(1);
  }

  if (!['aws-secrets-manager'].includes(options.sourceType)) {
    console.error(`Error: Unsupported source type '${options.sourceType}'. Supported: aws-secrets-manager`);
    process.exit(1);
  }

  if (!['env', 'json'].includes(options.outputType)) {
    console.error(`Error: Unsupported output type '${options.outputType}'. Supported: env, json`);
    process.exit(1);
  }


  return options;
}

function showVersion() {
  const packageJson = require('./package.json');
  console.log(`lowkey v${packageJson.version}`);
}

function showHelp() {
  console.log(`
Usage: lowkey --source-name <name|arn> [options]

Options:
  --source-type <type>     Secret store type (default: aws-secrets-manager)
  --source-name <name>     Secret name or ARN (required)
  --region <region>        AWS region (or use AWS_REGION environment variable)
  --output-type <type>     Output format: env, json (default: env)
  --output-name <file>     Output file path (default: stdout)
  --stage <stage>          Secret version stage (default: AWSCURRENT)
  --version, -v            Show version number
  --help, -h               Show this help message

Supported source types:
  aws-secrets-manager      AWS Secrets Manager

Supported output types:
  env                      Environment file (.env format)
  json                     JSON file

Examples:
  lowkey --source-name my-app-secrets --region us-east-1
  lowkey --source-name my-secrets --output-name .env.local  # uses AWS_REGION env var
  lowkey --source-name my-secrets --region us-west-2 --output-type json
  lowkey --source-name my-secrets --region us-east-1 --output-type json --output-name secrets.json
  lowkey --source-name my-secrets --region us-east-1 --output-name .env
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
    console.error(`Backed up existing file to ${backupPath}`);
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

async function fetchSecret(options) {
  switch (options.sourceType) {
    case 'aws-secrets-manager':
      return await fetchFromAwsSecretsManager(options.sourceName, options.region, options.stage);
    default:
      throw new Error(`Unsupported source type: ${options.sourceType}`);
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

function generateOutput(secretData, outputType) {
  switch (outputType) {
    case 'env':
      return generateEnvContent(secretData);
    case 'json':
      return generateJsonContent(secretData);
    default:
      throw new Error(`Unsupported output type: ${outputType}`);
  }
}

async function main() {
  try {
    const options = parseArgs();
    
    // Send progress messages to stderr so they don't interfere with stdout output
    console.error(`Fetching secret '${options.sourceName}' from ${options.sourceType}...`);
    const secretString = await fetchSecret(options);
    
    console.error('Parsing secret data...');
    const secretData = parseSecretData(secretString);
    
    // Validate keys for env output type
    if (options.outputType === 'env') {
      for (const key of Object.keys(secretData)) {
        if (!validateEnvKey(key)) {
          throw new Error(`Invalid environment variable key: '${key}'. Keys must match pattern [A-Za-z_][A-Za-z0-9_]*`);
        }
      }
    }
    
    const outputContent = generateOutput(secretData, options.outputType);
    
    // Handle output - either to file or stdout
    if (options.outputName) {
      // Output to file
      backupFile(options.outputName);
      fs.writeFileSync(options.outputName, outputContent);
      
      const keyCount = Object.keys(secretData).length;
      const itemType = options.outputType === 'env' ? 'environment variables' : 'keys';
      console.error(`Successfully written to ${options.outputName} (${keyCount} ${itemType})`);
    } else {
      // Output to stdout
      process.stdout.write(outputContent);
    }
    
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}