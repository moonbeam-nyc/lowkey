const { SecretsManagerClient, GetSecretValueCommand, PutSecretValueCommand, CreateSecretCommand, ListSecretsCommand, DeleteSecretCommand } = require('@aws-sdk/client-secrets-manager');
const { NodeHttpHandler } = require('@smithy/node-http-handler');
const { Agent: HttpsAgent } = require('https');
const { Agent: HttpAgent } = require('http');
const { colorize } = require('../core/colors');

/**
 * Create AWS Secrets Manager client with LocalStack support
 * @param {string} region - AWS region
 * @returns {SecretsManagerClient} Configured client
 */
function createSecretsManagerClient(region) {
  const clientConfig = region ? { region } : {};
  
  // Check if LocalStack endpoint is configured
  const localstackEndpoint = process.env.LOCALSTACK_ENDPOINT;
  if (localstackEndpoint) {
    clientConfig.endpoint = localstackEndpoint;
    clientConfig.credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test'
    };
    clientConfig.forcePathStyle = true;
  }
  
  // Configure HTTP client to not use keep-alive connections to prevent hanging
  const isLocalStack = !!localstackEndpoint;
  clientConfig.requestHandler = new NodeHttpHandler({
    httpAgent: new HttpAgent({ 
      keepAlive: false 
    }),
    httpsAgent: new HttpsAgent({ 
      keepAlive: false 
    }),
    requestTimeout: 5000,
    connectionTimeout: 2000
  });
  
  return new SecretsManagerClient(clientConfig);
}

async function fetchFromAwsSecretsManager(sourceName, region, stage) {
  const client = createSecretsManagerClient(region);
  
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
  } finally {
    client.destroy();
  }
}

async function createSecret(client, outputName, secretData) {
  const command = new CreateSecretCommand({
    Name: outputName,
    SecretString: JSON.stringify(secretData)
  });
  
  await client.send(command);
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

async function uploadToAwsSecretsManager(secretData, outputName, region, stage, autoYes) {
  const client = createSecretsManagerClient(region);
  
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
  } finally {
    client.destroy();
  }
}

async function listAwsSecrets(region) {
  const client = createSecretsManagerClient(region);
  
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
  } finally {
    client.destroy();
  }
}

async function deleteAwsSecret(secretName, region) {
  const client = createSecretsManagerClient(region);
  
  try {
    const command = new DeleteSecretCommand({
      SecretId: secretName,
      ForceDeleteWithoutRecovery: false // Allow recovery for 7-30 days
    });
    
    const response = await client.send(command);
    return response;
  } catch (error) {
    if (error.name === 'ResourceNotFoundException') {
      throw new Error(`Secret not found: ${secretName}`);
    } else if (error.name === 'AccessDeniedException') {
      throw new Error(`Access denied: Cannot delete secret '${secretName}'. Check your permissions.`);
    } else if (error.name === 'InvalidRequestException') {
      throw new Error(`Invalid request: ${error.message}`);
    } else if (error.name === 'InternalServiceErrorException') {
      throw new Error(`AWS internal service error: ${error.message}`);
    } else {
      throw new Error(`AWS error: ${error.message}`);
    }
  } finally {
    client.destroy();
  }
}

module.exports = {
  fetchFromAwsSecretsManager,
  uploadToAwsSecretsManager,
  listAwsSecrets,
  deleteAwsSecret
};