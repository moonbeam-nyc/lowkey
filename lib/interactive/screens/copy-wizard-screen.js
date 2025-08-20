/**
 * Copy Wizard Screen (Component-based version)
 * 
 * This demonstrates how the complex multi-step copy wizard becomes much cleaner
 * with the declarative component system. Compare to the original copy-wizard-screen.js
 * 
 * The original file has 1600+ lines with lots of output.push() calls and terminal calculations.
 * This version focuses on business logic and component declarations.
 */

const { ComponentScreen } = require('./component-screen');
const { 
  Title, 
  Spacer, 
  SearchInput, 
  List, 
  TextInput,
  InstructionsFromOptions,
  ErrorText,
  SuccessText,
  Breadcrumbs,
  Text,
  LabeledValue,
  Box,
  Container,
  ProgressBar,
  Spinner
} = require('../component-system');
const debugLogger = require('../../core/debug-logger');

class CopyWizardScreen extends ComponentScreen {
  constructor(options) {
    super({
      id: 'copy-wizard',
      hasBackNavigation: false, // Handle ESC manually for step navigation
      breadcrumbs: options.breadcrumbs || [],
      initialState: {
        step: 'type', // type -> namespace -> secret -> file -> inputFilename -> final -> done
        selectedIndex: 0,
        searchMode: false,
        query: '',
        
        // Copy configuration
        outputType: null,
        outputName: null,
        outputNamespace: null,
        
        // Step-specific state
        filteredItems: [],
        secrets: [],
        namespaces: [],
        
        // UI state
        copyProgress: 0,
        copyError: null,
        copySuccess: false,
        
        // Text input state
        validationError: null,
        
        // Loading states
        loadingNamespaces: false,
        loadingSecrets: false,
        
        // Animation state for spinner
        spinnerFrame: 0
      }
    });

    // Options from parent
    this.secretData = options.secretData || {};
    this.filteredKeys = options.filteredKeys || Object.keys(this.secretData);
    this.sourceType = options.sourceType || null;
    this.sourceName = options.sourceName || null;
    this.region = options.region || null;
    this.namespace = options.namespace || null;
    this.context = options.context || null;
    
    // Spinner animation
    this.spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    this.spinnerInterval = null;
  }

  /**
   * Cleanup when screen is deactivated
   */
  cleanup() {
    this.stopSpinner();
    if (super.cleanup) {
      super.cleanup();
    }
  }

  /**
   * Start spinner animation
   */
  startSpinner() {
    if (this.spinnerInterval) {
      clearInterval(this.spinnerInterval);
    }
    
    this.spinnerInterval = setInterval(() => {
      this.setState(prevState => ({
        spinnerFrame: (prevState.spinnerFrame + 1) % this.spinnerFrames.length
      }));
    }, 120); // Update every 120ms for smooth animation
  }
  
  /**
   * Stop spinner animation
   */
  stopSpinner() {
    if (this.spinnerInterval) {
      clearInterval(this.spinnerInterval);
      this.spinnerInterval = null;
    }
  }

  /**
   * Set up key handlers for the copy wizard
   */
  setupKeyHandlers() {
    super.setupKeyHandlers();
    
    const handlers = this.createKeyHandlers()
      // Enter - advance step or select item
      .onEnter(() => {
        const { step, outputType, outputName } = this.state;
        
        debugLogger.log('CopyWizardScreen onEnter', 'Key handler called', { step, outputType, outputName });
        
        if (step === 'type') {
          this.selectOutputType();
        } else if (step === 'namespace') {
          this.selectNamespace();
        } else if (step === 'secret') {
          this.selectSecret();
        } else if (step === 'file') {
          debugLogger.log('CopyWizardScreen onEnter', 'Calling selectFile');
          this.selectFile();
        } else if (step === 'inputFilename') {
          debugLogger.log('CopyWizardScreen onEnter', 'Calling confirmFileName');
          this.confirmFileName();
        } else if (step === 'inputSecretName') {
          debugLogger.log('CopyWizardScreen onEnter', 'Calling confirmSecretName');
          this.confirmSecretName();
        } else if (step === 'final') {
          this.performCopy();
        } else if (step === 'done') {
          debugLogger.log('CopyWizardScreen onEnter', 'Copy completed, exiting');
          this.goBack();
        }
        return true;
      })
      
      // Navigation
      .onUpArrow(() => {
        if (!this.isInSearchMode() && !this.isInTextInput()) {
          this.navigateUp();
          return true;
        }
        return false; // Don't consume the key if we're in text input
      })
      
      .onDownArrow(() => {
        if (!this.isInSearchMode() && !this.isInTextInput()) {
          this.navigateDown();
          return true;
        }
        return false; // Don't consume the key if we're in text input
      })
      
      // j/k navigation (vim-style)
      .onKey('j', () => {
        if (!this.isInSearchMode() && !this.isInTextInput()) {
          this.navigateDown();
          return true;
        }
        return false; // Don't consume the key if we're in text input
      })
      
      .onKey('k', () => {
        if (!this.isInSearchMode() && !this.isInTextInput()) {
          this.navigateUp();
          return true;
        }
        return false; // Don't consume the key if we're in text input
      })
      
      // Page navigation
      .onKey('\u0002', () => { // Ctrl+B
        if (!this.isInSearchMode() && !this.isInTextInput()) {
          this.pageUp();
          return true;
        }
        return false; // Don't consume the key if we're in text input
      })
      
      .onKey('\u0006', () => { // Ctrl+F
        if (!this.isInSearchMode() && !this.isInTextInput()) {
          this.pageDown();
          return true;
        }
        return false; // Don't consume the key if we're in text input
      })
      
      // Text input handling
      .onBackspace(() => {
        if (this.isInTextInput()) {
          this.handleBackspaceInTextInput();
        }
        return true;
      })
      
      .onPrintable((key) => {
        const { step } = this.state;
        
        if (step === 'done') {
          debugLogger.log('CopyWizardScreen onPrintable', 'Any key pressed on done screen, exiting');
          this.goBack();
          return true;
        } else if (this.isInTextInput()) {
          this.handlePrintableInTextInput(key);
        }
        return true;
      })
      
      // Escape key handler
      .onEscape(() => {
        const { step, outputType } = this.state;
        debugLogger.log('CopyWizardScreen onEscape', 'Escape key pressed', { step, outputType });
        
        // Navigate backwards through the wizard steps
        if (step === 'done' || step === 'copying') {
          // From done/copying, can't go back - exit to parent
          this.goBack();
        } else if (step === 'final') {
          // From final confirmation, go back to file/secret selection
          if (outputType === 'kubernetes' || outputType === 'aws-secrets-manager') {
            this.setState({ step: 'secret', selectedIndex: 0 });
          } else {
            this.setState({ step: 'file', selectedIndex: 0 });
          }
        } else if (step === 'inputFilename') {
          // From filename input, go back to file selection
          this.setState({ step: 'file', selectedIndex: 0 });
        } else if (step === 'inputSecretName') {
          // From secret name input, go back to secret selection
          this.setState({ step: 'secret', selectedIndex: 0 });
        } else if (step === 'file') {
          // From file selection, go back to type selection
          this.setState({ step: 'type', selectedIndex: 0, outputType: null, outputName: null });
        } else if (step === 'secret') {
          // From secret selection, go back to namespace (for kubernetes) or type
          if (outputType === 'kubernetes') {
            this.setState({ step: 'namespace', selectedIndex: 0, outputName: null });
          } else {
            this.setState({ step: 'type', selectedIndex: 0, outputType: null, outputName: null });
          }
        } else if (step === 'namespace') {
          // From namespace selection, go back to type selection
          this.setState({ step: 'type', selectedIndex: 0, outputType: null, outputNamespace: null, outputName: null });
        } else if (step === 'type') {
          // From type selection (first step), exit to parent screen
          this.goBack();
        } else {
          // Fallback: exit to parent screen
          this.goBack();
        }
        return true;
      });
    
    this.keyManager.addHandler((key, state, context) => {
      return handlers.process(key, { 
        state: state, 
        setState: this.setState.bind(this),
        screen: this
      });
    });
  }

  /**
   * Single progressive copy wizard screen with explicit step-based rendering
   */
  getComponents(state) {
    const { step, outputType, outputName, outputNamespace } = state;
    
    // DEBUG: Log the state when rendering
    debugLogger.log('CopyWizardScreen getComponents', 'Current state', { step, outputType, outputName, outputNamespace });
    
    const components = [];
    
    // Breadcrumbs
    const baseBreadcrumbs = this.config.breadcrumbs || [];
    const copyBreadcrumbs = [...baseBreadcrumbs, 'Copy secrets'];
    components.push(Breadcrumbs(copyBreadcrumbs));
    
    // Title
    components.push(Title('Copy Secrets'));
    components.push(Spacer());
    
    // Always show keys to copy
    components.push(Text('Keys to copy:', 'cyan'));
    if (this.filteredKeys.length <= 5) {
      this.filteredKeys.forEach(key => {
        components.push(Text(`  • ${key}`, 'gray'));
      });
    } else {
      this.filteredKeys.slice(0, 3).forEach(key => {
        components.push(Text(`  • ${key}`, 'gray'));
      });
      components.push(Text(`  ... and ${this.filteredKeys.length - 3} more`, 'gray'));
    }
    components.push(Spacer());
    
    // Always show output format (completed or in progress)
    components.push(Text('Output format:', 'cyan'));
    if (step === 'type') {
      components.push(...this.getTypeSelectionComponents(state));
    } else if (outputType) {
      components.push(Text(`  ✓ ${outputType}`, 'green'));
    }
    components.push(Spacer());
    
    // Show namespace selection if needed (kubernetes only)
    if (outputType === 'kubernetes') {
      components.push(Text('Kubernetes namespace:', 'cyan'));
      if (step === 'namespace') {
        components.push(...this.getNamespaceSelectionComponents(state));
      } else if (outputNamespace) {
        components.push(Text(`  ✓ ${outputNamespace}`, 'green'));
      }
      components.push(Spacer());
    }
    
    // Show secret/file selection based on output type
    if (outputType === 'kubernetes') {
      if (outputNamespace || step === 'secret') {
        components.push(Text('Kubernetes secret:', 'cyan'));
        if (step === 'secret') {
          components.push(...this.getSecretSelectionComponents(state));
        } else if (step === 'inputSecretName') {
          components.push(...this.getSecretInputComponents(state));
        } else if (outputName) {
          components.push(Text(`  ✓ ${outputName}`, 'green'));
        }
        components.push(Spacer());
      }
    } else if (outputType === 'aws-secrets-manager') {
      components.push(Text('AWS secret:', 'cyan'));
      if (step === 'secret') {
        components.push(...this.getSecretSelectionComponents(state));
      } else if (step === 'inputSecretName') {
        components.push(...this.getSecretInputComponents(state));
      } else if (outputName) {
        components.push(Text(`  ✓ ${outputName}`, 'green'));
      }
      components.push(Spacer());
    } else if (outputType) {
      components.push(Text('Output file:', 'cyan'));
      if (step === 'file') {
        components.push(...this.getFileSelectionComponents(state));
      } else if (step === 'inputFilename') {
        components.push(...this.getFileInputComponents(state));
      } else if (outputName) {
        components.push(Text(`  ✓ ${outputName}`, 'green'));
      }
      components.push(Spacer());
    }
    
    // Show final confirmation
    if (step === 'final') {
      components.push(Text('Ready to copy!', 'yellow'));
      components.push(Text('Press Enter to start copy, Esc to cancel', 'gray'));
    }
    
    // Handle special states
    if (step === 'copying') {
      components.push(...this.getCopyingComponents(state));
    } else if (step === 'done') {
      components.push(...this.getDoneComponents(state));
    } else if (step === 'error') {
      components.push(...this.getErrorComponents(state));
    }
    
    return components;
  }

  // Helper methods for step logic
  isReadyToCopy() {
    const { outputType, outputName, outputNamespace } = this.state;
    return outputType && (outputName || (outputType === 'kubernetes' && outputNamespace && outputName));
  }

  selectOutputType() {
    const { selectedIndex } = this.state;
    const types = this.getOutputTypes();
    const selectedType = types[selectedIndex];
    
    if (selectedType === 'kubernetes') {
      // Set loading state and start spinner animation
      this.setState({ 
        outputType: selectedType,
        loadingNamespaces: true 
      });
      
      this.startSpinner();
      
      // Force a render with the loading state, then start async operation
      setTimeout(() => {
        this.loadKubernetesNamespaces();
      }, 100); // Small delay to show the loading indicator
    } else if (selectedType === 'aws-secrets-manager') {
      // For AWS Secrets Manager, load list of secrets
      this.setState({ 
        outputType: selectedType,
        loadingSecrets: true 
      });
      
      this.startSpinner();
      
      // Load AWS secrets list
      setTimeout(() => {
        this.loadAwsSecrets();
      }, 100);
    } else {
      // For file types (env, json)
      this.setState({ 
        outputType: selectedType,
        step: 'file' 
      });
    }
  }

  selectFile() {
    const { selectedIndex } = this.state;
    const files = this.getFileOptions();
    const selectedFile = files[selectedIndex];
    
    debugLogger.log('CopyWizardScreen selectFile', 'Method called', { selectedIndex, selectedFile, isNew: selectedFile?.isNew });
    
    if (selectedFile.isNew) {
      debugLogger.log('CopyWizardScreen selectFile', 'Moving to inputFilename step');
      this.setState({ 
        step: 'inputFilename',
        outputName: ''
      });
    } else {
      debugLogger.log('CopyWizardScreen selectFile', 'Setting outputName and moving to final', { outputName: selectedFile.name });
      this.setState({ 
        step: 'final',
        outputName: selectedFile.name 
      });
    }
  }

  confirmFileName() {
    const { outputName } = this.state;
    if (outputName && outputName.trim()) {
      debugLogger.log('CopyWizardScreen confirmFileName', 'Moving to final step', { outputName: outputName.trim() });
      this.setState({ 
        step: 'final',
        outputName: outputName.trim()
      });
    } else {
      this.setState({ validationError: 'Filename cannot be empty' });
    }
  }

  confirmSecretName() {
    const { outputName } = this.state;
    if (outputName && outputName.trim()) {
      debugLogger.log('CopyWizardScreen confirmSecretName', 'Moving to final step', { outputName: outputName.trim() });
      this.setState({ 
        step: 'final',
        outputName: outputName.trim()
      });
    } else {
      this.setState({ validationError: 'Secret name cannot be empty' });
    }
  }

  selectNamespace() {
    const { selectedIndex, filteredNamespaces } = this.state;
    const selectedNamespace = filteredNamespaces[selectedIndex];
    
    this.setState({ 
      outputNamespace: selectedNamespace,
      loadingSecrets: true
    });
    
    this.startSpinner();
    
    // Force a render with the loading state, then start async operation
    setTimeout(() => {
      this.loadKubernetesSecrets(selectedNamespace);
    }, 100); // Small delay to show the loading indicator
  }

  selectSecret() {
    const { selectedIndex, filteredSecrets } = this.state;
    const selectedSecret = filteredSecrets[selectedIndex];
    
    if (selectedSecret.isNew) {
      this.setState({ 
        step: 'inputSecretName',
        outputName: ''
      });
    } else {
      this.setState({ 
        step: 'final',
        outputName: selectedSecret.name 
      });
    }
  }

  async loadKubernetesNamespaces() {
    try {
      const kubernetes = require('../../providers/kubernetes');
      const namespaces = await kubernetes.listNamespaces();
      
      this.stopSpinner();
      this.setState({ 
        namespaces,
        filteredNamespaces: namespaces,
        step: 'namespace',
        loadingNamespaces: false
      });
    } catch (error) {
      this.stopSpinner();
      this.setState({ 
        copyError: `Failed to load namespaces: ${error.message}`,
        step: 'error',
        loadingNamespaces: false
      });
    }
  }

  async loadKubernetesSecrets(namespace) {
    try {
      const kubernetes = require('../../providers/kubernetes');
      const secretsList = await kubernetes.listSecrets(namespace);
      
      const secretOptions = [
        { name: '[Create New Secret]', isNew: true },
        ...secretsList.map(secret => ({ 
          name: secret.name || secret, 
          isNew: false 
        }))
      ];
      
      this.stopSpinner();
      this.setState({ 
        secrets: secretOptions,
        filteredSecrets: secretOptions,
        step: 'secret',
        loadingSecrets: false
      });
    } catch (error) {
      this.stopSpinner();
      this.setState({ 
        copyError: `Failed to load secrets: ${error.message}`,
        step: 'error',
        loadingSecrets: false
      });
    }
  }

  async loadAwsSecrets() {
    try {
      const { listAwsSecrets } = require('../../providers/aws');
      const secretsList = await listAwsSecrets(this.region);
      
      const secretOptions = [
        { name: '[Create New Secret]', isNew: true },
        ...secretsList.map(secret => ({ 
          name: secret.Name || secret, 
          isNew: false 
        }))
      ];
      
      this.stopSpinner();
      this.setState({ 
        secrets: secretOptions,
        filteredSecrets: secretOptions,
        step: 'secret',
        loadingSecrets: false
      });
    } catch (error) {
      this.stopSpinner();
      this.setState({ 
        copyError: `Failed to load AWS secrets: ${error.message}`,
        step: 'error',
        loadingSecrets: false
      });
    }
  }

  async performCopy() {
    try {
      this.setState({ step: 'copying' });
      
      const { outputType, outputName, outputNamespace } = this.state;
      
      // Build copy command options
      const copyOptions = {
        inputType: this.sourceType,
        inputName: this.sourceName,
        outputType: outputType,
        outputName: outputName,
        region: this.region,
        namespace: this.namespace,
        outputNamespace: outputNamespace,
        autoYes: true // Skip confirmation prompts
      };
      
      debugLogger.log('CopyWizardScreen performCopy', 'Starting copy operation', copyOptions);
      
      // Use the actual copy command handler
      const { handleCopyCommand } = require('../../../commands/copy');
      await handleCopyCommand(copyOptions);
      
      debugLogger.log('CopyWizardScreen performCopy', 'Copy completed successfully');
      
      // Navigate to the copied destination
      await this.navigateToDestination(outputType, outputName, outputNamespace);
    } catch (error) {
      debugLogger.log('CopyWizardScreen performCopy', 'Copy failed', { error: error.message, stack: error.stack });
      this.setState({ 
        copyError: error.message,
        step: 'error'
      });
    }
  }

  handleBackspaceInTextInput() {
    const currentName = this.state.outputName || '';
    this.setState({
      outputName: currentName.slice(0, -1),
      validationError: null
    });
  }

  handlePrintableInTextInput(key) {
    const char = key.toString();
    this.setState({ 
      outputName: (this.state.outputName || '') + char,
      validationError: null
    });
  }

  getTypeSelectionComponents(state) {
    const { selectedIndex, loadingNamespaces, spinnerFrame } = state;
    const types = this.getOutputTypes();
    const typesWithDescriptions = types.map((type, index) => {
      let description = '';
      if (type === 'env') description = '(.env format)';
      else if (type === 'json') description = '(JSON format)';
      else if (type === 'kubernetes') description = '(Kubernetes Secret)';
      else if (type === 'aws-secrets-manager') {
        description = this.region 
          ? `(AWS Secrets Manager - ${this.region})`
          : '(AWS Secrets Manager - no region configured)';
      }
      
      // Add loading indicator if this item is selected and loading
      const isSelected = index === selectedIndex;
      const isLoading = (type === 'kubernetes' && loadingNamespaces && isSelected);
      
      return { 
        name: type, 
        description,
        isLoading
      };
    });

    return [
      List(typesWithDescriptions, selectedIndex, {
        displayFunction: (item) => {
          const baseText = `${item.name} ${item.description}`;
          if (item.isLoading) {
            const currentSpinner = this.spinnerFrames[spinnerFrame];
            return baseText + ' ' + currentSpinner;
          }
          return baseText;
        },
        paginate: true
      })
    ];
  }

  getNamespaceSelectionComponents(state) {
    const { selectedIndex, query, filteredNamespaces, loadingSecrets, spinnerFrame } = state;

    const components = [];
    
    // Search input if active
    if (query) {
      components.push(SearchInput(query, true, 'Search namespaces...'));
      components.push(Spacer());
    }
    
    // Add loading indicators to namespaces
    const namespacesWithLoading = filteredNamespaces.map((namespace, index) => {
      const isSelected = index === selectedIndex;
      const isLoading = loadingSecrets && isSelected;
      
      return {
        name: namespace,
        isLoading
      };
    });
    
    return [
      ...components,
      List(namespacesWithLoading, selectedIndex, {
        searchQuery: query,
        paginate: true,
        emptyMessage: 'No namespaces found',
        displayFunction: (item) => {
          if (item.isLoading) {
            const currentSpinner = this.spinnerFrames[spinnerFrame];
            return item.name + ' ' + currentSpinner;
          }
          return item.name;
        }
      })
    ];
  }

  getFileSelectionComponents(state) {
    const { selectedIndex } = state;
    const files = this.getFileOptions();
    
    return [
      List(files, selectedIndex, {
        paginate: true,
        emptyMessage: 'No files available',
        displayFunction: (file) => file.name
      })
    ];
  }

  getFileInputComponents(state) {
    const { outputName = '', validationError } = state;
    
    const components = [];
    
    components.push(Text('Enter filename:', 'gray'));
    
    // Text input using TextInput component
    components.push(TextInput(outputName, {
      placeholder: 'filename.env',
      showCursor: true,
      boxed: true,
      error: validationError
    }));
    
    if (validationError) {
      components.push(Text(validationError, 'red'));
    }
    
    components.push(Spacer());
    components.push(Text('Enter to confirm, Esc to go back', 'gray'));
    
    return components;
  }

  getSecretSelectionComponents(state) {
    const { selectedIndex, secretQuery, filteredSecrets } = state;

    const components = [];
    
    // Search input if active
    if (secretQuery) {
      components.push(SearchInput(secretQuery, true, 'Search secrets...'));
      components.push(Spacer());
    }
    
    return [
      ...components,
      List(filteredSecrets, selectedIndex, {
        searchQuery: secretQuery,
        paginate: true,
        displayFunction: (secret) => {
          if (secret.isNew) {
            return '[Create New Secret]';
          }
          return secret.name;
        },
        emptyMessage: 'No secrets found'
      })
    ];
  }

  getSecretInputComponents(state) {
    const { outputName = '', validationError } = state;
    
    const components = [];
    
    components.push(Text('Enter secret name:', 'gray'));
    
    // Text input using TextInput component
    components.push(TextInput(outputName, {
      placeholder: 'my-app-secrets',
      showCursor: true,
      boxed: true,
      error: validationError
    }));
    
    if (validationError) {
      components.push(Text(validationError, 'red'));
    }
    
    components.push(Spacer());
    components.push(Text('Enter to confirm, Esc to go back', 'gray'));
    
    return components;
  }

  // Preserve original methods that are still used
  getTypeComponents(state) {
    const { selectedIndex, filteredItems } = state;
    
    const types = this.getOutputTypes();
    const typesWithDescriptions = types.map(type => {
      let description = '';
      if (type === 'env') description = '(.env format)';
      else if (type === 'json') description = '(JSON format)';
      else if (type === 'kubernetes') description = '(Kubernetes Secret)';
      else if (type === 'aws-secrets-manager') {
        description = this.region 
          ? `(AWS Secrets Manager - ${this.region})`
          : '(AWS Secrets Manager - no region configured)';
      }
      return { name: type, description };
    });
    
    return [
      Title('Select Output Format:'),
      Spacer(),
      List(typesWithDescriptions, selectedIndex, {
        displayFunction: (item) => `${item.name} ${Text(item.description, 'gray').props.content}`,
        paginate: true
      }),
      Spacer(),
      InstructionsFromOptions({
        hasBackNavigation: true
      })
    ];
  }

  getNamespaceComponents(state) {
    const { selectedIndex, searchMode, query, filteredNamespaces } = state;
    
    const components = [];
    components.push(Title('Select Kubernetes Namespace:'));
    components.push(Spacer());
    
    // Only show search input if search is active or has query
    if (searchMode || query) {
      components.push(SearchInput(query, searchMode, 'Type to search namespaces...'));
      components.push(Spacer());
    }
    
    return [
      ...components,
      List(filteredNamespaces, selectedIndex, {
        searchQuery: query,
        paginate: true,
        emptyMessage: 'No namespaces found'
      }),
      Spacer(),
      InstructionsFromOptions({
        hasSearch: true,
        hasBackNavigation: true
      })
    ];
  }

  getSecretComponents(state) {
    const { selectedIndex, secretSearchMode, secretQuery, filteredSecrets, outputNamespace, outputType } = state;
    
    // Show current selections
    const components = [
      Text('Current Selections:', 'cyan')
    ];
    
    if (outputType) {
      components.push(LabeledValue('Output Type', outputType));
    }
    
    components.push(Spacer());
    
    const title = outputType === 'aws-secrets-manager' 
      ? 'Select AWS Secret:' 
      : `Select Secret in namespace '${outputNamespace}':`;
    
    components.push(Title(title));
    components.push(Spacer());
    
    // Only show search input if search is active or has query
    if (secretSearchMode || secretQuery) {
      components.push(SearchInput(secretQuery, secretSearchMode, 'Type to search secrets...'));
      components.push(Spacer());
    }
    
    components.push(List(filteredSecrets, selectedIndex, {
      searchQuery: secretQuery,
      paginate: true,
      displayFunction: (secret) => {
        if (secret.isNew) {
          return Text('[Create New Secret]', 'cyan').props.content;
        }
        return secret.name;
      },
      emptyMessage: 'No secrets found'
    }));
    
    components.push(Spacer());
    components.push(InstructionsFromOptions({
      hasSearch: true,
      hasPageNavigation: true,
      hasBackNavigation: true
    }));
    
    return components;
  }

  getFileComponents(state) {
    const { outputType, inlineTextInput, outputName, validationError } = state;
    
    if (outputType === 'kubernetes' && inlineTextInput) {
      // Inline text input for Kubernetes secret name
      return [
        Title('Enter Kubernetes secret name:'),
        Spacer(),
        TextInput(outputName || '', {
          placeholder: 'my-app-secrets',
          error: validationError
        }),
        Spacer(),
        Text('Enter to confirm, Esc to go back', 'gray')
      ];
    }
    
    // File selection for other types
    const files = this.getFileOptions();
    
    return [
      Title('Select output file:'),
      Spacer(),
      List(files, state.selectedIndex, {
        paginate: true,
        emptyMessage: 'No files available',
        displayFunction: (file) => file.name
      }),
      Spacer(),
      InstructionsFromOptions({
        hasBackNavigation: true
      })
    ];
  }

  getConfirmComponents(state) {
    const { outputType, outputName, outputNamespace } = state;
    
    // Build source info
    const sourceInfo = this.sourceType && this.sourceName 
      ? `${this.sourceType}:${this.sourceName}`
      : 'Unknown';
    
    // Build destination info
    let destInfo = outputType || 'Unknown';
    if (outputNamespace) {
      destInfo += `:${outputNamespace}`;
    }
    if (outputName) {
      destInfo += outputNamespace ? `/${outputName}` : `:${outputName}`;
    }
    
    const components = [
      Title('Confirm Copy Operation'),
      Spacer(),
      Text(`${sourceInfo} → ${destInfo} (${this.filteredKeys.length} keys)`),
      Spacer(),
      Text('Continue with this copy operation?', 'yellow'),
      Spacer(),
      Text('Press Y to confirm, N to go back, Esc to cancel', 'gray')
    ];
    
    return components;
  }

  getCopyingComponents(state) {
    return [
      Title('Copying Secrets...'),
      Spacer(),
      Text('Please wait while secrets are copied.', 'gray')
    ];
  }

  getDoneComponents(state) {
    const { outputType, outputName } = state;
    
    return [
      SuccessText('Copy completed successfully!'),
      Spacer(),
      Text(`Copied to: ${outputName}`, 'cyan'),
      Text(`Keys copied: ${this.filteredKeys.length}`, 'cyan'),
      Spacer(),
      Text('Press any key to exit', 'gray')
    ];
  }

  getErrorComponents(state) {
    const { copyError } = state;
    
    return [
      ErrorText('Copy failed'),
      Spacer(),
      Text(copyError || 'Unknown error occurred', 'red'),
      Spacer(),
      Text('Press Esc to go back, any other key to retry', 'gray')
    ];
  }

  /**
   * Helper methods for state management
   */
  
  isInTextInput() {
    return this.state.step === 'inputFilename' || this.state.step === 'inputSecretName';
  }
  
  isInSearchMode() {
    const { step, searchMode, secretSearchMode } = this.state;
    return (step === 'namespace' && searchMode) || 
           (step === 'secret' && secretSearchMode);
  }
  
  navigateUp() {
    const { selectedIndex } = this.state;
    const itemCount = this.getItemCount();
    const newIndex = Math.max(0, selectedIndex - 1);
    this.setState({ selectedIndex: newIndex });
  }
  
  navigateDown() {
    const { selectedIndex } = this.state;
    const itemCount = this.getItemCount();
    const newIndex = Math.min(itemCount - 1, selectedIndex + 1);
    this.setState({ selectedIndex: newIndex });
  }
  
  pageUp() {
    const { selectedIndex } = this.state;
    const itemCount = this.getItemCount();
    const newIndex = Math.max(0, selectedIndex - 10);
    this.setState({ selectedIndex: newIndex });
  }
  
  pageDown() {
    const { selectedIndex } = this.state;
    const itemCount = this.getItemCount();
    const newIndex = Math.min(itemCount - 1, selectedIndex + 10);
    this.setState({ selectedIndex: newIndex });
  }
  
  getItemCount() {
    const { step } = this.state;
    switch (step) {
      case 'type':
        return this.getOutputTypes().length;
      case 'namespace':
        return this.state.filteredNamespaces ? this.state.filteredNamespaces.length : 0;
      case 'secret':
        return this.state.filteredSecrets ? this.state.filteredSecrets.length : 0;
      case 'file':
        return this.getFileOptions().length;
      default:
        return 0;
    }
  }
  
  /**
   * Utility methods - keeping these from the old implementation since they're still used
   */
  
  getOutputTypes() {
    const types = ['env', 'json'];
    
    if (this.region) {
      types.push('aws-secrets-manager');
    }
    
    types.push('kubernetes');
    
    return types;
  }
  
  getFileOptions() {
    const { outputType } = this.state;
    const fs = require('fs');
    const path = require('path');
    
    // Start with "Create New File" option
    const options = [
      { name: '[Create New File]', isNew: true }
    ];
    
    try {
      // Get current working directory (or use the path option if provided)
      const currentDir = this.context?.path || process.cwd();
      
      // Read directory contents
      const files = fs.readdirSync(currentDir);
      
      // Filter files based on output type
      let filteredFiles = [];
      if (outputType === 'env') {
        filteredFiles = files.filter(file => file.endsWith('.env'));
      } else if (outputType === 'json') {
        filteredFiles = files.filter(file => file.endsWith('.json'));
      }
      
      // Add existing files to options
      filteredFiles.forEach(file => {
        options.push({ name: file, isNew: false });
      });
      
    } catch (error) {
      debugLogger.log('CopyWizardScreen getFileOptions', 'Error reading directory', { error: error.message });
      // If there's an error reading the directory, just return the "Create New File" option
    }
    
    return options;
  }
  
  handleBackspaceInTextInput() {
    const currentName = this.state.outputName || '';
    this.setState({ 
      outputName: currentName.slice(0, -1),
      validationError: null
    });
  }
  
  handlePrintableInTextInput(key) {
    const char = key.toString();
    this.setState({ 
      outputName: (this.state.outputName || '') + char,
      validationError: null
    });
  }
  
  async navigateToDestination(outputType, outputName, outputNamespace) {
    try {
      debugLogger.log('CopyWizardScreen navigateToDestination', 'Navigating to copied destination', {
        outputType, outputName, outputNamespace
      });
      
      // Import the key browser screen
      const { KeyBrowserScreen } = require('./key-browser-screen');
      
      // Build new breadcrumbs - extend current breadcrumbs with the new destination
      const currentBreadcrumbs = this.config.breadcrumbs || [];
      let newBreadcrumbs;
      
      if (outputType === 'kubernetes') {
        newBreadcrumbs = [...currentBreadcrumbs, 'kubernetes', outputNamespace, outputName];
      } else {
        newBreadcrumbs = [...currentBreadcrumbs, outputType, outputName];
      }
      
      // Create the key browser screen for the copied destination
      const keyBrowserScreen = new KeyBrowserScreen({
        secretType: outputType,
        secretName: outputName,
        namespace: outputNamespace,
        region: this.region,
        breadcrumbs: newBreadcrumbs,
        context: this.context
      });
      
      // Get the terminal manager and replace the current copy wizard screen with the new key browser
      const { TerminalManager } = require('../terminal-manager');
      const terminalManager = TerminalManager.getInstance();
      
      // Replace the copy wizard with the key browser screen
      terminalManager.replaceScreen(keyBrowserScreen);
      
      debugLogger.log('CopyWizardScreen navigateToDestination', 'Successfully navigated to destination');
      
    } catch (error) {
      debugLogger.log('CopyWizardScreen navigateToDestination', 'Failed to navigate to destination', {
        error: error.message, stack: error.stack
      });
      
      // Fall back to showing success message if navigation fails
      this.setState({ step: 'done' });
    }
  }
}

module.exports = { CopyWizardScreen };