const readline = require('readline');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { colorize } = require('./colors');
const { listAwsSecrets, uploadToAwsSecretsManager } = require('./aws');
const { listEnvFiles, listJsonFiles, validateEnvKey, escapeEnvValue } = require('./files');
const { fetchSecret, parseSecretData, generateEnvContent } = require('./secrets');
const { INTERACTIVE } = require('./constants');
const { TerminalManager } = require('./terminal-manager');
const { KeyEventManager, KeyHandlerUtils } = require('./key-handlers');
const { ScreenRenderer, RenderUtils } = require('./renderer');

// Composition-based Interactive Terminal using separated concerns
class InteractiveTerminal {
  constructor() {
    this.terminal = new TerminalManager();
    this.keyManager = new KeyEventManager();
    this.renderer = new ScreenRenderer();
    this.state = {};
    this.resolvePrompt = null;
  }

  initialize() {
    this.terminal.initialize();
    this.renderer.setActive(true);
    
    // Set up key event handling
    const keyHandler = (key) => this.handleKeyPress(key);
    this.terminal.onKeyPress(keyHandler);
    
    // Register cleanup
    this.terminal.onCleanup(() => {
      this.renderer.cleanup();
      this.keyManager.clearHandlers();
    });
  }

  cleanup() {
    this.renderer.cleanup();
    this.terminal.cleanup();
    this.keyManager.clearHandlers();
  }

  handleExit() {
    this.cleanup();
    process.exit(0);
  }

  onCleanup(callback) {
    this.terminal.onCleanup(callback);
  }

  setState(newState) {
    this.state = { ...this.state, ...newState };
    this.render();
  }

  render(immediate = false) {
    this.renderer.render(this.state, immediate);
  }

  setRenderer(renderFunction) {
    this.renderer.setRenderFunction(renderFunction);
  }

  addKeyHandler(handler) {
    this.keyManager.addHandler(handler);
  }

  removeKeyHandler(handler) {
    this.keyManager.removeHandler(handler);
  }

  handleKeyPress(key) {
    if (!this.terminal.active) return;
    
    const keyStr = key.toString();
    const context = { terminal: this };
    
    // Process through key manager
    this.keyManager.processKeyPress(keyStr, this.state, context);
  }

  async prompt(options) {
    return new Promise((resolve) => {
      this.initialize();
      
      // Store resolve function for handlers to call
      this.resolvePrompt = resolve;
      
      // Set initial state
      this.setState(options.initialState || {});
      
      // Set renderer
      this.setRenderer(options.render);
      
      // Add key handler
      const keyHandler = options.keyHandler || (() => false);
      this.addKeyHandler(keyHandler);
      
      // Store cleanup for this prompt
      this.onCleanup(() => {
        if (this.resolvePrompt) {
          this.resolvePrompt(null);
        }
      });
      
      // Initial render
      this.render(true);
    });
  }

  resolve(result) {
    if (this.resolvePrompt) {
      this.resolvePrompt(result);
      this.resolvePrompt = null;
    }
    this.cleanup();
  }
}

// Global terminal instance
const terminal = new InteractiveTerminal();

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
async function fuzzyPrompt(question, choices, displayFn = null, breadcrumbs = [], errorMessage = null, initialQuery = '') {
  const safeBreadcrumbs = Array.isArray(breadcrumbs) ? [...breadcrumbs] : [];
  
  const renderPrompt = (state) => {
    const { query = initialQuery || '', selectedIndex = 0, searchMode = initialQuery.length > 0 } = state;
    const output = [];
    
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
      const displayQuery = searchMode ? query + '█' : query;
      output.push(`Search: ${colorize(displayQuery, 'bright')}`);
    }
    
    output.push('');
    
    const filteredChoices = fuzzySearch(query, choices);
    // Store filtered choices in state for key handler
    if (!state.filteredChoices || state.filteredChoices !== filteredChoices) {
      terminal.setState({ filteredChoices });
    }
    
    if (filteredChoices.length === 0) {
      if (choices.length === 0 && errorMessage) {
        output.push(colorize('(No items available)', 'yellow'));
      } else {
        output.push(colorize('No matches found', 'yellow'));
      }
    } else {
      const boundedIndex = Math.max(0, Math.min(selectedIndex, filteredChoices.length - 1));
      
      // Calculate pagination using render utils
      const availableHeight = RenderUtils.calculateAvailableHeight(output.length);
      const { startIndex, endIndex } = RenderUtils.calculatePaginationWindow(boundedIndex, filteredChoices.length, availableHeight);
      const indicators = RenderUtils.getPaginationIndicators(startIndex, endIndex, filteredChoices.length);
      
      // Add previous items indicator
      if (indicators[0]) {
        output.push(indicators[0]);
      }
      
      for (let i = startIndex; i < endIndex; i++) {
        const choice = filteredChoices[i];
        let display = displayFn ? displayFn(choice) : (typeof choice === 'string' ? choice : choice.Name || choice);
        
        // Apply highlighting if there's a query
        if (query) {
          if (displayFn && choice.name) {
            const highlightedName = highlightMatch(choice.name, query);
            display = display.replace(choice.name, highlightedName);
          } else {
            const name = typeof choice === 'string' ? choice : (choice.Name || choice.name || choice);
            display = highlightMatch(name, query);
          }
        }
        
        const isSelected = i === boundedIndex && !searchMode;
        const prefix = isSelected ? colorize('> ', 'green') : '  ';
        const color = isSelected ? 'bright' : 'reset';
        
        const finalDisplay = query ? display : colorize(display, color);
        output.push(`${prefix}${finalDisplay}`);
      }
      
      // Add more items indicator
      if (indicators[1]) {
        output.push(indicators[1]);
      }
    }
    
    // Show error message
    if (errorMessage) {
      output.push('');
      output.push(colorize(`⚠️  ${errorMessage}`, 'red'));
    }
    
    // Instructions
    output.push('');
    const escapeText = safeBreadcrumbs.length > 0 ? 'Esc to go back, ' : '';
    const instructions = safeBreadcrumbs.length > 0 
      ? `Use ↑↓/jk to navigate, Ctrl+U/D or Ctrl+B/F to page, / or type to search, Enter to select, ${escapeText}Ctrl+C to cancel`
      : `Use ↑↓/jk to navigate, Ctrl+U/D or Ctrl+B/F to page, / or type to search, Enter to select, Ctrl+C to exit`;
    output.push(colorize(instructions, 'gray'));
    
    return output.join('\n') + '\n';
  };
  
  const keyHandler = KeyHandlerUtils.createFuzzySearchKeyHandler({
    filteredItemsKey: 'filteredChoices',
    hasEscape: safeBreadcrumbs.length > 0,
    terminal,
    onEscape: (state) => {
      terminal.resolve({ selection: null, query: state.query || initialQuery || '' });
      return true;
    },
    onEnter: (filteredChoices, selectedIndex, state) => {
      if (filteredChoices.length > 0) {
        terminal.resolve({ selection: filteredChoices[selectedIndex], query: state.query || initialQuery || '' });
        return true;
      }
      return false;
    }
  });
  
  return await terminal.prompt({
    initialState: {
      query: initialQuery || '',
      selectedIndex: 0,
      searchMode: initialQuery.length > 0
    },
    render: renderPrompt,
    keyHandler
  });
}

async function runInteractiveInspect(options, searchState = {}) {
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
      
      if (result.selection === null) {
        // This shouldn't happen at the root level since escape is disabled
        process.exit(0);
      }
      
      selectedType = result.selection;
      
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
        [` ${selectedType.name}`],
        null, // errorMessage
        searchState.secretQuery || '' // Use preserved search query
      );
      
      
      if (result.selection === null) {
        // Go back to type selection, but preserve the search query
        searchState.secretQuery = result.query;
        currentStep = 'type';
        continue;
      }
      
      // Store the final search query even when moving forward
      searchState.secretQuery = result.query;
      
      
      selectedSecret = result.selection;
      break; // Exit the loop to proceed with inspection
    }
  }
  
    options.type = selectedType.name;
    options.name = selectedSecret.name;
    options.showValues = false;
    
    return { options, searchState };
  } catch (error) {
    throw error;
  }
}

// Interactive key browser with fuzzy search and value toggle
async function interactiveKeyBrowser(secretData, initialShowValues = false, breadcrumbs = [], secretType = null, secretName = null, region = null) {
  const keys = Object.keys(secretData).sort();
  
  const renderBrowser = (state) => {
    const { query = '', selectedIndex = 0, searchMode = false, showValues = initialShowValues } = state;
    const output = [];
    
    // Show breadcrumbs
    if (breadcrumbs.length > 0) {
      const breadcrumbText = breadcrumbs.join(' > ');
      output.push(colorize(`📍 ${breadcrumbText}`, 'gray'));
      output.push('');
    }
    
    // Search field (only if in search mode or has query)
    if (searchMode || query.length > 0) {
      const displayQuery = searchMode ? query + '█' : query;
      output.push(`Search: ${colorize(displayQuery, 'bright')}`);
    }
    
    // Values toggle
    output.push(colorize(`Values: ${showValues ? 'ON' : 'OFF'} (Ctrl+V to toggle)`, 'gray'));
    output.push('');
    
    const filteredKeys = fuzzySearch(query, keys);
    // Store filtered keys in state for key handler
    if (!state.filteredKeys || state.filteredKeys !== filteredKeys) {
      terminal.setState({ filteredKeys });
    }
    
    if (filteredKeys.length === 0) {
      output.push(colorize('No matches found', 'yellow'));
    } else {
      const boundedIndex = Math.max(0, Math.min(selectedIndex, filteredKeys.length - 1));
      
      // Calculate pagination using render utils
      const availableHeight = RenderUtils.calculateAvailableHeight(output.length);
      const { startIndex, endIndex } = RenderUtils.calculatePaginationWindow(boundedIndex, filteredKeys.length, availableHeight);
      const indicators = RenderUtils.getPaginationIndicators(startIndex, endIndex, filteredKeys.length);
      
      // Add previous items indicator
      if (indicators[0]) {
        output.push(indicators[0]);
      }
      
      for (let i = startIndex; i < endIndex; i++) {
        const key = filteredKeys[i];
        const isSelected = i === boundedIndex && !searchMode;
        const prefix = isSelected ? colorize('> ', 'green') : '  ';
        const keyColor = isSelected ? 'bright' : 'reset';
        
        // Apply highlighting to the key if there's a query
        const displayKey = query ? highlightMatch(key, query) : colorize(key, keyColor);
        
        if (showValues) {
          const value = secretData[key];
          const displayValue = String(value);
          // Truncate long values
          const truncatedValue = RenderUtils.truncateValue(displayValue);
          output.push(`${prefix}${displayKey}: ${colorize(truncatedValue, 'cyan')}`);
        } else {
          output.push(`${prefix}${displayKey}`);
        }
      }
      
      // Add more items indicator
      if (indicators[1]) {
        output.push(indicators[1]);
      }
    }
    
    // Footer info
    output.push('');
    output.push(colorize(`Showing ${filteredKeys.length} of ${keys.length} keys`, 'gray'));
    
    // Instructions
    const escapeText = breadcrumbs.length > 0 ? 'Esc to go back, ' : '';
    const editText = (secretType === 'env' || secretType === 'json' || secretType === 'aws-secrets-manager') ? 'e to edit, ' : '';
    output.push(colorize(`Use ↑↓/jk to navigate, Ctrl+U/D or Ctrl+B/F to page, / or type to search, ${editText}Ctrl+V to toggle values, ${escapeText}Ctrl+C to exit`, 'gray'));
    
    return output.join('\n') + '\n';
  };
  
  const keyHandler = KeyHandlerUtils.createInteractiveBrowserKeyHandler({
    secretData,
    filteredItemsKey: 'filteredKeys',
    hasEscape: breadcrumbs.length > 0,
    hasEdit: secretType === 'env' || secretType === 'json' || secretType === 'aws-secrets-manager',
    hasToggle: true,
    terminal,
    onEscape: (state) => {
      terminal.resolve('BACK');
      return true;
    },
    onToggle: (state) => {
      const { showValues = initialShowValues } = state;
      return { showValues: !showValues };
    },
    onEdit: async (secretData, keysToEdit, terminal) => {
      let editorPromise;
      if (secretType === 'env') {
        editorPromise = editWithEditor(secretData, keysToEdit);
      } else if (secretType === 'json') {
        editorPromise = editWithJsonEditor(secretData, keysToEdit);
      } else if (secretType === 'aws-secrets-manager') {
        editorPromise = editAwsSecret(secretData, keysToEdit, secretName, region);
      }

      try {
        const editedData = await editorPromise;
        
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
        }
        
        // Re-initialize terminal and re-render
        terminal.initialize();
        terminal.render(true);
      } catch (error) {
        console.error(colorize(`Error editing keys: ${error.message}`, 'red'));
        terminal.initialize();
        terminal.render(true);
      }
    }
  });
  
  return await terminal.prompt({
    initialState: {
      query: '',
      selectedIndex: 0,
      searchMode: false,
      showValues: initialShowValues
    },
    render: renderBrowser,
    keyHandler
  });
}

module.exports = {
  highlightMatch,
  fuzzySearch,
  fuzzyPrompt,
  runInteractiveInspect,
  interactiveKeyBrowser
};