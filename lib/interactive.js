const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { colorize } = require('./colors');
const { uploadToAwsSecretsManager } = require('./aws');
const { generateEnvContent } = require('./secrets');
const { config } = require('./config');

// Note: Legacy compatibility functions removed - use TerminalManager with specialized screens directly

// Editor functions - terminal mode switching removed since TerminalManager handles it
async function editWithJsonEditor(secretData, filteredKeys = null) {
  return new Promise((resolve, reject) => {
    const keysToEdit = filteredKeys || Object.keys(secretData);
    const dataToEdit = {};
    keysToEdit.forEach(key => {
      dataToEdit[key] = secretData[key];
    });

    const jsonContent = JSON.stringify(dataToEdit, null, 2) + '\n';
    const tempFile = path.join(os.tmpdir(), `lowkey-edit-${Date.now()}.json`);

    try {
      fs.writeFileSync(tempFile, jsonContent);
      const editor = config.getEditor();

      const editorProcess = spawn(editor, [tempFile], {
        stdio: 'inherit'
      });

      editorProcess.on('exit', (code) => {
        try {
          if (code === 0) {
            const editedContent = fs.readFileSync(tempFile, 'utf8');
            try {
              const editedData = JSON.parse(editedContent);

              if (typeof editedData !== 'object' || editedData === null || Array.isArray(editedData)) {
                throw new Error('JSON must be an object (not array, null, or primitive)');
              }

              for (const [key, value] of Object.entries(editedData)) {
                if (typeof value === 'object' && value !== null) {
                  throw new Error(`JSON must be a flat object. Key '${key}' contains nested object/array`);
                }
              }

              try { fs.unlinkSync(tempFile); } catch (cleanupError) { }
              resolve(editedData);
            } catch (parseError) {
              try { fs.unlinkSync(tempFile); } catch (cleanupError) { }
              reject(new Error(`Invalid JSON: ${parseError.message}`));
            }
          } else {
            try { fs.unlinkSync(tempFile); } catch (cleanupError) { }
            resolve(null);
          }
        } catch (error) {
          try { fs.unlinkSync(tempFile); } catch (cleanupError) { }
          reject(error);
        }
      });

      editorProcess.on('error', (error) => {
        try { fs.unlinkSync(tempFile); } catch (cleanupError) { }
        reject(new Error(`Failed to launch editor: ${error.message}`));
      });

    } catch (error) {
      reject(new Error(`Failed to create temp file: ${error.message}`));
    }
  });
}

async function editWithEditor(secretData, filteredKeys = null) {
  return new Promise((resolve, reject) => {
    const keysToEdit = filteredKeys || Object.keys(secretData);
    const dataToEdit = {};
    keysToEdit.forEach(key => {
      dataToEdit[key] = secretData[key];
    });

    const envContent = generateEnvContent(dataToEdit);
    const tempFile = path.join(os.tmpdir(), `lowkey-edit-${Date.now()}.env`);

    try {
      fs.writeFileSync(tempFile, envContent);
      const editor = config.getEditor();

      const editorProcess = spawn(editor, [tempFile], {
        stdio: 'inherit'
      });

      editorProcess.on('exit', (code) => {
        try {
          if (code === 0) {
            const editedContent = fs.readFileSync(tempFile, 'utf8');
            const editedData = {};
            const lines = editedContent.split('\n');

            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed && !trimmed.startsWith('#')) {
                const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
                if (match) {
                  let [, key, value] = match;

                  if ((value.startsWith('"') && value.endsWith('"')) ||
                      (value.startsWith("'") && value.endsWith("'"))) {
                    value = value.slice(1, -1);
                    value = value
                      .replace(/\\n/g, '\n')
                      .replace(/\\r/g, '\r')
                      .replace(/\\"/g, '"')
                      .replace(/\\\\/g, '\\');
                  }

                  editedData[key] = value;
                }
              }
            }

            try { fs.unlinkSync(tempFile); } catch (cleanupError) { }
            resolve(editedData);
          } else {
            try { fs.unlinkSync(tempFile); } catch (cleanupError) { }
            resolve(null);
          }
        } catch (error) {
          try { fs.unlinkSync(tempFile); } catch (cleanupError) { }
          reject(error);
        }
      });

      editorProcess.on('error', (error) => {
        try { fs.unlinkSync(tempFile); } catch (cleanupError) { }
        reject(new Error(`Failed to launch editor: ${error.message}`));
      });

    } catch (error) {
      reject(new Error(`Failed to create temp file: ${error.message}`));
    }
  });
}

async function editAwsSecret(secretData, filteredKeys = null, secretName = null, region = null) {
  return new Promise((resolve, reject) => {
    const keysToEdit = filteredKeys || Object.keys(secretData);
    const dataToEdit = {};
    keysToEdit.forEach(key => {
      dataToEdit[key] = secretData[key];
    });

    const jsonContent = JSON.stringify(dataToEdit, null, 2) + '\n';
    const tempFile = path.join(os.tmpdir(), `lowkey-aws-edit-${Date.now()}.json`);

    try {
      fs.writeFileSync(tempFile, jsonContent);
      const editor = config.getEditor();

      const editorProcess = spawn(editor, [tempFile], {
        stdio: 'inherit'
      });

      editorProcess.on('exit', async (code) => {
        try {
          if (code === 0) {
            const editedContent = fs.readFileSync(tempFile, 'utf8');
            try {
              const editedData = JSON.parse(editedContent);

              if (typeof editedData !== 'object' || editedData === null || Array.isArray(editedData)) {
                throw new Error('JSON must be an object (not array, null, or primitive)');
              }

              for (const [key, value] of Object.entries(editedData)) {
                if (typeof value === 'object' && value !== null) {
                  throw new Error(`JSON must be a flat object. Key '${key}' contains nested object/array`);
                }
              }

              if (secretName && region) {
                try {
                  const finalData = { ...secretData, ...editedData };
                  await uploadToAwsSecretsManager(finalData, secretName, region, 'AWSCURRENT', true);
                } catch (awsError) {
                  try { fs.unlinkSync(tempFile); } catch (cleanupError) { }
                  reject(new Error(`Failed to update AWS secret: ${awsError.message}`));
                  return;
                }
              }

              try { fs.unlinkSync(tempFile); } catch (cleanupError) { }
              resolve(editedData);
            } catch (parseError) {
              try { fs.unlinkSync(tempFile); } catch (cleanupError) { }
              reject(new Error(`Invalid JSON: ${parseError.message}`));
            }
          } else {
            try { fs.unlinkSync(tempFile); } catch (cleanupError) { }
            resolve(null);
          }
        } catch (error) {
          try { fs.unlinkSync(tempFile); } catch (cleanupError) { }
          reject(error);
        }
      });

      editorProcess.on('error', (error) => {
        try { fs.unlinkSync(tempFile); } catch (cleanupError) { }
        reject(new Error(`Failed to launch editor: ${error.message}`));
      });

    } catch (error) {
      reject(new Error(`Failed to create temp file: ${error.message}`));
    }
  });
}

async function editKubernetesSecret(secretData, filteredKeys = null, secretName = null, namespace = null) {
  return new Promise((resolve, reject) => {
    const keysToEdit = filteredKeys || Object.keys(secretData);
    const dataToEdit = {};
    keysToEdit.forEach(key => {
      dataToEdit[key] = secretData[key];
    });

    const jsonContent = JSON.stringify(dataToEdit, null, 2) + '\n';
    const tempFile = path.join(os.tmpdir(), `lowkey-k8s-edit-${Date.now()}.json`);

    try {
      fs.writeFileSync(tempFile, jsonContent);
      const editor = config.getEditor();

      const editorProcess = spawn(editor, [tempFile], {
        stdio: 'inherit'
      });

      editorProcess.on('exit', async (code) => {
        try {
          if (code === 0) {
            const editedContent = fs.readFileSync(tempFile, 'utf8');
            try {
              const editedData = JSON.parse(editedContent);

              if (typeof editedData !== 'object' || editedData === null || Array.isArray(editedData)) {
                throw new Error('JSON must be an object (not array, null, or primitive)');
              }

              for (const [key, value] of Object.entries(editedData)) {
                if (typeof value === 'object' && value !== null) {
                  throw new Error(`JSON must be a flat object. Key '${key}' contains nested object/array`);
                }
              }

              // Validate kubernetes secret key format
              for (const key of Object.keys(editedData)) {
                if (!/^[a-zA-Z0-9_.-]+$/.test(key)) {
                  throw new Error(`Invalid Kubernetes secret key '${key}'. Keys must contain only alphanumeric characters, underscores, dots, and hyphens.`);
                }
              }

              if (secretName && namespace) {
                try {
                  const { setSecret } = require('./kubernetes');
                  const finalData = { ...secretData, ...editedData };
                  await setSecret(secretName, finalData, namespace);
                } catch (k8sError) {
                  try { fs.unlinkSync(tempFile); } catch (cleanupError) { }
                  reject(new Error(`Failed to update Kubernetes secret: ${k8sError.message}`));
                  return;
                }
              }

              try { fs.unlinkSync(tempFile); } catch (cleanupError) { }
              resolve(editedData);
            } catch (parseError) {
              try { fs.unlinkSync(tempFile); } catch (cleanupError) { }
              reject(new Error(`Invalid JSON: ${parseError.message}`));
            }
          } else {
            try { fs.unlinkSync(tempFile); } catch (cleanupError) { }
            resolve(null); // User cancelled
          }
        } catch (error) {
          try { fs.unlinkSync(tempFile); } catch (cleanupError) { }
          reject(error);
        }
      });

      editorProcess.on('error', (error) => {
        try { fs.unlinkSync(tempFile); } catch (cleanupError) { }
        reject(new Error(`Failed to launch editor: ${error.message}`));
      });

    } catch (error) {
      reject(new Error(`Failed to create temp file: ${error.message}`));
    }
  });
}

module.exports = {
  editWithJsonEditor,
  editWithEditor,
  editAwsSecret,
  editKubernetesSecret
};