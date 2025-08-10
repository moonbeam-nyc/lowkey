const fs = require('fs');
const path = require('path');
const { colorize } = require('./colors');

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

module.exports = {
  fetchFromJsonFile,
  fetchFromEnvFile,
  listEnvFiles,
  listJsonFiles,
  validateEnvKey,
  escapeEnvValue,
  backupFile
};