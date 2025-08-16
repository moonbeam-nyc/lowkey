const { fetchFromAwsSecretsManager, uploadToAwsSecretsManager } = require('./aws');
const { fetchFromJsonFile, fetchFromEnvFile, validateEnvKey, escapeEnvValue } = require('./files');
const { getSecret } = require('./kubernetes');

async function fetchSecret(options) {
  switch (options.inputType) {
    case 'aws-secrets-manager':
      return await fetchFromAwsSecretsManager(options.inputName, options.region, options.stage);
    case 'json':
      return await fetchFromJsonFile(options.inputName);
    case 'env':
      return fetchFromEnvFile(options.inputName);
    case 'kubernetes':
      const secretData = await getSecret(options.inputName, options.namespace);
      return JSON.stringify(secretData);
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

async function generateOutput(secretData, outputType, outputName, region, stage, autoYes, namespace) {
  switch (outputType) {
    case 'env':
      return generateEnvContent(secretData);
    case 'json':
      return generateJsonContent(secretData);
    case 'aws-secrets-manager':
      return await uploadToAwsSecretsManager(secretData, outputName, region, stage, autoYes);
    case 'kubernetes':
      const { setSecret } = require('./kubernetes');
      await setSecret(outputName, secretData, namespace);
      return `Successfully uploaded secret '${outputName}' to Kubernetes namespace '${namespace}'`;
    default:
      throw new Error(`Unsupported output type: ${outputType}`);
  }
}

module.exports = {
  fetchSecret,
  parseSecretData,
  generateEnvContent,
  generateJsonContent,
  generateOutput
};