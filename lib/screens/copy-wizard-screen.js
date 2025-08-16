const { Screen } = require('./base-screen');
const { colorize } = require('../colors');
const { RenderUtils } = require('../renderer');
const { KeyHandlerUtils } = require('../key-handlers');
const { STORAGE_TYPES } = require('../constants');
const fs = require('fs');
const path = require('path');
const { generateOutput } = require('../secrets');
const { backupFile } = require('../files');
const debugLogger = require('../debug-logger');

// Copy wizard screen - multi-step interface for copying secrets
class CopyWizardScreen extends Screen {
  constructor(options) {
    super({
      ...options,
      hasSearch: false,
      hasEdit: false,
      initialState: {
        step: 'preview', // preview -> type -> (namespace) -> secret -> file -> confirm -> copying -> done
        selectedIndex: 0,
        outputType: null,
        outputName: null,
        outputNamespace: null,
        namespaces: [],
        searchMode: false,
        namespaceQuery: '',
        filteredNamespaces: [],
        secrets: [],
        filteredSecrets: [],
        secretQuery: '',
        secretSearchMode: false,
        createNewSecret: false,
        existingFiles: [],
        copyError: null,
        copySuccess: false,
        ...options.initialState
      }
    });
    
    this.secretData = options.secretData || {};
    this.filteredKeys = options.filteredKeys || Object.keys(this.secretData);
    this.sourceType = options.sourceType || null;
    this.sourceName = options.sourceName || null;
    this.region = options.region || null;
    this.namespace = options.namespace || null;
    this.context = options.context || null;
    
    // Set up render function
    this.setRenderFunction(this.renderWizard.bind(this));
  }

  setupKeyHandlers() {
    super.setupKeyHandlers();
    
    const handler = async (keyStr, state) => {
      const { step, selectedIndex } = state;
      
      // Common navigation keys
      if (keyStr === '\u001b') { // Escape - go back
        if (step === 'preview') {
          this.goBack();
        } else if (step === 'done' || step === 'error') {
          this.goBack();
        } else {
          // Go to previous step
          this.previousStep();
        }
        return true;
      } else if (keyStr === '\u0003') { // Ctrl+C - exit
        process.exit(0);
      }
      
      // Step-specific handling
      switch (step) {
        case 'preview':
          if (keyStr === '\r') { // Enter - proceed
            this.setState({ step: 'type' });
          }
          break;
          
        case 'type':
          if (KeyHandlerUtils.isNavigationKey(keyStr)) {
            const types = this.getOutputTypes();
            let newIndex = selectedIndex;
            
            if (keyStr === '\u001b[A' || keyStr === 'k') { // Up
              newIndex = Math.max(0, selectedIndex - 1);
            } else if (keyStr === '\u001b[B' || keyStr === 'j') { // Down
              newIndex = Math.min(types.length - 1, selectedIndex + 1);
            }
            
            if (newIndex !== selectedIndex) {
              this.setState({ selectedIndex: newIndex });
            }
          } else if (keyStr === '\r') { // Enter - select type
            const types = this.getOutputTypes();
            const selectedType = types[selectedIndex];
            
            if (selectedType === 'kubernetes') {
              // Load namespaces and go to namespace selection
              try {
                const kubernetes = require('../kubernetes');
                const namespaces = await kubernetes.listNamespaces();
                const filteredNamespaces = namespaces; // Initially show all
                this.setState({ 
                  outputType: selectedType,
                  namespaces,
                  filteredNamespaces,
                  step: 'namespace',
                  selectedIndex: 0,
                  searchMode: false,
                  namespaceQuery: ''
                });
              } catch (error) {
                this.setState({ 
                  copyError: `Failed to list namespaces: ${error.message}`,
                  step: 'error'
                });
              }
            } else {
              this.setState({ 
                outputType: selectedType,
                step: 'file',
                selectedIndex: 0
              });
            }
          }
          break;
          
        case 'namespace':
          return this.handleNamespaceSelection(keyStr, state);
          
        case 'secret':
          return this.handleSecretSelection(keyStr, state);
          
        case 'file':
          const { outputType } = state;
          
          if (outputType === 'kubernetes') {
            // For Kubernetes, prompt for secret name
            if (keyStr === '\r') { // Enter - prompt for name
              debugLogger.log('CopyWizard', 'Enter pressed on Kubernetes file step', { outputType, state });
              debugLogger.log('CopyWizard', 'About to call promptForKubernetesSecretName');
              try {
                await this.promptForKubernetesSecretName();
                debugLogger.log('CopyWizard', 'Called promptForKubernetesSecretName successfully');
              } catch (error) {
                debugLogger.error('CopyWizard', 'Error in promptForKubernetesSecretName', error);
                console.error('Error in promptForKubernetesSecretName:', error);
              }
            }
          } else {
            // Regular file selection
            if (KeyHandlerUtils.isNavigationKey(keyStr)) {
              const files = this.getFileOptions();
              let newIndex = selectedIndex;
              
              if (keyStr === '\u001b[A' || keyStr === 'k') { // Up
                newIndex = Math.max(0, selectedIndex - 1);
              } else if (keyStr === '\u001b[B' || keyStr === 'j') { // Down
                newIndex = Math.min(files.length - 1, selectedIndex + 1);
              }
              
              if (newIndex !== selectedIndex) {
                this.setState({ selectedIndex: newIndex });
              }
            } else if (keyStr === '\r') { // Enter - select file
              const files = this.getFileOptions();
              const selected = files[selectedIndex];
              
              if (selected.isNew) {
                // Launch file name input screen
                this.promptForFileName();
              } else {
                this.setState({ 
                  outputName: selected.path,
                  step: 'confirm'
                });
              }
            }
          }
          break;
          
        case 'confirm':
          if (keyStr === '\r' || keyStr === 'y' || keyStr === 'Y') { // Enter or Y - confirm
            await this.performCopy();
          } else if (keyStr === 'n' || keyStr === 'N') { // N - cancel
            this.setState({ step: 'file' });
          }
          break;
          
        case 'done':
        case 'error':
          if (keyStr === '\r') { // Enter - return to key browser
            this.goBack();
          }
          break;
      }
      
      return true;
    };
    
    this.keyManager.addHandler(handler);
  }

  renderWizard(state) {
    const { step, outputType, outputName } = state;
    const output = [];
    
    // Breadcrumbs with step indicator
    const stepNames = {
      'preview': 'Preview',
      'type': 'Select Type', 
      'file': 'Select File',
      'confirm': 'Confirm',
      'copying': 'Copying',
      'done': 'Complete',
      'error': 'Error'
    };
    
    const wizardBreadcrumbs = [...(this.config.breadcrumbs || []), 'Copy secrets', stepNames[step]];
    output.push(RenderUtils.formatBreadcrumbs(wizardBreadcrumbs));
    output.push('');
    
    // Always show keys to be copied at the top
    this.renderKeysPreview(output, state);
    output.push('');
    
    // Show current selections if we have them
    if (outputType || outputName) {
      this.renderCurrentSelections(output, state);
      output.push('');
    }
    
    // Render step-specific content
    switch (step) {
      case 'preview':
        this.renderPreviewInstructions(output, state);
        break;
      case 'type':
        this.renderTypeSelection(output, state);
        break;
      case 'namespace':
        this.renderNamespaceSelection(output, state);
        break;
      case 'secret':
        this.renderSecretSelection(output, state);
        break;
      case 'file':
        this.renderFileSelection(output, state);
        break;
      case 'confirm':
        this.renderConfirmation(output, state);
        break;
      case 'copying':
        this.renderCopying(output, state);
        break;
      case 'done':
        this.renderDone(output, state);
        break;
      case 'error':
        this.renderError(output, state);
        break;
    }
    
    return output.join('\n') + '\n';
  }

  renderKeysPreview(output, state) {
    output.push(colorize(`Keys to Copy (${this.filteredKeys.length}):`, 'cyan'));
    output.push('');
    
    // Sort keys alphabetically for consistent display
    const sortedKeys = [...this.filteredKeys].sort();
    
    // Show all keys, but in a compact format if there are many
    if (sortedKeys.length <= 10) {
      // Show all keys with bullet points
      sortedKeys.forEach(key => {
        output.push(`  • ${key}`);
      });
    } else {
      // Show keys in a more compact format
      const keysPerLine = 3;
      for (let i = 0; i < sortedKeys.length; i += keysPerLine) {
        const lineKeys = sortedKeys.slice(i, i + keysPerLine);
        const paddedKeys = lineKeys.map(key => {
          const maxKeyLength = 20;
          return key.length > maxKeyLength ? key.slice(0, maxKeyLength - 3) + '...' : key.padEnd(maxKeyLength);
        });
        output.push(`  ${paddedKeys.join(' ')}`);
      }
    }
  }

  renderCurrentSelections(output, state) {
    const { outputType, outputName } = state;
    
    output.push(colorize('Current Selections:', 'cyan'));
    if (outputType) {
      output.push(`  Output Type: ${colorize(outputType, 'bright')}`);
    }
    if (outputName) {
      const displayName = outputName.length > 50 ? '...' + outputName.slice(-47) : outputName;
      output.push(`  Output File: ${colorize(displayName, 'bright')}`);
    }
  }

  renderPreviewInstructions(output, state) {
    output.push(colorize('Ready to copy these secrets?', 'cyan'));
    output.push('');
    output.push('Press Enter to continue, Esc to cancel');
  }

  renderTypeSelection(output, state) {
    const { selectedIndex } = state;
    
    output.push(colorize('Select Output Format:', 'cyan'));
    output.push('');
    
    const types = this.getOutputTypes();
    types.forEach((type, index) => {
      const isSelected = index === selectedIndex;
      const prefix = isSelected ? colorize('> ', 'green') : '  ';
      const typeColor = isSelected ? 'bright' : 'reset';
      let description = '';
      if (type === 'env') description = '(.env format)';
      else if (type === 'json') description = '(JSON format)';
      else if (type === 'kubernetes') description = '(Kubernetes Secret)';
      output.push(`${prefix}${colorize(type, typeColor)} ${colorize(description, 'gray')}`);
    });
    
    output.push('');
    output.push('Use ↑↓/jk to navigate, Enter to select, Esc to go back');
  }

  renderNamespaceSelection(output, state) {
    const { selectedIndex, searchMode, namespaceQuery, filteredNamespaces } = state;
    
    output.push(colorize('Select Kubernetes Namespace:', 'cyan'));
    
    // Search field
    const searchDisplay = searchMode 
      ? `Search: ${namespaceQuery}${colorize('█', 'white')}`
      : namespaceQuery 
        ? `Search: ${namespaceQuery}`
        : colorize('Press / to search', 'gray');
    output.push(searchDisplay);
    output.push('');
    
    if (filteredNamespaces.length === 0) {
      output.push(colorize('No namespaces found', 'yellow'));
    } else {
      filteredNamespaces.forEach((namespace, index) => {
        const isSelected = index === selectedIndex && !searchMode;
        const prefix = isSelected ? colorize('> ', 'green') : '  ';
        const namespaceColor = isSelected ? 'bright' : 'reset';
        const description = namespace === 'default' ? ' (default)' : '';
        output.push(`${prefix}${colorize(namespace, namespaceColor)}${colorize(description, 'gray')}`);
      });
    }
    
    output.push('');
    output.push('Use ↑↓/jk to navigate, / to search, Enter to select, Esc to go back');
  }

  renderSecretSelection(output, state) {
    const { selectedIndex, secretSearchMode, secretQuery, filteredSecrets, outputNamespace, createNewSecret, outputName } = state;
    
    if (createNewSecret) {
      debugLogger.log('CopyWizard', 'Rendering create new secret', { outputName, typeOfOutputName: typeof outputName });
    }
    
    output.push(colorize(`Select Secret in namespace '${outputNamespace}':`, 'cyan'));
    
    if (createNewSecret) {
      // Inline text input mode
      output.push('');
      output.push(colorize('Enter new secret name:', 'cyan'));
      output.push('');
      
      // Simple text input box
      const inputValue = (outputName === undefined || outputName === null) ? '' : String(outputName);
      const boxWidth = 40; // Total inner width
      
      let displayContent, contentLength;
      if (inputValue === '') {
        // Show placeholder
        displayContent = colorize('my-app-secrets', 'gray');
        contentLength = 'my-app-secrets'.length; // Count placeholder length for padding
      } else {
        // Show actual input
        displayContent = inputValue;
        contentLength = inputValue.length;
      }
      
      // Calculate padding: box width minus content length minus cursor width (1)
      const padding = Math.max(0, boxWidth - contentLength - 1);
      const cursor = colorize('█', 'white');
      const spaces = ' '.repeat(padding);
      
      debugLogger.log('CopyWizard', 'Render debug', { 
        inputValue, 
        displayContent: displayContent.replace(/\x1b\[[0-9;]*m/g, ''), // Remove ANSI codes for logging
        contentLength, 
        padding,
        boxWidth,
        totalLength: contentLength + 1 + padding
      });
      
      const inputDisplay = `┌${'─'.repeat(boxWidth)}┐\n│${displayContent}${cursor}${spaces}│\n└${'─'.repeat(boxWidth)}┘`;
      output.push(inputDisplay);
      output.push('');
      output.push('Enter to confirm, Esc to go back to secret list');
    } else {
      // Normal secret list mode
      // Search field
      const searchDisplay = secretSearchMode 
        ? `Search: ${secretQuery}${colorize('█', 'white')}`
        : secretQuery 
          ? `Search: ${secretQuery}`
          : colorize('Press / to search', 'gray');
      output.push(searchDisplay);
      output.push('');
      
      if (filteredSecrets.length === 0) {
        output.push(colorize('No secrets found', 'yellow'));
      } else {
        filteredSecrets.forEach((secret, index) => {
          const isSelected = index === selectedIndex && !secretSearchMode;
          const prefix = isSelected ? colorize('> ', 'green') : '  ';
          const secretColor = isSelected ? 'bright' : 'reset';
          
          if (secret.isNew) {
            output.push(`${prefix}${colorize('[Create New Secret]', 'cyan')}`);
          } else {
            output.push(`${prefix}${colorize(secret.name, secretColor)}`);
          }
        });
      }
      
      output.push('');
      output.push('Use ↑↓/jk to navigate, / to search, Enter to select, Esc to go back');
    }
  }

  renderFileSelection(output, state) {
    const { selectedIndex, outputType } = state;
    
    if (outputType === 'kubernetes') {
      // For Kubernetes, we just need a secret name input
      output.push(colorize('Enter Kubernetes Secret Name:', 'cyan'));
      output.push('');
      output.push('This will be handled by the text input screen');
      output.push('');
      output.push('Press Enter to continue, Esc to go back');
    } else {
      output.push(colorize('Select Output File:', 'cyan'));
      output.push('');
      
      const files = this.getFileOptions();
      files.forEach((file, index) => {
        const isSelected = index === selectedIndex;
        const prefix = isSelected ? colorize('> ', 'green') : '  ';
        const fileColor = isSelected ? 'bright' : 'reset';
        
        if (file.isNew) {
          output.push(`${prefix}${colorize('[Create New File]', fileColor)}`);
        } else {
          const exists = fs.existsSync(file.path);
          const fileName = path.basename(file.path);
          const indicator = exists ? colorize(' ✓', 'green') : colorize(' (new)', 'gray');
          output.push(`${prefix}${colorize(fileName, fileColor)}${indicator}`);
        }
      });
      
      output.push('');
      output.push('Use ↑↓/jk to navigate, Enter to select, Esc to go back');
    }
  }

  renderConfirmation(output, state) {
    const { outputName, outputType, outputNamespace } = state;
    
    output.push(colorize('Ready to copy secrets!', 'cyan'));
    output.push('');
    
    if (outputType === 'kubernetes') {
      output.push(`Target: Kubernetes Secret`);
      output.push(`  Name: ${colorize(outputName, 'bright')}`);
      output.push(`  Namespace: ${colorize(outputNamespace, 'bright')}`);
      output.push('');
      output.push(colorize('⚠️  This will create or update the secret in the cluster', 'yellow'));
    } else {
      if (fs.existsSync(outputName)) {
        output.push(colorize('⚠️  Warning: This will overwrite the existing file!', 'yellow'));
        output.push('');
      }
    }
    
    output.push('');
    output.push('Press Y or Enter to confirm, N or Esc to cancel');
  }

  renderCopying(output, state) {
    output.push(colorize('⏳ Copying secrets...', 'yellow'));
    output.push('Please wait while your secrets are being copied...');
  }

  renderDone(output, state) {
    const { outputName, outputType, outputNamespace } = state;
    
    output.push(colorize('✓ Copy Successful!', 'green'));
    
    if (outputType === 'kubernetes') {
      output.push(`Successfully copied ${this.filteredKeys.length} keys to Kubernetes secret:`);
      output.push(`  Secret: ${colorize(outputName, 'bright')}`);
      output.push(`  Namespace: ${colorize(outputNamespace, 'bright')}`);
    } else {
      output.push(`Successfully copied ${this.filteredKeys.length} keys to: ${colorize(outputName, 'bright')}`);
    }
    
    output.push('');
    output.push('Press Enter or Esc to return to Key Browser');
  }

  renderError(output, state) {
    const { copyError } = state;
    
    output.push(colorize('✗ Copy Failed', 'red'));
    output.push(colorize(copyError || 'An unknown error occurred', 'red'));
    output.push('');
    output.push('Press Enter or Esc to return to Key Browser');
  }

  // Helper methods
  getOutputTypes() {
    // Include all storage types now that we support Kubernetes
    return STORAGE_TYPES.filter(type => type !== 'aws-secrets-manager');
  }

  handleNamespaceSelection(keyStr, state) {
    const { selectedIndex, searchMode, namespaceQuery, namespaces, filteredNamespaces } = state;
    
    // Handle search mode toggle
    if (keyStr === '/') {
      this.setState({ searchMode: true });
      return true;
    }
    
    // Handle escape in search mode
    if (keyStr === '\u001b' && searchMode) {
      this.setState({ searchMode: false });
      return true;
    }
    
    // Handle enter key
    if (keyStr === '\r' || keyStr === '\n') {
      if (searchMode) {
        // Exit search mode
        this.setState({ searchMode: false });
      } else if (filteredNamespaces.length > 0) {
        // Select namespace and load secrets
        const selectedNamespace = filteredNamespaces[selectedIndex];
        
        // Load secrets asynchronously
        const kubernetes = require('../kubernetes');
        kubernetes.listSecrets(selectedNamespace).then(secrets => {
          // Add "Create new secret" option at the top
          const secretOptions = [{ name: '[Create New Secret]', isNew: true }, ...secrets.map(name => ({ name, isNew: false }))];
          
          this.setState({ 
            outputNamespace: selectedNamespace,
            secrets: secretOptions,
            filteredSecrets: secretOptions,
            step: 'secret',
            selectedIndex: 0,
            secretSearchMode: false,
            secretQuery: ''
          });
        }).catch(error => {
          // If we can't list secrets, just go directly to name input
          this.setState({ 
            outputNamespace: selectedNamespace,
            step: 'file',
            selectedIndex: 0
          });
        });
      }
      return true;
    }
    
    // Handle navigation in non-search mode
    if (!searchMode && KeyHandlerUtils.isNavigationKey(keyStr)) {
      let newIndex = selectedIndex;
      
      if (keyStr === '\u001b[A' || keyStr === 'k') { // Up
        newIndex = Math.max(0, selectedIndex - 1);
      } else if (keyStr === '\u001b[B' || keyStr === 'j') { // Down
        newIndex = Math.min(filteredNamespaces.length - 1, selectedIndex + 1);
      }
      
      if (newIndex !== selectedIndex) {
        this.setState({ selectedIndex: newIndex });
      }
      return true;
    }
    
    // Handle text input in search mode
    if (searchMode) {
      if (keyStr === '\u007f' || keyStr === '\b') { // Backspace
        const newQuery = namespaceQuery.slice(0, -1);
        const filtered = this.filterNamespaces(newQuery, namespaces);
        this.setState({ 
          namespaceQuery: newQuery,
          filteredNamespaces: filtered,
          selectedIndex: 0
        });
      } else if (KeyHandlerUtils.isPrintableKey(keyStr)) {
        const newQuery = namespaceQuery + keyStr;
        const filtered = this.filterNamespaces(newQuery, namespaces);
        this.setState({ 
          namespaceQuery: newQuery,
          filteredNamespaces: filtered,
          selectedIndex: 0
        });
      }
      return true;
    }
    
    return false;
  }

  filterNamespaces(query, namespaces) {
    if (!query) return namespaces;
    
    const lowerQuery = query.toLowerCase();
    return namespaces.filter(ns => ns.toLowerCase().includes(lowerQuery));
  }

  handleSecretSelection(keyStr, state) {
    const { selectedIndex, secretSearchMode, secretQuery, secrets, filteredSecrets, createNewSecret } = state;
    
    // If we're in inline text input mode
    if (createNewSecret) {
      if (keyStr === '\u001b') { // Escape - go back to secret list
        this.setState({ 
          createNewSecret: false,
          outputName: null
        });
        return true;
      } else if (keyStr === '\r' || keyStr === '\n') { // Enter - use the entered name
        const { outputName } = state;
        if (outputName && outputName.trim()) {
          // Validate Kubernetes secret name
          const kubeNameRegex = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
          if (kubeNameRegex.test(outputName.trim()) && outputName.length <= 253) {
            this.setState({ 
              step: 'confirm',
              createNewSecret: false,
              outputName: outputName.trim()
            });
          }
        }
        return true;
      } else if (keyStr === '\u007f' || keyStr === '\b') { // Backspace
        const currentName = state.outputName || '';
        this.setState({ 
          outputName: currentName.slice(0, -1)
        });
        return true;
      } else if (this.isPrintableKey(keyStr)) {
        const currentName = state.outputName || '';
        if (currentName.length < 253) { // Kubernetes name limit
          this.setState({ 
            outputName: currentName + keyStr
          });
        }
        return true;
      }
      return true; // Consume all keys in this mode
    }
    
    // Handle search mode toggle
    if (keyStr === '/') {
      this.setState({ secretSearchMode: true });
      return true;
    }
    
    // Handle escape in search mode
    if (keyStr === '\u001b' && secretSearchMode) {
      this.setState({ secretSearchMode: false });
      return true;
    }
    
    // Handle enter key
    if (keyStr === '\r' || keyStr === '\n') {
      if (secretSearchMode) {
        // Exit search mode
        this.setState({ secretSearchMode: false });
      } else if (filteredSecrets.length > 0) {
        const selectedSecret = filteredSecrets[selectedIndex];
        if (selectedSecret.isNew) {
          // Switch to inline text input mode
          debugLogger.log('CopyWizard', 'Switching to create new secret mode');
          this.setState({ 
            createNewSecret: true,
            outputName: '',
            secretSearchMode: false
          });
        } else {
          // Use existing secret name
          this.setState({ 
            outputName: selectedSecret.name,
            step: 'confirm'
          });
        }
      }
      return true;
    }
    
    // Handle navigation in non-search mode
    if (!secretSearchMode && this.isNavigationKey(keyStr)) {
      let newIndex = selectedIndex;
      
      if (keyStr === '\u001b[A' || keyStr === 'k') { // Up
        newIndex = Math.max(0, selectedIndex - 1);
      } else if (keyStr === '\u001b[B' || keyStr === 'j') { // Down
        newIndex = Math.min(filteredSecrets.length - 1, selectedIndex + 1);
      }
      
      if (newIndex !== selectedIndex) {
        this.setState({ selectedIndex: newIndex });
      }
      return true;
    }
    
    // Handle text input in search mode
    if (secretSearchMode) {
      if (keyStr === '\u007f' || keyStr === '\b') { // Backspace
        const newQuery = secretQuery.slice(0, -1);
        const filtered = this.filterSecrets(newQuery, secrets);
        this.setState({ 
          secretQuery: newQuery,
          filteredSecrets: filtered,
          selectedIndex: 0
        });
      } else if (this.isPrintableKey(keyStr)) {
        const newQuery = secretQuery + keyStr;
        const filtered = this.filterSecrets(newQuery, secrets);
        this.setState({ 
          secretQuery: newQuery,
          filteredSecrets: filtered,
          selectedIndex: 0
        });
      }
      return true;
    }
    
    return false;
  }

  filterSecrets(query, secrets) {
    if (!query) return secrets;
    
    const lowerQuery = query.toLowerCase();
    return secrets.filter(secret => secret.name.toLowerCase().includes(lowerQuery));
  }

  isNavigationKey(keyStr) {
    return keyStr === '\u001b[A' || keyStr === '\u001b[B' || keyStr === 'k' || keyStr === 'j';
  }

  isPrintableKey(keyStr) {
    return keyStr.length === 1 && keyStr >= ' ' && keyStr <= '~';
  }

  getFileOptions() {
    const { outputType } = this.state;
    const extension = outputType === 'json' ? '.json' : '.env';
    
    // Look for existing files of this type
    const cwd = process.cwd();
    const files = [];
    
    // Add "Create New" option first
    files.push({ isNew: true });
    
    // Add some common file names
    if (outputType === 'env') {
      ['.env', '.env.local', '.env.development', '.env.production'].forEach(name => {
        files.push({ path: path.join(cwd, name), isNew: false });
      });
    } else if (outputType === 'json') {
      ['secrets.json', 'config.json', 'settings.json'].forEach(name => {
        files.push({ path: path.join(cwd, name), isNew: false });
      });
    }
    
    return files;
  }

  generateFileName(outputType) {
    const extension = outputType === 'json' ? '.json' : '.env';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    return `lowkey-export-${timestamp}${extension}`;
  }

  previousStep() {
    const { step, outputType } = this.state;
    
    const steps = {
      'type': 'preview',
      'namespace': 'type',
      'secret': 'namespace',
      'file': outputType === 'kubernetes' ? 'secret' : 'type',
      'confirm': 'file'
    };
    
    const previousStep = steps[step];
    if (previousStep) {
      this.setState({ step: previousStep, selectedIndex: 0 });
    }
  }

  async promptForKubernetesSecretName() {
    debugLogger.log('CopyWizard', 'promptForKubernetesSecretName called');
    
    try {
      const { TextInputScreen } = require('./text-input-screen');
      const { TerminalManager } = require('../terminal-manager');
      const terminalManager = TerminalManager.getInstance();
      
      debugLogger.log('CopyWizard', 'Creating TextInputScreen', { 
        breadcrumbs: this.config.breadcrumbs,
        hasConfig: !!this.config 
      });
      
      // Create input screen for Kubernetes secret name
      const inputScreen = new TextInputScreen({
      prompt: 'Enter Kubernetes secret name:',
      placeholder: 'my-app-secrets',
      defaultValue: '',
      maxLength: 253,
      breadcrumbs: [...(this.config.breadcrumbs || []), 'Copy secrets', 'Enter secret name'],
      hasBackNavigation: true,
      validator: (value) => {
        if (!value || value.trim().length === 0) {
          return { valid: false, error: 'Secret name cannot be empty' };
        }
        
        // Kubernetes naming rules
        const kubeNameRegex = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
        if (!kubeNameRegex.test(value)) {
          return { valid: false, error: 'Must be lowercase alphanumeric or \'-\', start/end with alphanumeric' };
        }
        
        if (value.length > 253) {
          return { valid: false, error: 'Secret name must be no more than 253 characters' };
        }
        
        return { valid: true, value };
      }
    });
    
      debugLogger.log('CopyWizard', 'Pushing TextInputScreen to terminal manager');
      terminalManager.pushScreen(inputScreen);
      debugLogger.log('CopyWizard', 'TextInputScreen pushed successfully');
      
      // Wait for result
      const result = await inputScreen.run();
      debugLogger.log('CopyWizard', 'TextInputScreen result', result);
      
      // Handle the result structure - it comes wrapped in { action, data }
      const resultData = result.data || result;
      if (!resultData.cancelled && resultData.value) {
        this.setState({ 
          outputName: resultData.value,
          step: 'confirm'
        });
      }
      // If cancelled, stay on file selection step (no state change needed)
      
    } catch (error) {
      debugLogger.error('CopyWizard', 'Error in promptForKubernetesSecretName', error);
      throw error;
    }
  }

  async performCopy() {
    const { outputType, outputName, outputNamespace } = this.state;
    
    try {
      this.setState({ step: 'copying' });
      
      // Create the data object with only filtered keys
      const dataToExport = {};
      this.filteredKeys.forEach(key => {
        dataToExport[key] = this.secretData[key];
      });
      
      if (outputType === 'kubernetes') {
        // For Kubernetes, use the setSecret function
        const { setSecret } = require('../kubernetes');
        await setSecret(outputName, dataToExport, outputNamespace);
        
        this.setState({ 
          step: 'done',
          copySuccess: true
        });
      } else {
        // Generate output content for file-based formats
        const outputContent = await generateOutput(
          dataToExport, 
          outputType, 
          outputName, 
          this.region, 
          'AWSCURRENT',
          true
        );
        
        // Write to file
        if (fs.existsSync(outputName)) {
          backupFile(outputName);
        }
        
        fs.writeFileSync(outputName, outputContent);
        
        this.setState({ 
          step: 'done',
          copySuccess: true
        });
      }
      
    } catch (error) {
      this.setState({ 
        step: 'error',
        copyError: error.message,
        copySuccess: false
      });
    }
  }

  async promptForFileName() {
    const { TextInputScreen } = require('./text-input-screen');
    const { TerminalManager } = require('../terminal-manager');
    const terminalManager = TerminalManager.getInstance();
    
    const { outputType } = this.state;
    const extension = outputType === 'json' ? '.json' : '.env';
    const defaultName = this.generateFileName(outputType);
    
    // Create input screen
    const inputScreen = new TextInputScreen({
      prompt: `Enter filename for ${outputType} file:`,
      placeholder: defaultName,
      defaultValue: '',
      maxLength: 100,
      breadcrumbs: [...(this.config.breadcrumbs || []), 'Copy secrets', 'Enter filename'],
      hasBackNavigation: true,
      validator: (value) => {
        if (!value || value.trim().length === 0) {
          return { valid: false, error: 'Filename cannot be empty' };
        }
        
        // Check for valid filename characters
        const invalidChars = /[<>:"/\\|?*]/;
        if (invalidChars.test(value)) {
          return { valid: false, error: 'Filename contains invalid characters' };
        }
        
        // Add extension if not present
        if (!value.endsWith(extension)) {
          return { valid: true, value: value + extension };
        }
        
        return { valid: true, value };
      }
    });
    
    // Push input screen
    terminalManager.pushScreen(inputScreen);
    
    // Wait for result
    const result = await inputScreen.run();
    
    if (!result.cancelled && result.value) {
      this.setState({ 
        outputName: result.value,
        step: 'confirm'
      });
    }
    // If cancelled, stay on file selection step (no state change needed)
  }
}

module.exports = { CopyWizardScreen };