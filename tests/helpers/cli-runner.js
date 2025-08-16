const { spawn } = require('child_process');
const path = require('path');

/**
 * Helper to run lowkey CLI commands and capture output
 */
function runLowkeyCommand(args, options = {}) {
  return new Promise((resolve, reject) => {
    const cliPath = path.join(__dirname, '../../cli.js');
    const child = spawn(process.execPath, [cliPath, ...args], {
      stdio: 'pipe',
      env: { ...process.env, ...(options.env || {}) },
      ...options
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      resolve({
        code,
        stdout: stdout.trim(),
        stderr: stderr.trim()
      });
    });

    child.on('error', reject);
  });
}

/**
 * Helper to run lowkey commands with timeout
 */
function runLowkeyWithTimeout(args, timeoutMs = 5000, options = {}) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Command timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    runLowkeyCommand(args, options)
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

module.exports = {
  runLowkeyCommand,
  runLowkeyWithTimeout
};