/**
 * Centralized Delete Operations
 * 
 * Handles deletion of secrets across all supported storage types:
 * - env files
 * - json files  
 * - AWS Secrets Manager
 * - Kubernetes secrets
 */

const fs = require('fs');
const path = require('path');
const debugLogger = require('../core/debug-logger');

/**
 * Delete a secret based on its type
 * @param {Object} options - Delete options
 * @param {string} options.type - Secret type (env, json, aws-secrets-manager, kubernetes)
 * @param {string} options.name - Secret name
 * @param {string} [options.region] - AWS region (for AWS secrets)
 * @param {string} [options.path] - File path (for file-based secrets)
 * @param {string} [options.namespace] - Kubernetes namespace
 * @param {string} [options.context] - Kubernetes context
 */
async function deleteSecret(options) {
  const { type, name, region, path: filePath, namespace, context } = options;
  
  debugLogger.log('DeleteOperations deleteSecret', {
    type, 
    name, 
    region: region || 'not provided',
    filePath: filePath || 'not provided',
    namespace: namespace || 'not provided',
    context: context || 'not provided'
  });

  try {
    switch (type) {
      case 'env':
        return await deleteEnvFile(name, filePath);
        
      case 'json':
        return await deleteJsonFile(name, filePath);
        
      case 'aws-secrets-manager':
        return await deleteAwsSecret(name, region);
        
      case 'kubernetes':
        return await deleteKubernetesSecret(name, namespace, context);
        
      default:
        throw new Error(`Unsupported secret type: ${type}`);
    }
  } catch (error) {
    debugLogger.log('DeleteOperations deleteSecret error', {
      type,
      name,
      error: error.message
    });
    throw error;
  }
}

/**
 * Delete an environment file
 */
async function deleteEnvFile(fileName, basePath = '.') {
  const fullPath = path.resolve(basePath, fileName);
  
  debugLogger.log('DeleteOperations deleteEnvFile', { fileName, fullPath });
  
  // Check if file exists
  if (!fs.existsSync(fullPath)) {
    throw new Error(`File not found: ${fileName}`);
  }
  
  // Verify it's an env file (basic check)
  if (!fileName.match(/\.env($|\..+)/)) {
    throw new Error(`Not an environment file: ${fileName}`);
  }
  
  // Delete the file
  fs.unlinkSync(fullPath);
  debugLogger.log('DeleteOperations deleteEnvFile success', { fileName });
}

/**
 * Delete a JSON file
 */
async function deleteJsonFile(fileName, basePath = '.') {
  const fullPath = path.resolve(basePath, fileName);
  
  debugLogger.log('DeleteOperations deleteJsonFile', { fileName, fullPath });
  
  // Check if file exists
  if (!fs.existsSync(fullPath)) {
    throw new Error(`File not found: ${fileName}`);
  }
  
  // Verify it's a JSON file
  if (!fileName.endsWith('.json')) {
    throw new Error(`Not a JSON file: ${fileName}`);
  }
  
  // Delete the file
  fs.unlinkSync(fullPath);
  debugLogger.log('DeleteOperations deleteJsonFile success', { fileName });
}

/**
 * Delete an AWS secret
 */
async function deleteAwsSecret(secretName, region) {
  try {
    const { deleteAwsSecret: awsDelete } = require('./aws');
    
    debugLogger.log('DeleteOperations deleteAwsSecret', { secretName, region });
    
    await awsDelete(secretName, region);
    
    debugLogger.log('DeleteOperations deleteAwsSecret success', { secretName });
  } catch (error) {
    debugLogger.log('DeleteOperations deleteAwsSecret error', {
      secretName,
      region,
      error: error.message
    });
    throw new Error(`Failed to delete AWS secret: ${error.message}`);
  }
}

/**
 * Delete a Kubernetes secret
 */
async function deleteKubernetesSecret(secretName, namespace, context) {
  try {
    const kubernetes = require('./kubernetes');
    
    debugLogger.log('DeleteOperations deleteKubernetesSecret', { 
      secretName, 
      namespace, 
      context 
    });
    
    await kubernetes.deleteSecret(secretName, namespace, context);
    
    debugLogger.log('DeleteOperations deleteKubernetesSecret success', { secretName });
  } catch (error) {
    debugLogger.log('DeleteOperations deleteKubernetesSecret error', {
      secretName,
      namespace,
      context,
      error: error.message
    });
    throw new Error(`Failed to delete Kubernetes secret: ${error.message}`);
  }
}

module.exports = {
  deleteSecret,
  deleteEnvFile,
  deleteJsonFile,
  deleteAwsSecret,
  deleteKubernetesSecret
};