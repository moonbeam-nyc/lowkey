const { Screen } = require('./base-screen');
const { colorize } = require('../../core/colors');
const { RenderUtils } = require('../renderer');
const { KeyHandlerUtils } = require('../key-handlers');
const { KeyHandlerSet, KeyDetector } = require('../key-handler-set');
const { STORAGE_TYPES } = require('../../core/constants');
const { NavigationComponents, StatusComponents, ListComponents, InputComponents } = require('../ui-components');
const fs = require('fs');
const path = require('path');
const { CommandHandlers } = require('../../cli/command-handlers');
const debugLogger = require('../../core/debug-logger');

// Copy wizard screen - multi-step interface for copying secrets
class CopyWizardScreen extends Screen {
  constructor(options) {
    super({
      ...options,
      hasSearch: false,
      hasEdit: false,
      hasBackNavigation: false, // Handle ESC manually for step navigation
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
        inlineTextInput: false, // For filename input mode
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
    
    const handler = async (key, state) => {
      const { step } = state;
      
      // Get the appropriate key handler set for the current step
      const keyHandlers = this.getKeyHandlersForStep(step, state);
      
      // Process the key through the handler set
      return keyHandlers.process(key, { 
        state: state, 
        setState: this.setState.bind(this),
        screen: this
      });
    };
    
    this.keyManager.addHandler(handler);
  }

  getKeyHandlersForStep(step, state) {
    const { selectedIndex } = state;
    
    // Common handlers for all steps
    const commonHandlers = new KeyHandlerSet()
      .onEscape(() => {
        if (step === 'preview' || step === 'done') {
          this.goBack();
        } else if (step === 'error') {
          this.previousStep();
        } else {
          this.previousStep();
        }
        return true;
      })
      .onKey('\u0003', () => { // Ctrl+C
        process.exit(0);
      });

    // Step-specific handlers
    switch (step) {
      case 'preview':
        return commonHandlers
          .onEnter(() => {
            this.setState({ step: 'type' });
            return true;
          });

      case 'type':
        return commonHandlers
          .onUpArrow(() => {
            const types = this.getOutputTypes();
            const newIndex = Math.max(0, selectedIndex - 1);
            this.setState({ selectedIndex: newIndex });
            return true;
          })
          .onDownArrow(() => {
            const types = this.getOutputTypes();
            const newIndex = Math.min(types.length - 1, selectedIndex + 1);
            this.setState({ selectedIndex: newIndex });
            return true;
          })
          .onKey('j', () => {
            const types = this.getOutputTypes();
            const newIndex = Math.min(types.length - 1, selectedIndex + 1);
            this.setState({ selectedIndex: newIndex });
            return true;
          })
          .onKey('k', () => {
            const types = this.getOutputTypes();
            const newIndex = Math.max(0, selectedIndex - 1);
            this.setState({ selectedIndex: newIndex });
            return true;
          })
          .onEnter(async () => {
            const types = this.getOutputTypes();
            const selectedType = types[selectedIndex];
            return await this.handleTypeSelection(selectedType);
          });

      case 'namespace':
        return this.getNamespaceKeyHandlers(state);

      case 'secret':
        return this.getSecretKeyHandlers(state);

      case 'file':
        return this.getFileKeyHandlers(state);

      case 'confirm':
        return commonHandlers
          .onEnter(async () => {
            await this.performCopy();
            return true;
          })
          .onKey('y', async () => {
            await this.performCopy();
            return true;
          })
          .onKey('Y', async () => {
            await this.performCopy();
            return true;
          })
          .onKey('n', () => {
            this.setState({ step: 'file' });
            return true;
          })
          .onKey('N', () => {
            this.setState({ step: 'file' });
            return true;
          });

      case 'done':
        return commonHandlers
          .onEnter(() => {
            this.goBack();
            return true;
          });

      case 'error':
        return commonHandlers
          .onEnter(() => {
            this.previousStep();
            return true;
          });

      default:
        return commonHandlers;
    }
  }

  async handleTypeSelection(selectedType) {
    if (selectedType === 'kubernetes') {
      // Load namespaces and go to namespace selection
      try {
        const kubernetes = require('../../providers/kubernetes');
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
    } else if (selectedType === 'aws-secrets-manager') {
      // Check if AWS region is configured
      if (!this.region) {
        this.setState({ 
          copyError: `AWS region not configured. Please set AWS_REGION environment variable or use --region parameter.`,
          step: 'error'
        });
        return true;
      }
      
      // Load AWS secrets and go to AWS secret selection
      try {
        const aws = require('../../providers/aws');
        const secretsList = await aws.listAwsSecrets(this.region);
        const secretNames = secretsList.map(secret => secret.Name);
        const secretOptions = [{ name: '[Create New Secret]', isNew: true }, ...secretNames.map(name => ({ name, isNew: false }))];
        this.setState({ 
          outputType: selectedType,
          secrets: secretOptions,
          filteredSecrets: secretOptions,
          step: 'secret',
          selectedIndex: 0,
          secretSearchMode: false,
          secretQuery: ''
        });
      } catch (error) {
        this.setState({ 
          copyError: `Failed to list AWS secrets: ${error.message}`,
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
    return true;
  }

  async loadKubernetesSecrets(namespace) {
    try {
      const kubernetes = require('../../providers/kubernetes');
      const secretsList = await kubernetes.listSecrets(namespace);
      
      // Add "Create New Secret" option at the top
      const secretOptions = [
        { name: '[Create New Secret]', isNew: true },
        ...secretsList.map(secret => ({ 
          name: secret.name || secret, 
          isNew: false 
        }))
      ];
      
      this.setState({ 
        outputNamespace: namespace,
        secrets: secretOptions,
        filteredSecrets: secretOptions,
        step: 'secret',
        selectedIndex: 0,
        secretSearchMode: false,
        secretQuery: ''
      });
    } catch (error) {
      this.setState({ 
        copyError: `Failed to list secrets in namespace ${namespace}: ${error.message}`,
        step: 'error'
      });
    }
  }

  getNamespaceKeyHandlers(state) {
    const { selectedIndex, searchMode, namespaceQuery, filteredNamespaces } = state;
    
    const handlers = new KeyHandlerSet()
      .onEscape(() => {
        if (searchMode) {
          this.setState({ searchMode: false });
          return true;
        } else {
          this.previousStep();
          return true;
        }
      })
      .onSearchTrigger(() => {
        this.setState({ searchMode: true });
        return true;
      })
      .onEnter(() => {
        if (searchMode) {
          this.setState({ searchMode: false });
          return true;
        } else {
          const selected = filteredNamespaces[selectedIndex];
          if (selected) {
            // Load secrets for the selected namespace
            this.loadKubernetesSecrets(selected);
          }
          return true;
        }
      })
      .onUpArrow(() => {
        if (!searchMode) {
          const newIndex = Math.max(0, selectedIndex - 1);
          this.setState({ selectedIndex: newIndex });
        }
        return true;
      })
      .onDownArrow(() => {
        if (!searchMode) {
          const newIndex = Math.min(filteredNamespaces.length - 1, selectedIndex + 1);
          this.setState({ selectedIndex: newIndex });
        }
        return true;
      })
      .onKey('j', () => {
        if (!searchMode) {
          const newIndex = Math.min(filteredNamespaces.length - 1, selectedIndex + 1);
          this.setState({ selectedIndex: newIndex });
        }
        return true;
      })
      .onKey('k', () => {
        if (!searchMode) {
          const newIndex = Math.max(0, selectedIndex - 1);
          this.setState({ selectedIndex: newIndex });
        }
        return true;
      })
      .onBackspace(() => {
        if (searchMode && namespaceQuery.length > 0) {
          const newQuery = namespaceQuery.slice(0, -1);
          const filtered = this.filterNamespaces(newQuery, state.namespaces);
          this.setState({ 
            namespaceQuery: newQuery,
            filteredNamespaces: filtered,
            selectedIndex: 0
          });
        }
        return true;
      })
      .onPrintable((key) => {
        if (searchMode) {
          const char = KeyDetector.normalize(key);
          const newQuery = namespaceQuery + char;
          const filtered = this.filterNamespaces(newQuery, state.namespaces);
          this.setState({ 
            namespaceQuery: newQuery,
            filteredNamespaces: filtered,
            selectedIndex: 0
          });
        }
        return true;
      });

    return handlers;
  }

  getSecretKeyHandlers(state) {
    const { selectedIndex, secretSearchMode, secretQuery, filteredSecrets, createNewSecret, outputName } = state;
    
    if (createNewSecret) {
      // Handle new secret creation mode
      return new KeyHandlerSet()
        .onEscape(() => {
          this.setState({ 
            createNewSecret: false,
            outputName: null
          });
          return true;
        })
        .onEnter(() => {
          if (outputName && outputName.trim()) {
            this.setState({ step: 'confirm' });
          }
          return true;
        })
        .onBackspace(() => {
          const currentName = outputName || '';
          this.setState({ 
            outputName: currentName.slice(0, -1)
          });
          return true;
        })
        .onPrintable((key) => {
          const char = KeyDetector.normalize(key);
          this.setState({ 
            outputName: (outputName || '') + char
          });
          return true;
        });
    }

    // Normal secret selection mode
    const handlers = new KeyHandlerSet()
      .onEscape(() => {
        if (secretSearchMode) {
          this.setState({ secretSearchMode: false });
          return true;
        } else {
          this.previousStep();
          return true;
        }
      })
      .onSearchTrigger(() => {
        this.setState({ secretSearchMode: true });
        return true;
      })
      .onEnter(() => {
        if (secretSearchMode) {
          this.setState({ secretSearchMode: false });
          return true;
        } else {
          const selected = filteredSecrets[selectedIndex];
          if (selected) {
            if (selected.isNew) {
              // For Kubernetes, go to file step with inline text input
              // For AWS, use createNewSecret mode
              if (this.state.outputType === 'kubernetes') {
                this.setState({ 
                  step: 'file',
                  inlineTextInput: true,
                  outputName: '',
                  selectedIndex: 0
                });
              } else {
                this.setState({ createNewSecret: true, outputName: '' });
              }
            } else {
              this.setState({ 
                outputName: selected.name,
                step: 'confirm'
              });
            }
          }
          return true;
        }
      })
      .onUpArrow(() => {
        if (!secretSearchMode) {
          const newIndex = Math.max(0, selectedIndex - 1);
          this.setState({ selectedIndex: newIndex });
        }
        return true;
      })
      .onDownArrow(() => {
        if (!secretSearchMode) {
          const newIndex = Math.min(filteredSecrets.length - 1, selectedIndex + 1);
          this.setState({ selectedIndex: newIndex });
        }
        return true;
      })
      .onKey('j', () => {
        if (!secretSearchMode) {
          const newIndex = Math.min(filteredSecrets.length - 1, selectedIndex + 1);
          this.setState({ selectedIndex: newIndex });
        }
        return true;
      })
      .onKey('k', () => {
        if (!secretSearchMode) {
          const newIndex = Math.max(0, selectedIndex - 1);
          this.setState({ selectedIndex: newIndex });
        }
        return true;
      })
      .onKey('\u0015', () => { // Ctrl+U - Page up
        if (!secretSearchMode) {
          const pageSize = 10;
          const newIndex = Math.max(0, selectedIndex - pageSize);
          this.setState({ selectedIndex: newIndex });
        }
        return true;
      })
      .onKey('\u0004', () => { // Ctrl+D - Page down
        if (!secretSearchMode) {
          const pageSize = 10;
          const newIndex = Math.min(filteredSecrets.length - 1, selectedIndex + pageSize);
          this.setState({ selectedIndex: newIndex });
        }
        return true;
      })
      .onKey('\u0002', () => { // Ctrl+B - Page up (alternative)
        if (!secretSearchMode) {
          const pageSize = 10;
          const newIndex = Math.max(0, selectedIndex - pageSize);
          this.setState({ selectedIndex: newIndex });
        }
        return true;
      })
      .onKey('\u0006', () => { // Ctrl+F - Page down (alternative)
        if (!secretSearchMode) {
          const pageSize = 10;
          const newIndex = Math.min(filteredSecrets.length - 1, selectedIndex + pageSize);
          this.setState({ selectedIndex: newIndex });
        }
        return true;
      })
      .onBackspace(() => {
        if (secretSearchMode && secretQuery.length > 0) {
          const newQuery = secretQuery.slice(0, -1);
          const filtered = this.filterSecrets(newQuery, state.secrets);
          this.setState({
            secretQuery: newQuery,
            filteredSecrets: filtered,
            selectedIndex: 0
          });
        }
        return true;
      })
      .onPrintable((key) => {
        if (secretSearchMode) {
          const char = KeyDetector.normalize(key);
          const newQuery = secretQuery + char;
          const filtered = this.filterSecrets(newQuery, state.secrets);
          this.setState({
            secretQuery: newQuery,
            filteredSecrets: filtered,
            selectedIndex: 0
          });
        }
        return true;
      });

    return handlers;
  }

  getFileKeyHandlers(state) {
    const { outputType, inlineTextInput, selectedIndex } = state;
    
    if (outputType === 'kubernetes') {
      // For Kubernetes, use inline text input like env files
      if (inlineTextInput) {
        return this.getKubernetesInlineTextInputKeyHandlers(state);
      } else {
        return new KeyHandlerSet()
          .onEscape(() => {
            this.previousStep();
            return true;
          })
          .onEnter(() => {
            debugLogger.log('CopyWizard', 'Enter pressed on Kubernetes file step - switching to inline text input');
            this.setState({ 
              inlineTextInput: true,
              outputName: ''
            });
            return true;
          });
      }
    } else if (inlineTextInput) {
      // Handle inline text input for filename
      return this.getInlineTextInputKeyHandlers(state);
    } else {
      // Normal file selection mode
      const handlers = new KeyHandlerSet()
        .onEscape(() => {
          this.previousStep();
          return true;
        })
        .onUpArrow(() => {
          const files = this.getFileOptions();
          const newIndex = Math.max(0, selectedIndex - 1);
          this.setState({ selectedIndex: newIndex });
          return true;
        })
        .onDownArrow(() => {
          const files = this.getFileOptions();
          const newIndex = Math.min(files.length - 1, selectedIndex + 1);
          this.setState({ selectedIndex: newIndex });
          return true;
        })
        .onKey('j', () => {
          const files = this.getFileOptions();
          const newIndex = Math.min(files.length - 1, selectedIndex + 1);
          this.setState({ selectedIndex: newIndex });
          return true;
        })
        .onKey('k', () => {
          const files = this.getFileOptions();
          const newIndex = Math.max(0, selectedIndex - 1);
          this.setState({ selectedIndex: newIndex });
          return true;
        })
        .onEnter(() => {
          const files = this.getFileOptions();
          const selected = files[selectedIndex];
          
          if (selected.isNew) {
            this.setState({ 
              inlineTextInput: true,
              outputName: ''
            });
          } else {
            this.setState({ 
              outputName: selected.path,
              step: 'confirm'
            });
          }
          return true;
        });

      return handlers;
    }
  }

  getInlineTextInputKeyHandlers(state) {
    const { outputName, outputType } = state;
    
    return new KeyHandlerSet()
      .onEscape(() => {
        this.setState({ 
          inlineTextInput: false,
          outputName: null
        });
        return true;
      })
      .onEnter(() => {
        if (outputName && outputName.trim()) {
          // Add extension if not present
          const extension = outputType === 'json' ? '.json' : '.env';
          let finalName = outputName.trim();
          if (!finalName.endsWith(extension)) {
            finalName += extension;
          }
          
          this.setState({ 
            outputName: finalName,
            inlineTextInput: false,
            step: 'confirm'
          });
        }
        return true;
      })
      .onBackspace(() => {
        const newName = (outputName || '').slice(0, -1);
        this.setState({ outputName: newName });
        return true;
      })
      .onPrintable((key) => {
        const char = KeyDetector.normalize(key);
        // Simple filename validation - only allow alphanumeric, dash, underscore, dot
        if (/[a-zA-Z0-9._-]/.test(char)) {
          this.setState({ outputName: (outputName || '') + char });
        }
        return true;
      });
  }

  getKubernetesInlineTextInputKeyHandlers(state) {
    const { outputName } = state;
    
    return new KeyHandlerSet()
      .onEscape(() => {
        this.setState({ 
          inlineTextInput: false,
          outputName: null
        });
        return true;
      })
      .onEnter(() => {
        if (outputName && outputName.trim()) {
          // Validate Kubernetes secret name
          const secretName = outputName.trim().toLowerCase();
          if (this.isValidKubernetesSecretName(secretName)) {
            this.setState({ 
              outputName: secretName,
              inlineTextInput: false,
              step: 'confirm'
            });
          } else {
            // Show validation error but don't proceed
            this.setState({ 
              validationError: 'Invalid secret name. Use lowercase letters, numbers, and hyphens only.'
            });
          }
        }
        return true;
      })
      .onBackspace(() => {
        const newName = (outputName || '').slice(0, -1);
        this.setState({ 
          outputName: newName,
          validationError: null // Clear validation error on input change
        });
        return true;
      })
      .onPrintable((key) => {
        const char = KeyDetector.normalize(key);
        // Kubernetes secret name validation - only allow lowercase letters, numbers, and hyphens
        if (/[a-z0-9-]/.test(char)) {
          this.setState({ 
            outputName: (outputName || '') + char,
            validationError: null // Clear validation error on input change
          });
        }
        return true;
      });
  }

  isValidKubernetesSecretName(name) {
    // Kubernetes secret names must be valid DNS subdomain names
    // - lowercase letters, numbers, and hyphens only
    // - must start and end with alphanumeric character
    // - max 253 characters
    if (!name || name.length === 0 || name.length > 253) {
      return false;
    }
    
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(name)) {
      return false;
    }
    
    return true;
  }

  renderWizard(state) {
    const { step, outputType, outputName } = state;
    const output = [];
    
    // Breadcrumbs with step indicator using NavigationComponents
    const stepNames = {
      'preview': 'Preview',
      'type': 'Select Type', 
      'file': 'Select File',
      'confirm': 'Confirm',
      'copying': 'Copying',
      'done': 'Complete',
      'error': 'Error'
    };
    
    const wizardBreadcrumbs = [...(this.config.breadcrumbs || []), 'Copy secrets'];
    output.push(NavigationComponents.renderBreadcrumbs(wizardBreadcrumbs, stepNames[step]));
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
    const typesWithDescriptions = types.map(type => {
      let description = '';
      if (type === 'env') description = '(.env format)';
      else if (type === 'json') description = '(JSON format)';
      else if (type === 'kubernetes') description = '(Kubernetes Secret)';
      else if (type === 'aws-secrets-manager') {
        if (this.region) {
          description = `(AWS Secrets Manager - ${this.region})`;
        } else {
          description = '(AWS Secrets Manager - no region configured)';
        }
      }
      return { name: type, description };
    });
    
    const typesList = ListComponents.renderSelectableList(typesWithDescriptions, selectedIndex, {
      displayFunction: (item) => `${item.name} ${colorize(item.description, 'gray')}`
    });
    
    output.push(typesList);
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

  renderPaginatedSecretsList(secrets, selectedIndex, maxVisible, searchMode) {
    if (!secrets || secrets.length === 0) {
      return colorize('No secrets found', 'yellow');
    }

    const output = [];
    
    // Calculate pagination window
    const { startIndex, endIndex } = RenderUtils.calculatePaginationWindow(selectedIndex, secrets.length, maxVisible);
    
    // Add "more above" indicator if needed
    if (startIndex > 0) {
      output.push(colorize('  ⋮ (more above)', 'gray'));
    }
    
    // Render visible secrets with copy wizard styling
    for (let i = startIndex; i < endIndex; i++) {
      const secret = secrets[i];
      const isSelected = i === selectedIndex && !searchMode;
      const prefix = isSelected ? colorize('> ', 'green') : '  ';
      const secretColor = isSelected ? 'bright' : 'reset';
      
      if (secret.isNew) {
        const text = `${prefix}${colorize('[Create New Secret]', 'cyan')}`;
        output.push(isSelected ? colorize(text, 'green') : text);
      } else {
        const text = `${prefix}${colorize(secret.name, secretColor)}`;
        output.push(text);
      }
    }
    
    // Add "more below" indicator if needed
    if (endIndex < secrets.length) {
      output.push(colorize('  ⋮ (more below)', 'gray'));
    }
    
    return output.join('\n');
  }

  renderSecretSelection(output, state) {
    const { selectedIndex, secretSearchMode, secretQuery, filteredSecrets, outputNamespace, outputType, createNewSecret, outputName } = state;
    
    if (createNewSecret) {
      debugLogger.log('CopyWizard', 'Rendering create new secret', { outputName, typeOfOutputName: typeof outputName });
    }
    
    const title = outputType === 'aws-secrets-manager' 
      ? 'Select AWS Secret:' 
      : `Select Secret in namespace '${outputNamespace}':`;
    output.push(colorize(title, 'cyan'));
    
    if (createNewSecret) {
      // Inline text input mode
      output.push('');
      const secretTypeLabel = outputType === 'aws-secrets-manager' ? 'AWS secret' : 'secret';
      output.push(colorize(`Enter new ${secretTypeLabel} name:`, 'cyan'));
      output.push('');
      
      // Simple text input box
      const inputValue = (outputName === undefined || outputName === null) ? '' : String(outputName);
      const boxWidth = 40; // Total inner width
      
      let displayContent, contentLength;
      if (inputValue === '') {
        // Show placeholder based on type
        const placeholder = outputType === 'aws-secrets-manager' ? 'my-app-config' : 'my-app-secrets';
        displayContent = colorize(placeholder, 'gray');
        contentLength = placeholder.length; // Count placeholder length for padding
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
      // Normal secret list mode with pagination
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
        // Calculate how many lines we've used so far (including header)
        const usedLines = output.length + 3; // +3 for instructions at bottom
        
        // Calculate available height for the secret list
        const availableHeight = RenderUtils.calculateAvailableHeight(usedLines);
        
        // Use ListComponents for proper pagination with custom styling to match copy wizard
        const secretsList = this.renderPaginatedSecretsList(filteredSecrets, selectedIndex, availableHeight, secretSearchMode);
        
        output.push(secretsList);
      }
      
      output.push('');
      output.push('Use ↑↓/jk to navigate, Ctrl+U/D or Ctrl+B/F to page, / to search, Enter to select, Esc to go back');
    }
  }

  renderFileSelection(output, state) {
    const { selectedIndex, outputType, inlineTextInput, outputName, validationError } = state;
    
    if (outputType === 'kubernetes' && inlineTextInput) {
      // Inline text input for Kubernetes secret name
      this.renderInlineTextInput(
        output, 
        outputName, 
        'my-app-secrets', 
        'Enter Kubernetes secret name:'
      );
      
      // Show validation error if any
      if (validationError) {
        output.push('');
        output.push(colorize(`Error: ${validationError}`, 'red'));
      }
      
      output.push('');
      output.push('Enter to confirm, Esc to go back to file selection');
    } else if (outputType === 'kubernetes') {
      // Kubernetes secret name prompt (before entering inline input mode)
      output.push(colorize('Create Kubernetes Secret:', 'cyan'));
      output.push('');
      output.push('Press Enter to enter secret name, Esc to go back');
    } else if (inlineTextInput) {
      // Inline text input mode for filename
      const extension = outputType === 'json' ? '.json' : '.env';
      const defaultName = this.generateFileName(outputType);
      
      this.renderInlineTextInput(
        output, 
        outputName, 
        defaultName, 
        `Enter filename for ${outputType} file:`
      );
      
      output.push('');
      output.push('Enter to confirm, Esc to go back to file selection');
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
          const fileName = path.basename(file.path);
          output.push(`${prefix}${colorize(fileName, fileColor)}`);
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
    } else if (outputType === 'aws-secrets-manager') {
      output.push(`Target: AWS Secrets Manager`);
      output.push(`  Secret Name: ${colorize(outputName, 'bright')}`);
      output.push(`  Region: ${colorize(this.region || 'default', 'bright')}`);
      output.push('');
      output.push(colorize('⚠️  This will create or update the secret in AWS', 'yellow'));
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
    } else if (outputType === 'aws-secrets-manager') {
      output.push(`Successfully copied ${this.filteredKeys.length} keys to AWS secret:`);
      output.push(`  Secret: ${colorize(outputName, 'bright')}`);
      output.push(`  Region: ${colorize(this.region || 'default', 'bright')}`);
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
    output.push('Press Enter or Esc to go back and fix');
  }

  // Helper methods
  getOutputTypes() {
    // Include all storage types (allow copying to same type), sorted alphabetically
    return [...STORAGE_TYPES].sort();
  }

  // Shared inline text input rendering utility
  renderInlineTextInput(output, inputValue, placeholder, prompt = 'Enter text:', boxWidth = 40) {
    output.push('');
    output.push(colorize(prompt, 'cyan'));
    output.push('');
    
    // Handle display content
    let displayContent, contentLength;
    if (!inputValue || inputValue === '') {
      // Show placeholder
      displayContent = colorize(placeholder, 'gray');
      contentLength = placeholder.length; // Count placeholder length for padding
    } else {
      // Show actual input
      displayContent = inputValue;
      contentLength = inputValue.length;
    }
    
    // Calculate padding: box width minus content length minus cursor width (1)
    const padding = Math.max(0, boxWidth - contentLength - 1);
    const cursor = colorize('█', 'white');
    const spaces = ' '.repeat(padding);
    
    const inputDisplay = `┌${'─'.repeat(boxWidth)}┐\n│${displayContent}${cursor}${spaces}│\n└${'─'.repeat(boxWidth)}┘`;
    output.push(inputDisplay);
  }

  // Handle inline text input for filename
  handleInlineTextInput(keyStr, state) {
    const { outputName = '', outputType } = state;
    
    if (keyStr === '\u001b') { // Escape - go back to file selection
      this.setState({ 
        inlineTextInput: false,
        outputName: null
      });
      return true;
    } else if (keyStr === '\r') { // Enter - confirm filename
      if (outputName && outputName.trim()) {
        // Add extension if not present
        const extension = outputType === 'json' ? '.json' : '.env';
        let finalName = outputName.trim();
        if (!finalName.endsWith(extension)) {
          finalName += extension;
        }
        
        // Validate filename
        const invalidChars = /[<>:"/\\|?*]/;
        if (invalidChars.test(finalName)) {
          // Could add error display here, for now just ignore
          return true;
        }
        
        this.setState({ 
          outputName: finalName,
          step: 'confirm',
          inlineTextInput: false
        });
      }
      return true;
    } else if (keyStr === '\u007f' || keyStr === '\b') { // Backspace
      const newName = outputName.slice(0, -1);
      this.setState({ outputName: newName });
      return true;
    } else if (this.isPrintableKey(keyStr) && outputName.length < 100) {
      // Add character to filename
      this.setState({ outputName: outputName + keyStr });
      return true;
    }
    
    return false;
  }

  // Check if a key is printable (same as TextInputScreen)
  isPrintableKey(keyStr) {
    return keyStr.length === 1 && keyStr >= ' ' && keyStr <= '~';
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
        const kubernetes = require('../../providers/kubernetes');
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
        const { outputName, outputType } = state;
        if (outputName && outputName.trim()) {
          let isValid = false;
          
          if (outputType === 'aws-secrets-manager') {
            // AWS secret name validation (alphanumeric and /_+=.@- characters, 1-512 chars)
            const awsNameRegex = /^[a-zA-Z0-9\/_+=.@-]+$/;
            isValid = awsNameRegex.test(outputName.trim()) && outputName.length >= 1 && outputName.length <= 512;
          } else {
            // Kubernetes secret name validation
            const kubeNameRegex = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
            isValid = kubeNameRegex.test(outputName.trim()) && outputName.length <= 253;
          }
          
          if (isValid) {
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
        const { outputType } = state;
        const maxLength = outputType === 'aws-secrets-manager' ? 512 : 253;
        
        if (currentName.length < maxLength) {
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

  async navigateToNewSecret(secretName, namespace) {
    try {
      // Fetch the newly created secret data
      const { fetchSecret, parseSecretData } = require('../../utils/secrets');
      
      const fetchOptions = {
        inputType: 'kubernetes',
        inputName: secretName,
        namespace: namespace
      };
      
      const secretString = await fetchSecret(fetchOptions);
      const secretData = parseSecretData(secretString);
      
      if (typeof secretData !== 'object' || secretData === null) {
        throw new Error('Secret data is not in a valid key-value format');
      }
      
      // Create and push the key browser screen for the new secret
      const { TerminalManager } = require('../terminal-manager');
      const { KeyBrowserScreen } = require('./key-browser-screen');
      const terminalManager = TerminalManager.getInstance();
      
      // Pop the copy wizard first
      terminalManager.popScreen();
      
      const keyBrowserScreen = new KeyBrowserScreen({
        secretData,
        secretType: 'kubernetes',
        secretName: secretName,
        namespace: namespace,
        hasBackNavigation: true,
        hasEdit: true,
        breadcrumbs: [...this.config.breadcrumbs, secretName],
        initialShowValues: false
      });
      
      terminalManager.pushScreen(keyBrowserScreen);
      
    } catch (error) {
      // If we can't navigate to the secret, just show success message
      debugLogger.error('CopyWizard', 'Error navigating to new secret', error);
      this.setState({ 
        step: 'done',
        copySuccess: true
      });
    }
  }

  async navigateToNewFile(filePath, fileType) {
    try {
      // Fetch the newly created file data
      const { fetchSecret, parseSecretData } = require('../../utils/secrets');
      
      const fetchOptions = {
        inputType: fileType,
        inputName: filePath,
        path: '.' // Current directory
      };
      
      const fileString = await fetchSecret(fetchOptions);
      const fileData = parseSecretData(fileString);
      
      if (typeof fileData !== 'object' || fileData === null) {
        throw new Error('File data is not in a valid key-value format');
      }
      
      // Create and push the key browser screen for the new file
      const { TerminalManager } = require('../terminal-manager');
      const { KeyBrowserScreen } = require('./key-browser-screen');
      const terminalManager = TerminalManager.getInstance();
      
      // Pop the copy wizard first
      terminalManager.popScreen();
      
      const fileName = path.basename(filePath);
      const keyBrowserScreen = new KeyBrowserScreen({
        secretData: fileData,
        secretType: fileType,
        secretName: fileName,
        hasBackNavigation: true,
        hasEdit: true,
        breadcrumbs: [...this.config.breadcrumbs, fileName],
        initialShowValues: false
      });
      
      terminalManager.pushScreen(keyBrowserScreen);
      
    } catch (error) {
      // If we can't navigate to the file, just show success message
      debugLogger.error('CopyWizard', 'Error navigating to new file', error);
      this.setState({ 
        step: 'done',
        copySuccess: true
      });
    }
  }

  getFileOptions() {
    const { outputType } = this.state;
    const extension = outputType === 'json' ? '.json' : '.env';
    
    // Look for existing files of this type in current directory
    const cwd = process.cwd();
    const files = [];
    
    // Add "Create New" option first
    files.push({ isNew: true });
    
    try {
      // Find existing files with the appropriate extension
      const { listEnvFiles, listJsonFiles } = require('../../providers/files');
      
      let existingFiles = [];
      if (outputType === 'env') {
        existingFiles = listEnvFiles(cwd);
      } else if (outputType === 'json') {
        existingFiles = listJsonFiles(cwd);
      }
      
      // Add existing files to the options
      existingFiles.forEach(fileName => {
        files.push({ 
          path: path.join(cwd, fileName), 
          isNew: false 
        });
      });
    } catch (error) {
      // If we can't list files, just provide the create new option
      debugLogger.log('CopyWizard', 'Error listing files', error);
    }
    
    return files;
  }

  generateFileName(outputType) {
    const extension = outputType === 'json' ? '.json' : '.env';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    return `lowkey-export-${timestamp}${extension}`;
  }

  previousStep() {
    const { step, outputType, inlineTextInput, createNewSecret } = this.state;
    
    // Handle special cases first
    if (step === 'file' && inlineTextInput) {
      // Exit inline text input mode, stay on file step
      this.setState({ 
        inlineTextInput: false,
        outputName: null
      });
      return;
    }
    
    if (step === 'secret' && createNewSecret) {
      // Exit create new secret mode, stay on secret step
      this.setState({ 
        createNewSecret: false,
        outputName: null
      });
      return;
    }
    
    // Regular step navigation
    const stepMapping = {
      'type': 'preview',
      'namespace': 'type', 
      'secret': outputType === 'kubernetes' ? 'namespace' : 'type',
      'file': outputType === 'kubernetes' ? 'secret' : 
               outputType === 'aws-secrets-manager' ? 'secret' : 'type',
      'confirm': outputType === 'kubernetes' ? 'file' :
                 outputType === 'aws-secrets-manager' ? 'secret' : 'file',
      'error': 'type' // Error step should go back to type selection to fix the issue
    };
    
    const previousStep = stepMapping[step];
    
    if (previousStep) {
      // Reset state when going back
      const newState = { 
        step: previousStep, 
        selectedIndex: 0,
        inlineTextInput: false,
        createNewSecret: false
      };
      
      // Clear output name if going back far enough
      if (previousStep === 'preview' || previousStep === 'type') {
        newState.outputName = null;
        newState.outputNamespace = null;
        newState.outputType = null;
      }
      
      this.setState(newState);
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
      
      // Use unified command handler
      const copyOptions = {
        inputType: this.sourceType,
        inputName: this.sourceName,
        outputType: outputType,
        outputName: outputName,
        region: this.region,
        namespace: outputNamespace,
        stage: 'AWSCURRENT',
        autoYes: true,
        secretData: this.secretData, // Provide pre-fetched data
        filteredKeys: this.filteredKeys, // Use filtered keys for partial copying
        onProgress: (message) => {
          // Could show progress in UI if desired
          debugLogger.log('Copy progress:', message);
        }
      };

      const result = await CommandHandlers.copySecret(copyOptions);

      if (!result.success) {
        throw new Error(result.error);
      }

      // Navigate based on result type
      if (result.type === 'kubernetes-upload') {
        this.navigateToNewSecret(outputName, outputNamespace);
      } else if (result.type === 'file-output') {
        this.navigateToNewFile(outputName, outputType);
      } else if (result.type === 'aws-upload') {
        // For AWS uploads, we could navigate to the secret browser or show success
        this.setState({ 
          step: 'done',
          copySuccess: true,
          copyError: null
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
    const debugLogger = require('../../core/debug-logger');
    
    const { outputType } = this.state;
    const extension = outputType === 'json' ? '.json' : '.env';
    const defaultName = this.generateFileName(outputType);
    
    debugLogger.log('CopyWizard', 'promptForFileName called', { outputType, defaultName });
    
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
    
    debugLogger.log('CopyWizard', 'Pushing TextInputScreen for filename');
    // Push input screen
    terminalManager.pushScreen(inputScreen);
    
    // Wait for result
    debugLogger.log('CopyWizard', 'Waiting for TextInputScreen result...');
    const result = await inputScreen.run();
    debugLogger.log('CopyWizard', 'TextInputScreen filename result', result);
    
    // Handle the result structure - it comes wrapped in { action, data }
    const resultData = result.data || result;
    debugLogger.log('CopyWizard', 'Processed filename resultData', resultData);
    
    if (!resultData.cancelled && resultData.value) {
      debugLogger.log('CopyWizard', 'Setting filename state', { value: resultData.value });
      this.setState({ 
        outputName: resultData.value,
        step: 'confirm'
      });
    } else {
      debugLogger.log('CopyWizard', 'Filename input cancelled or no value');
    }
    // If cancelled, stay on file selection step (no state change needed)
  }
}

module.exports = { CopyWizardScreen };