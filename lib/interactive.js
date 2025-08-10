const readline = require('readline');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { colorize } = require('./colors');
const { listAwsSecrets, uploadToAwsSecretsManager } = require('./aws');
const { listEnvFiles, listJsonFiles, validateEnvKey, escapeEnvValue } = require('./files');
const { fetchSecret, parseSecretData, generateEnvContent } = require('./secrets');

// Highlight matching text in a string
function highlightMatch(text, query) {
  if (!query) return text;
  
  try {
    // Treat query as regex pattern (case-insensitive by default)
    const regex = new RegExp(`(${query})`, 'gi');
    return text.replace(regex, colorize('$1', 'yellow'));
  } catch (error) {
    // If regex is invalid, fall back to simple text search
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const index = lowerText.indexOf(lowerQuery);
    
    if (index !== -1) {
      const before = text.substring(0, index);
      const match = text.substring(index, index + query.length);
      const after = text.substring(index + query.length);
      return before + colorize(match, 'yellow') + after;
    }
    
    return text;
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

// Function to open editor with JSON file content
async function editWithJsonEditor(secretData, filteredKeys = null) {
  return new Promise((resolve, reject) => {
    // Use filtered keys if provided, otherwise all keys
    const keysToEdit = filteredKeys || Object.keys(secretData);

    // Generate JSON content for the keys to edit
    const dataToEdit = {};
    keysToEdit.forEach(key => {
      dataToEdit[key] = secretData[key];
    });

    const jsonContent = JSON.stringify(dataToEdit, null, 2) + '\n';

    // Create temporary file
    const tempFile = path.join(os.tmpdir(), `lowkey-edit-${Date.now()}.json`);

    try {
      fs.writeFileSync(tempFile, jsonContent);

      // Determine editor to use
      const editor = process.env.EDITOR || 'vim';

      // Restore normal terminal mode before launching editor
      process.stdin.setRawMode(false);
      process.stdin.pause();

      // Launch editor
      const editorProcess = spawn(editor, [tempFile], {
        stdio: 'inherit'
      });

      editorProcess.on('exit', (code) => {
        try {
          if (code === 0) {
            // Editor exited successfully, read the file
            const editedContent = fs.readFileSync(tempFile, 'utf8');

            // Parse the edited JSON content
            try {
              const editedData = JSON.parse(editedContent);

              // Validate that it's a flat object
              if (typeof editedData !== 'object' || editedData === null || Array.isArray(editedData)) {
                throw new Error('JSON must be an object (not array, null, or primitive)');
              }

              // Check that all values are primitives (flat object)
              for (const [key, value] of Object.entries(editedData)) {
                if (typeof value === 'object' && value !== null) {
                  throw new Error(`JSON must be a flat object. Key '${key}' contains nested object/array`);
                }
              }

              // Clean up temp file
              try {
                fs.unlinkSync(tempFile);
              } catch (cleanupError) {
                // Ignore cleanup errors
              }

              resolve(editedData);
            } catch (parseError) {
              try {
                fs.unlinkSync(tempFile);
              } catch (cleanupError) {
                // Ignore cleanup errors
              }
              reject(new Error(`Invalid JSON: ${parseError.message}`));
            }
          } else {
            // Editor was cancelled or exited with error
            try {
              fs.unlinkSync(tempFile);
            } catch (cleanupError) {
              // Ignore cleanup errors
            }
            resolve(null); // null indicates cancellation
          }
        } catch (error) {
          try {
            fs.unlinkSync(tempFile);
          } catch (cleanupError) {
            // Ignore cleanup errors
          }
          reject(error);
        }
      });

      editorProcess.on('error', (error) => {
        try {
          fs.unlinkSync(tempFile);
        } catch (cleanupError) {
          // Ignore cleanup errors
        }
        reject(new Error(`Failed to launch editor: ${error.message}`));
      });

    } catch (error) {
      reject(new Error(`Failed to create temp file: ${error.message}`));
    }
  });
}

// Function to open editor with AWS secret content in JSON format
async function editAwsSecret(secretData, filteredKeys = null, secretName = null, region = null) {
  return new Promise((resolve, reject) => {
    // Use filtered keys if provided, otherwise all keys
    const keysToEdit = filteredKeys || Object.keys(secretData);

    // Generate JSON content for the keys to edit
    const dataToEdit = {};
    keysToEdit.forEach(key => {
      dataToEdit[key] = secretData[key];
    });

    const jsonContent = JSON.stringify(dataToEdit, null, 2) + '\n';

    // Create temporary file
    const tempFile = path.join(os.tmpdir(), `lowkey-aws-edit-${Date.now()}.json`);

    try {
      fs.writeFileSync(tempFile, jsonContent);

      // Determine editor to use
      const editor = process.env.EDITOR || 'vim';

      // Restore normal terminal mode before launching editor
      process.stdin.setRawMode(false);
      process.stdin.pause();

      // Launch editor
      const editorProcess = spawn(editor, [tempFile], {
        stdio: 'inherit'
      });

      editorProcess.on('exit', async (code) => {
        try {
          if (code === 0) {
            // Editor exited successfully, read the file
            const editedContent = fs.readFileSync(tempFile, 'utf8');

            // Parse the edited JSON content
            try {
              const editedData = JSON.parse(editedContent);

              // Validate that it's a flat object
              if (typeof editedData !== 'object' || editedData === null || Array.isArray(editedData)) {
                throw new Error('JSON must be an object (not array, null, or primitive)');
              }

              // Check that all values are primitives (flat object)
              for (const [key, value] of Object.entries(editedData)) {
                if (typeof value === 'object' && value !== null) {
                  throw new Error(`JSON must be a flat object. Key '${key}' contains nested object/array`);
                }
              }

              // Upload to AWS Secrets Manager
              if (secretName && region) {
                try {
                  // Merge edited data with original secret data (in case only filtered keys were edited)
                  const finalData = { ...secretData, ...editedData };
                  const result = await uploadToAwsSecretsManager(finalData, secretName, region, 'AWSCURRENT', true);
                } catch (awsError) {
                  // Clean up temp file
                  try {
                    fs.unlinkSync(tempFile);
                  } catch (cleanupError) {
                    // Ignore cleanup errors
                  }
                  reject(new Error(`Failed to update AWS secret: ${awsError.message}`));
                  return;
                }
              }

              // Clean up temp file
              try {
                fs.unlinkSync(tempFile);
              } catch (cleanupError) {
                // Ignore cleanup errors
              }

              resolve(editedData);
            } catch (parseError) {
              try {
                fs.unlinkSync(tempFile);
              } catch (cleanupError) {
                // Ignore cleanup errors
              }
              reject(new Error(`Invalid JSON: ${parseError.message}`));
            }
          } else {
            // Editor was cancelled or exited with error
            try {
              fs.unlinkSync(tempFile);
            } catch (cleanupError) {
              // Ignore cleanup errors
            }
            resolve(null); // null indicates cancellation
          }
        } catch (error) {
          try {
            fs.unlinkSync(tempFile);
          } catch (cleanupError) {
            // Ignore cleanup errors
          }
          reject(error);
        }
      });

      editorProcess.on('error', (error) => {
        try {
          fs.unlinkSync(tempFile);
        } catch (cleanupError) {
          // Ignore cleanup errors
        }
        reject(new Error(`Failed to launch editor: ${error.message}`));
      });

    } catch (error) {
      reject(new Error(`Failed to create temp file: ${error.message}`));
    }
  });
}

// Function to open editor with env file content
async function editWithEditor(secretData, filteredKeys = null) {
  return new Promise((resolve, reject) => {
    // Use filtered keys if provided, otherwise all keys
    const keysToEdit = filteredKeys || Object.keys(secretData);

    // Generate env content for the keys to edit
    const dataToEdit = {};
    keysToEdit.forEach(key => {
      dataToEdit[key] = secretData[key];
    });

    const envContent = generateEnvContent(dataToEdit);

    // Create temporary file
    const tempFile = path.join(os.tmpdir(), `lowkey-edit-${Date.now()}.env`);

    try {
      fs.writeFileSync(tempFile, envContent);

      // Determine editor to use
      const editor = process.env.EDITOR || 'vim';

      // Restore normal terminal mode before launching editor
      process.stdin.setRawMode(false);
      process.stdin.pause();

      // Launch editor
      const editorProcess = spawn(editor, [tempFile], {
        stdio: 'inherit'
      });

      editorProcess.on('exit', (code) => {
        try {
          if (code === 0) {
            // Editor exited successfully, read the file
            const editedContent = fs.readFileSync(tempFile, 'utf8');

            // Parse the edited env content
            const editedData = {};
            const lines = editedContent.split('\n');

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

                  editedData[key] = value;
                }
              }
            }

            // Clean up temp file
            try {
              fs.unlinkSync(tempFile);
            } catch (cleanupError) {
              // Ignore cleanup errors
            }

            resolve(editedData);
          } else {
            // Editor was cancelled or exited with error
            try {
              fs.unlinkSync(tempFile);
            } catch (cleanupError) {
              // Ignore cleanup errors
            }
            resolve(null); // null indicates cancellation
          }
        } catch (error) {
          try {
            fs.unlinkSync(tempFile);
          } catch (cleanupError) {
            // Ignore cleanup errors
          }
          reject(error);
        }
      });

      editorProcess.on('error', (error) => {
        try {
          fs.unlinkSync(tempFile);
        } catch (cleanupError) {
          // Ignore cleanup errors
        }
        reject(new Error(`Failed to launch editor: ${error.message}`));
      });

    } catch (error) {
      reject(new Error(`Failed to create temp file: ${error.message}`));
    }
  });
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
        // Clear screen and move cursor to top (alternate screen buffer)
        process.stdout.write('\x1b[2J\x1b[H');
        
        let output = [];
        
        // Always show breadcrumb header
        if (safeBreadcrumbs.length > 0) {
          const breadcrumbText = safeBreadcrumbs.join(' > ');
          output.push(colorize(`📍 ${breadcrumbText}`, 'gray'));
        } else {
          output.push(colorize(`📍 `, 'gray'));
        }
        output.push('');
        
        // Question
        output.push(colorize(question, 'cyan'));
        
        // Search field (only if in search mode or has query)
        if (searchMode || query.length > 0) {
          output.push(`Search: ${colorize(query, 'bright')}`);
        }
        
        output.push('');
        
        filteredChoices = fuzzySearch(query, choices);
        
        if (filteredChoices.length === 0) {
          if (choices.length === 0 && errorMessage) {
            output.push(colorize('(No items available)', 'yellow'));
          } else {
            output.push(colorize('No matches found', 'yellow'));
          }
        } else {
          // Keep selected index within bounds
          selectedIndex = Math.min(selectedIndex, filteredChoices.length - 1);
          selectedIndex = Math.max(selectedIndex, 0);
          
          // Calculate available height for choices
          const terminalHeight = process.stdout.rows || 24;
          const usedLines = output.length + 6; // current output + error + instructions + buffer
          const availableHeight = Math.max(3, terminalHeight - usedLines);
          
          // Center the selection in the available view
          const halfHeight = Math.floor(availableHeight / 2);
          const startIndex = Math.max(0, selectedIndex - halfHeight);
          const endIndex = Math.min(filteredChoices.length, startIndex + availableHeight);
          
          for (let i = startIndex; i < endIndex; i++) {
            const choice = filteredChoices[i];
            let display = displayFn ? displayFn(choice) : (typeof choice === 'string' ? choice : choice.Name || choice);
            
            // Apply highlighting if there's a query
            if (query) {
              // For displayFn results that might include extra text, only highlight the name part
              if (displayFn && choice.name) {
                const highlightedName = highlightMatch(choice.name, query);
                display = display.replace(choice.name, highlightedName);
              } else {
                // For simple strings or Name properties
                const name = typeof choice === 'string' ? choice : (choice.Name || choice.name || choice);
                display = highlightMatch(name, query);
              }
            }
            
            const isSelected = i === selectedIndex && !searchMode;
            const prefix = isSelected ? colorize('> ', 'green') : '  ';
            const color = isSelected ? 'bright' : 'reset';
            
            // Only apply base color if there's no highlighting (to preserve yellow highlights)
            const finalDisplay = query ? display : colorize(display, color);
            output.push(`${prefix}${finalDisplay}`);
          }
          
          if (filteredChoices.length > availableHeight) {
            const showing = endIndex - startIndex;
            const remaining = filteredChoices.length - showing;
            if (remaining > 0) {
              output.push(colorize(`... ${remaining} more items`, 'gray'));
            }
          }
        }
        
        // Show error message if provided
        if (errorMessage) {
          output.push('');
          output.push(colorize(`⚠️  ${errorMessage}`, 'red'));
        }
        
        // Instructions
        output.push('');
        const escapeText = safeBreadcrumbs.length > 0 ? 'Esc to go back, ' : '';
        const instructions = safeBreadcrumbs.length > 0 
          ? `Use ↑↓/jk to navigate, / or type to search, Enter to select, ${escapeText}Ctrl+C to cancel`
          : `Use ↑↓/jk to navigate, / or type to search, Enter to select, Ctrl+C to exit`;
        output.push(colorize(instructions, 'gray'));
        
        // Write everything at once
        process.stdout.write(output.join('\n') + '\n');
        
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
        process.stdout.write('\x1b[?1049l');
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
        if (searchMode) {
          // Exit search mode (preserve search text)
          searchMode = false;
          render(true);
        } else {
          if (filteredChoices.length === 0) {
            // Can't select from empty list, ignore enter
            return;
          }
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.removeAllListeners('data');
          rl.close();
          resolve(filteredChoices[selectedIndex]);
        }
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

async function runInteractiveInspect(options) {
  try {
    let currentStep = options.startStep || 'type';
    let selectedType = options.type ? { name: options.type } : null;
    let selectedSecret = null;
    let typeErrorMessage = null;
    
    while (true) {
    if (currentStep === 'type') {
      const types = [
        { name: 'aws-secrets-manager', description: 'AWS Secrets Manager' },
        { name: 'env', description: 'Environment files (.env*)' },
        { name: 'json', description: 'JSON files' }
      ];
      
      const result = await fuzzyPrompt(
        'Select secret type:',
        types,
        (type) => `${type.name} - ${type.description}`,
        [], // Empty breadcrumbs at top-level = no escape allowed
        typeErrorMessage
      );
      
      if (result === null) {
        // This shouldn't happen at the root level since escape is disabled
        process.exit(0);
      }
      
      selectedType = result;
      
      // Check if the selected type has available secrets before proceeding
      
      try {
        let choices = [];
        
        if (selectedType.name === 'aws-secrets-manager') {
          const secrets = await listAwsSecrets(options.region);
          choices = secrets.map(secret => ({
            name: secret.Name,
            lastChanged: secret.LastChangedDate ? new Date(secret.LastChangedDate).toISOString().split('T')[0] : 'Unknown'
          })).sort((a, b) => a.name.localeCompare(b.name));
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
      // Get available secrets/files for the selected type (or use pre-fetched if available)
      let choices = selectedSecret && selectedSecret.choices ? selectedSecret.choices : [];
      
      if (choices.length === 0) {
        // Need to fetch choices
        try {
          
          if (selectedType.name === 'aws-secrets-manager') {
            const secrets = await listAwsSecrets(options.region);
            choices = secrets.map(secret => ({
              name: secret.Name,
              lastChanged: secret.LastChangedDate ? new Date(secret.LastChangedDate).toISOString().split('T')[0] : 'Unknown'
            })).sort((a, b) => a.name.localeCompare(b.name));
          } else if (selectedType.name === 'env') {
            const files = listEnvFiles(options.path || '.');
            choices = files.map(file => ({ name: file }));
          } else if (selectedType.name === 'json') {
            const files = listJsonFiles(options.path || '.');
            choices = files.map(file => ({ name: file }));
          }
          
          if (choices.length === 0) {
            // Go back to type selection with error
            typeErrorMessage = `No ${selectedType.name} secrets found`;
            currentStep = 'type';
            continue;
          }
        } catch (error) {
          // Go back to type selection with error
          typeErrorMessage = `Error accessing ${selectedType.name}: ${error.message}`;
          currentStep = 'type';
          continue;
        }
      }
      
      const result = await fuzzyPrompt(
        `Select ${selectedType.name} secret:`,
        choices,
        (choice) => {
          if (choice.lastChanged) {
            return `${choice.name} ${colorize(`(${choice.lastChanged})`, 'gray')}`;
          }
          return choice.name;
        },
        [` ${selectedType.name}`]
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
    throw error;
  }
}

// Interactive key browser with fuzzy search and value toggle
async function interactiveKeyBrowser(secretData, initialShowValues = false, breadcrumbs = [], secretType = null, secretName = null, region = null) {
  return new Promise((resolve) => {
    const keys = Object.keys(secretData).sort();
    let query = '';
    let showValues = initialShowValues;
    let selectedIndex = 0;
    let filteredKeys = keys;
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
        // Clear screen and move cursor to top (alternate screen buffer)
        process.stdout.write('\x1b[2J\x1b[H');
        
        let output = [];
        
        // Show breadcrumbs
        if (breadcrumbs.length > 0) {
          const breadcrumbText = breadcrumbs.join(' > ');
          output.push(colorize(`📍 ${breadcrumbText}`, 'gray'));
          output.push('');
        }
        
        // Search field (only if in search mode or has query)
        if (searchMode || query.length > 0) {
          output.push(`Search: ${colorize(query, 'bright')}`);
        }
        
        // Values toggle
        output.push(colorize(`Values: ${showValues ? 'ON' : 'OFF'} (Ctrl+V to toggle)`, 'gray'));
        output.push('');
        
        filteredKeys = fuzzySearch(query, keys);
        
        if (filteredKeys.length === 0) {
          output.push(colorize('No matches found', 'yellow'));
        } else {
          // Keep selected index within bounds
          selectedIndex = Math.min(selectedIndex, filteredKeys.length - 1);
          selectedIndex = Math.max(selectedIndex, 0);
          
          // Calculate available height
          const terminalHeight = process.stdout.rows || 24;
          const usedLines = output.length + 6; // current output + instructions + buffer
          const availableHeight = Math.max(3, terminalHeight - usedLines);
          
          // Center the selection in the available view
          const halfHeight = Math.floor(availableHeight / 2);
          const startIndex = Math.max(0, selectedIndex - halfHeight);
          const endIndex = Math.min(filteredKeys.length, startIndex + availableHeight);
          
          for (let i = startIndex; i < endIndex; i++) {
            const key = filteredKeys[i];
            const isSelected = i === selectedIndex && !searchMode;
            const prefix = isSelected ? colorize('> ', 'green') : '  ';
            const keyColor = isSelected ? 'bright' : 'reset';
            
            // Apply highlighting to the key if there's a query
            const displayKey = query ? highlightMatch(key, query) : colorize(key, keyColor);
            
            if (showValues) {
              const value = secretData[key];
              const displayValue = String(value);
              // Truncate long values
              const truncatedValue = displayValue.length > 60 
                ? displayValue.substring(0, 57) + '...' 
                : displayValue;
              output.push(`${prefix}${displayKey}: ${colorize(truncatedValue, 'cyan')}`);
            } else {
              output.push(`${prefix}${displayKey}`);
            }
          }
          
          if (filteredKeys.length > availableHeight) {
            const showing = endIndex - startIndex;
            const remaining = filteredKeys.length - showing;
            if (remaining > 0) {
              output.push(colorize(`... ${remaining} more items`, 'gray'));
            }
          }
        }
        
        // Footer info
        output.push('');
        output.push(colorize(`Showing ${filteredKeys.length} of ${keys.length} keys`, 'gray'));
        
        // Instructions
        const escapeText = breadcrumbs.length > 0 ? 'Esc to go back, ' : '';
        const editText = (secretType === 'env' || secretType === 'json' || secretType === 'aws-secrets-manager') ? 'e to edit, ' : '';
        output.push(colorize(`Use ↑↓/jk to navigate, / or type to search, ${editText}Ctrl+V to toggle values, ${escapeText}Ctrl+C to exit`, 'gray'));
        
        // Write everything at once
        process.stdout.write(output.join('\n') + '\n');
        
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
        process.stdout.write('\x1b[?1049l');
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
      } else if (keyStr === 'e') { // e key for editing
        if (!searchMode && (secretType === 'env' || secretType === 'json' || secretType === 'aws-secrets-manager')) {
          // Allow editing for env, json files, and AWS secrets
          const keysToEdit = query.length > 0 ? filteredKeys : null;

          let editorPromise;
          if (secretType === 'env') {
            editorPromise = editWithEditor(secretData, keysToEdit);
          } else if (secretType === 'json') {
            editorPromise = editWithJsonEditor(secretData, keysToEdit);
          } else if (secretType === 'aws-secrets-manager') {
            editorPromise = editAwsSecret(secretData, keysToEdit, secretName, region);
          }

          editorPromise
            .then((editedData) => {
              // Re-enter raw mode after editor exits
              process.stdin.setRawMode(true);
              process.stdin.resume();

              if (editedData !== null) {
                // Update the secretData with edited values
                Object.assign(secretData, editedData);

                // Save changes back to the original file (only for local files, not AWS)
                if (secretName && secretType !== 'aws-secrets-manager') {
                  try {
                    let newContent;
                    if (secretType === 'env') {
                      const { generateEnvContent } = require('./secrets');
                      newContent = generateEnvContent(secretData);
                    } else if (secretType === 'json') {
                      const { generateJsonContent } = require('./secrets');
                      newContent = generateJsonContent(secretData);
                    }

                    if (newContent) {
                      const fs = require('fs');
                      fs.writeFileSync(secretName, newContent);
                    }
                  } catch (saveError) {
                    console.error(colorize(`Warning: Could not save changes to file: ${saveError.message}`, 'yellow'));
                  }
                }

                render(true);
              } else {
                // Editing was cancelled, just re-render
                render(true);
              }
            })
            .catch((error) => {
              process.stderr.write(colorize(`\nError editing keys: ${error.message}\n`, 'red'));
              process.stdin.setRawMode(true);
              process.stdin.resume();
              render(true);
            });
        }
      } else if (keyStr === '\u001b[A' || keyStr === 'k') { // Up arrow or k
        selectedIndex = Math.max(0, selectedIndex - 1);
        render(true); // Immediate for navigation
      } else if (keyStr === '\u001b[B' || keyStr === 'j') { // Down arrow or j
        selectedIndex = Math.min(filteredKeys.length - 1, selectedIndex + 1);
        render(true); // Immediate for navigation
      } else if (keyStr === '\r' || keyStr === '\n') { // Enter
        if (searchMode) {
          // Exit search mode (preserve search text)
          searchMode = false;
          render(true);
        }
        // Note: No else case since this is a browser, not a selector
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

module.exports = {
  highlightMatch,
  fuzzySearch,
  fuzzyPrompt,
  runInteractiveInspect,
  interactiveKeyBrowser
};