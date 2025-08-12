const { Screen } = require('./base-screen');
const { colorize } = require('../colors');
const { RenderUtils } = require('../renderer');
const { KeyHandlerUtils } = require('../key-handlers');
const { STORAGE_TYPES } = require('../constants');
const fs = require('fs');
const path = require('path');
const { generateOutput } = require('../secrets');
const { backupFile } = require('../files');

// Copy wizard screen - multi-step interface for copying secrets
class CopyWizardScreen extends Screen {
  constructor(options) {
    super({
      ...options,
      hasSearch: false,
      hasEdit: false,
      initialState: {
        step: 'preview', // preview -> type -> file -> confirm -> copying -> done
        selectedIndex: 0,
        outputType: null,
        outputName: null,
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
            this.setState({ 
              outputType: selectedType,
              step: 'file',
              selectedIndex: 0
            });
          }
          break;
          
        case 'file':
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
      const description = type === 'env' ? '(.env format)' : '(JSON format)';
      output.push(`${prefix}${colorize(type, typeColor)} ${colorize(description, 'gray')}`);
    });
    
    output.push('');
    output.push('Use ↑↓/jk to navigate, Enter to select, Esc to go back');
  }

  renderFileSelection(output, state) {
    const { selectedIndex, outputType } = state;
    
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

  renderConfirmation(output, state) {
    const { outputName } = state;
    
    output.push(colorize('Ready to copy secrets!', 'cyan'));
    output.push('');
    
    if (fs.existsSync(outputName)) {
      output.push(colorize('⚠️  Warning: This will overwrite the existing file!', 'yellow'));
      output.push('');
    }
    
    output.push('Press Y or Enter to confirm, N or Esc to cancel');
  }

  renderCopying(output, state) {
    output.push(colorize('⏳ Copying secrets...', 'yellow'));
    output.push('Please wait while your secrets are being copied...');
  }

  renderDone(output, state) {
    const { outputName } = state;
    
    output.push(colorize('✓ Copy Successful!', 'green'));
    output.push(`Successfully copied ${this.filteredKeys.length} keys to: ${colorize(outputName, 'bright')}`);
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
    // Filter out aws-secrets-manager for simplicity, but allow copying to same type
    return STORAGE_TYPES.filter(type => type !== 'aws-secrets-manager');
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
    const { step } = this.state;
    const stepOrder = ['preview', 'type', 'file', 'confirm'];
    const currentIndex = stepOrder.indexOf(step);
    
    if (currentIndex > 0) {
      this.setState({ 
        step: stepOrder[currentIndex - 1],
        selectedIndex: 0
      });
    }
  }

  async performCopy() {
    const { outputType, outputName } = this.state;
    
    try {
      this.setState({ step: 'copying' });
      
      // Create the data object with only filtered keys
      const dataToExport = {};
      this.filteredKeys.forEach(key => {
        dataToExport[key] = this.secretData[key];
      });
      
      // Generate output content
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
      breadcrumbs: [...this.config.breadcrumbs, 'Copy secrets', 'Enter filename'],
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