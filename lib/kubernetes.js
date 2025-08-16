const { spawn } = require('child_process');
const { promisify } = require('util');
const { colorize } = require('./colors');
const { KUBERNETES } = require('./constants');

/**
 * Execute kubectl command and return result
 */
async function executeKubectl(args, options = {}) {
  return new Promise((resolve, reject) => {
    const kubectl = spawn('kubectl', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      ...options
    });

    let stdout = '';
    let stderr = '';

    kubectl.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    kubectl.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    kubectl.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        const error = new Error(`kubectl command failed: ${stderr.trim() || stdout.trim()}`);
        error.code = code;
        error.stderr = stderr.trim();
        error.stdout = stdout.trim();
        reject(error);
      }
    });

    kubectl.on('error', (error) => {
      if (error.code === 'ENOENT') {
        reject(new Error('kubectl not found. Please install kubectl and ensure it is in your PATH.'));
      } else {
        reject(error);
      }
    });
  });
}

/**
 * Check if kubectl is available and cluster is accessible
 */
async function checkKubectlAccess() {
  try {
    await executeKubectl(['version', '--client=true', '--output=json']);
    await executeKubectl(['cluster-info', '--request-timeout=5s']);
    return true;
  } catch (error) {
    throw new Error(`Kubernetes cluster not accessible: ${error.message}`);
  }
}

/**
 * Get current Kubernetes context
 */
async function getCurrentContext() {
  try {
    const context = await executeKubectl(['config', 'current-context']);
    return context;
  } catch (error) {
    throw new Error(`Failed to get current context: ${error.message}`);
  }
}

/**
 * List available namespaces
 */
async function listNamespaces() {
  try {
    const output = await executeKubectl(['get', 'namespaces', '-o', 'jsonpath={.items[*].metadata.name}']);
    return output.split(' ').filter(ns => ns.trim()).sort();
  } catch (error) {
    throw new Error(`Failed to list namespaces: ${error.message}`);
  }
}

/**
 * Check if namespace exists
 */
async function namespaceExists(namespace) {
  try {
    await executeKubectl(['get', 'namespace', namespace]);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * List secrets in a namespace
 */
async function listSecrets(namespace = KUBERNETES.DEFAULT_NAMESPACE) {
  try {
    const output = await executeKubectl([
      'get', 'secrets',
      '-n', namespace,
      '-o', 'jsonpath={.items[*].metadata.name}'
    ]);
    
    if (!output.trim()) {
      return [];
    }
    
    return output.split(' ').filter(name => name.trim()).sort();
  } catch (error) {
    if (error.stderr && error.stderr.includes('not found')) {
      throw new Error(`Namespace '${namespace}' not found`);
    }
    throw new Error(`Failed to list secrets: ${error.message}`);
  }
}

/**
 * Get secret data
 */
async function getSecret(secretName, namespace = KUBERNETES.DEFAULT_NAMESPACE) {
  try {
    const output = await executeKubectl([
      'get', 'secret', secretName,
      '-n', namespace,
      '-o', 'jsonpath={.data}'
    ]);

    if (!output.trim()) {
      return {};
    }

    const data = JSON.parse(output);
    const decoded = {};
    
    // Decode base64 values
    for (const [key, value] of Object.entries(data)) {
      decoded[key] = Buffer.from(value, 'base64').toString('utf8');
    }
    
    return decoded;
  } catch (error) {
    if (error.stderr && error.stderr.includes('not found')) {
      throw new Error(`Secret '${secretName}' not found in namespace '${namespace}'`);
    }
    throw new Error(`Failed to get secret: ${error.message}`);
  }
}

/**
 * Create or update secret
 */
async function setSecret(secretName, secretData, namespace = KUBERNETES.DEFAULT_NAMESPACE) {
  try {
    // Check if namespace exists
    if (!(await namespaceExists(namespace))) {
      throw new Error(`Namespace '${namespace}' does not exist`);
    }

    // Build kubectl create secret command
    const args = [
      'create', 'secret', 'generic', secretName,
      '-n', namespace,
      '--dry-run=client',
      '-o', 'yaml'
    ];

    // Add data as literal key-value pairs
    for (const [key, value] of Object.entries(secretData)) {
      args.push('--from-literal', `${key}=${value}`);
    }

    // Create the secret YAML
    const secretYaml = await executeKubectl(args);
    
    // Apply the secret
    const kubectl = spawn('kubectl', ['apply', '-f', '-'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';

      kubectl.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      kubectl.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      kubectl.on('close', (code) => {
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(new Error(`Failed to apply secret: ${stderr.trim() || stdout.trim()}`));
        }
      });

      kubectl.on('error', reject);

      // Send the YAML to kubectl apply
      kubectl.stdin.write(secretYaml);
      kubectl.stdin.end();
    });
  } catch (error) {
    throw new Error(`Failed to set secret: ${error.message}`);
  }
}

/**
 * Delete secret
 */
async function deleteSecret(secretName, namespace = KUBERNETES.DEFAULT_NAMESPACE) {
  try {
    const output = await executeKubectl([
      'delete', 'secret', secretName,
      '-n', namespace
    ]);
    return output;
  } catch (error) {
    if (error.stderr && error.stderr.includes('not found')) {
      throw new Error(`Secret '${secretName}' not found in namespace '${namespace}'`);
    }
    throw new Error(`Failed to delete secret: ${error.message}`);
  }
}

/**
 * Validate secret data for Kubernetes
 */
function validateSecretData(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('Secret data must be an object');
  }

  for (const [key, value] of Object.entries(data)) {
    // Kubernetes secret keys must be valid
    if (!/^[a-zA-Z0-9_.-]+$/.test(key)) {
      throw new Error(`Invalid secret key '${key}'. Keys must contain only alphanumeric characters, underscores, dots, and hyphens.`);
    }

    // Values must be strings (they get base64 encoded by kubectl)
    if (typeof value !== 'string') {
      throw new Error(`Secret value for key '${key}' must be a string`);
    }
  }

  return true;
}

/**
 * Get formatted error message for common Kubernetes errors
 */
function getFormattedError(error) {
  if (error.message.includes('kubectl not found')) {
    return colorize('Error: kubectl not found. Please install kubectl and ensure it is in your PATH.', 'red') + '\n' +
           colorize('Installation guide: https://kubernetes.io/docs/tasks/tools/', 'cyan');
  }

  if (error.message.includes('cluster not accessible')) {
    return colorize('Error: Cannot connect to Kubernetes cluster.', 'red') + '\n' +
           colorize('Make sure your cluster is running and kubectl is configured correctly.', 'yellow') + '\n' +
           colorize('Try: kubectl cluster-info', 'cyan');
  }

  if (error.message.includes('not found')) {
    return colorize(`Error: ${error.message}`, 'red');
  }

  return colorize(`Kubernetes Error: ${error.message}`, 'red');
}

module.exports = {
  checkKubectlAccess,
  getCurrentContext,
  listNamespaces,
  namespaceExists,
  listSecrets,
  getSecret,
  setSecret,
  deleteSecret,
  validateSecretData,
  getFormattedError
};