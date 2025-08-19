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
  ProgressBar
} = require('../component-system');

class CopyWizardScreen extends ComponentScreen {
  constructor(options) {
    super({
      id: 'copy-wizard',
      hasBackNavigation: false, // Handle ESC manually for step navigation
      initialState: {
        step: 'preview', // preview -> type -> namespace -> secret -> file -> confirm -> copying -> done
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
        inlineTextInput: false,
        validationError: null
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
  }

  /**
   * Declare components based on current step
   * This replaces the massive renderWizard() method
   */
  getComponents(state) {
    const { step } = state;
    
    const components = [];
    
    // Breadcrumbs based on step
    const stepNames = {
      'preview': 'Preview',
      'type': 'Select Type', 
      'namespace': 'Select Namespace',
      'secret': 'Select Secret',
      'file': 'Select File',
      'confirm': 'Confirm',
      'copying': 'Copying',
      'done': 'Complete',
      'error': 'Error'
    };
    
    components.push(Breadcrumbs(['Copy secrets'], stepNames[step]));
    components.push(Spacer());
    
    // Render step-specific content
    switch (step) {
      case 'preview':
        components.push(...this.getPreviewComponents(state));
        break;
      case 'type':
        components.push(...this.getTypeComponents(state));
        break;
      case 'namespace':
        components.push(...this.getNamespaceComponents(state));
        break;
      case 'secret':
        components.push(...this.getSecretComponents(state));
        break;
      case 'file':
        components.push(...this.getFileComponents(state));
        break;
      case 'confirm':
        components.push(...this.getConfirmComponents(state));
        break;
      case 'copying':
        components.push(...this.getCopyingComponents(state));
        break;
      case 'done':
        components.push(...this.getDoneComponents(state));
        break;
      case 'error':
        components.push(...this.getErrorComponents(state));
        break;
    }
    
    return components;
  }

  getPreviewComponents(state) {
    const components = [];
    
    // Show keys to be copied
    components.push(Title(`Keys to Copy (${this.filteredKeys.length}):`));
    components.push(Spacer());
    
    // Show keys in a compact format
    if (this.filteredKeys.length <= 10) {
      this.filteredKeys.forEach(key => {
        components.push(Text(`  • ${key}`));
      });
    } else {
      // Show first few keys, then count
      this.filteredKeys.slice(0, 5).forEach(key => {
        components.push(Text(`  • ${key}`));
      });
      components.push(Text(`  ... and ${this.filteredKeys.length - 5} more`));
    }
    
    components.push(Spacer());
    components.push(Text('Ready to copy these secrets?', 'cyan'));
    components.push(Spacer());
    components.push(Text('Press Enter to continue, Esc to cancel', 'gray'));
    
    return components;
  }

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
        emptyMessage: 'No files available'
      }),
      Spacer(),
      InstructionsFromOptions({
        hasBackNavigation: true
      })
    ];
  }

  getConfirmComponents(state) {
    const { outputType, outputName, outputNamespace } = state;
    
    const components = [
      Title('Confirm Copy Operation'),
      Spacer(),
      Text('Source:', 'cyan')
    ];
    
    if (this.sourceType && this.sourceName) {
      components.push(LabeledValue('Type', this.sourceType));
      components.push(LabeledValue('Name', this.sourceName));
    }
    
    components.push(Spacer());
    components.push(Text('Destination:', 'cyan'));
    components.push(LabeledValue('Type', outputType));
    
    if (outputName) {
      components.push(LabeledValue('Name', outputName));
    }
    
    if (outputNamespace) {
      components.push(LabeledValue('Namespace', outputNamespace));
    }
    
    components.push(Spacer());
    components.push(LabeledValue('Keys', `${this.filteredKeys.length} keys`));
    
    components.push(Spacer());
    components.push(Text('Continue with this copy operation?', 'yellow'));
    components.push(Spacer());
    components.push(Text('Press Y to confirm, N to go back, Esc to cancel', 'gray'));
    
    return components;
  }

  getCopyingComponents(state) {
    const { copyProgress } = state;
    
    return [
      Title('Copying Secrets...'),
      Spacer(),
      ProgressBar(copyProgress, 100, 50),
      Spacer(),
      Text('Please wait while secrets are copied.', 'gray')
    ];
  }

  getDoneComponents(state) {
    const { outputType, outputName } = state;
    
    return [
      SuccessText('Copy completed successfully!'),
      Spacer(),
      LabeledValue('Copied to', `${outputType}:${outputName}`),
      LabeledValue('Keys copied', `${this.filteredKeys.length}`),
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
   * Set up key handlers for all steps
   * Much cleaner than the original nested switch statements
   */
  setupKeyHandlers() {
    super.setupKeyHandlers();
    
    const handlers = this.createKeyHandlers()
      .onEscape(() => {
        const { step } = this.state;
        if (step === 'preview' || step === 'done') {
          this.goBack();
        } else {
          this.previousStep();
        }
        return true;
      })
      
      .onKey('\u0003', () => { // Ctrl+C
        process.exit(0);
      })
      
      .onEnter(() => {
        return this.handleEnterForCurrentStep();
      })
      
      // Navigation keys (when not in search mode)
      .onUpArrow(() => {
        if (!this.isInSearchMode()) {
          this.navigateUp();
        }
        return true;
      })
      
      .onDownArrow(() => {
        if (!this.isInSearchMode()) {
          this.navigateDown();
        }
        return true;
      })
      
      .onKey('j', () => {
        if (!this.isInSearchMode()) {
          this.navigateDown();
        }
        return true;
      })
      
      .onKey('k', () => {
        if (!this.isInSearchMode()) {
          this.navigateUp();
        }
        return true;
      })
      
      // Page navigation
      .onKey('\u0015', () => { // Ctrl+U
        if (!this.isInSearchMode()) {
          this.pageUp();
        }
        return true;
      })
      
      .onKey('\u0004', () => { // Ctrl+D
        if (!this.isInSearchMode()) {
          this.pageDown();
        }
        return true;
      })
      
      // Search
      .onKey('/', () => {
        if (this.canSearch()) {
          this.enterSearchMode();
        }
        return true;
      })
      
      .onBackspace(() => {
        if (this.isInSearchMode()) {
          this.handleBackspaceInSearch();
        } else if (this.isInTextInput()) {
          this.handleBackspaceInTextInput();
        }
        return true;
      })
      
      .onPrintable((key) => {
        if (this.isInSearchMode()) {
          this.handlePrintableInSearch(key);
        } else if (this.isInTextInput()) {
          this.handlePrintableInTextInput(key);
        }
        return true;
      })
      
      // Confirmation keys
      .onKey('y', () => {
        if (this.state.step === 'confirm') {
          this.performCopy();
        }
        return true;
      })
      
      .onKey('n', () => {
        if (this.state.step === 'confirm') {
          this.previousStep();
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
   * Step navigation helpers
   */
  
  handleEnterForCurrentStep() {
    const { step } = this.state;
    
    switch (step) {
      case 'preview':
        this.setState({ step: 'type' });
        break;
      case 'type':
        this.selectOutputType();
        break;
      case 'namespace':
        this.selectNamespace();
        break;
      case 'secret':
        this.selectSecret();
        break;
      case 'file':
        this.selectFile();
        break;
      case 'confirm':
        this.performCopy();
        break;
      case 'done':
      case 'error':
        this.goBack();
        break;
    }
    
    return true;
  }
  
  previousStep() {
    const { step, outputType } = this.state;
    
    const stepMapping = {
      'type': 'preview',
      'namespace': 'type', 
      'secret': outputType === 'kubernetes' ? 'namespace' : 'type',
      'file': outputType === 'kubernetes' ? 'secret' : 
               outputType === 'aws-secrets-manager' ? 'secret' : 'type',
      'confirm': outputType === 'kubernetes' ? 'file' :
                 outputType === 'aws-secrets-manager' ? 'secret' : 'file',
      'error': 'type'
    };
    
    const previousStep = stepMapping[step];
    
    if (previousStep) {
      const newState = { 
        step: previousStep, 
        selectedIndex: 0,
        inlineTextInput: false
      };
      
      if (previousStep === 'preview' || previousStep === 'type') {
        newState.outputName = null;
        newState.outputNamespace = null;
        newState.outputType = null;
      }
      
      this.setState(newState);
    }
  }

  /**
   * Business logic methods - much cleaner without rendering concerns
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
    // Simplified - in real implementation would scan directory
    return [
      { name: '[Create New File]', isNew: true },
      { name: 'existing-file.env' },
      { name: 'config.json' }
    ];
  }
  
  selectOutputType() {
    const { selectedIndex } = this.state;
    const types = this.getOutputTypes();
    const selectedType = types[selectedIndex];
    
    this.setState({ outputType: selectedType });
    
    if (selectedType === 'kubernetes') {
      this.loadKubernetesNamespaces();
    } else {
      this.setState({ step: 'file' });
    }
  }
  
  async loadKubernetesNamespaces() {
    try {
      const kubernetes = require('../../providers/kubernetes');
      const namespaces = await kubernetes.listNamespaces();
      
      this.setState({ 
        namespaces,
        filteredNamespaces: namespaces,
        step: 'namespace'
      });
    } catch (error) {
      this.setState({ 
        copyError: `Failed to load namespaces: ${error.message}`,
        step: 'error'
      });
    }
  }
  
  selectNamespace() {
    const { selectedIndex, filteredNamespaces } = this.state;
    const selectedNamespace = filteredNamespaces[selectedIndex];
    
    this.setState({ outputNamespace: selectedNamespace });
    this.loadKubernetesSecrets(selectedNamespace);
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
      
      this.setState({ 
        secrets: secretOptions,
        filteredSecrets: secretOptions,
        step: 'secret'
      });
    } catch (error) {
      this.setState({ 
        copyError: `Failed to list secrets in namespace ${namespace}: ${error.message}`,
        step: 'error'
      });
    }
  }
  
  selectSecret() {
    const { selectedIndex, filteredSecrets } = this.state;
    const selected = filteredSecrets[selectedIndex];
    
    if (selected.isNew) {
      this.setState({ 
        step: 'file',
        inlineTextInput: true,
        outputName: ''
      });
    } else {
      this.setState({ 
        outputName: selected.name,
        step: 'confirm'
      });
    }
  }
  
  selectFile() {
    const { inlineTextInput, outputName } = this.state;
    
    if (inlineTextInput) {
      // Validate and confirm
      if (outputName && outputName.trim()) {
        this.setState({ step: 'confirm' });
      }
    } else {
      // File selection logic
      this.setState({ step: 'confirm' });
    }
  }
  
  async performCopy() {
    this.setState({ step: 'copying', copyProgress: 0 });
    
    try {
      // Simulate copy progress
      for (let i = 0; i <= 100; i += 20) {
        this.setState({ copyProgress: i });
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      // Actual copy logic would go here
      
      this.setState({ step: 'done' });
    } catch (error) {
      this.setState({ 
        copyError: error.message,
        step: 'error'
      });
    }
  }
  
  /**
   * Helper methods for state management
   */
  
  isInSearchMode() {
    const { step, searchMode, secretSearchMode } = this.state;
    return (step === 'namespace' && searchMode) || 
           (step === 'secret' && secretSearchMode);
  }
  
  isInTextInput() {
    return this.state.step === 'file' && this.state.inlineTextInput;
  }
  
  canSearch() {
    return ['namespace', 'secret'].includes(this.state.step);
  }
  
  enterSearchMode() {
    const { step } = this.state;
    if (step === 'namespace') {
      this.setState({ searchMode: true });
    } else if (step === 'secret') {
      this.setState({ secretSearchMode: true });
    }
  }
  
  // Navigation helpers
  navigateUp() {
    const { selectedIndex, filteredItems = [] } = this.state;
    const newIndex = this.navigateToIndex(selectedIndex - 1, filteredItems.length || this.getItemCount());
    this.setState({ selectedIndex: newIndex });
  }
  
  navigateDown() {
    const { selectedIndex, filteredItems = [] } = this.state;
    const newIndex = this.navigateToIndex(selectedIndex + 1, filteredItems.length || this.getItemCount());
    this.setState({ selectedIndex: newIndex });
  }
  
  getItemCount() {
    const { step } = this.state;
    switch (step) {
      case 'type':
        return this.getOutputTypes().length;
      case 'namespace':
        return this.state.filteredNamespaces.length;
      case 'secret':
        return this.state.filteredSecrets.length;
      case 'file':
        return this.getFileOptions().length;
      default:
        return 0;
    }
  }
  
  handleBackspaceInSearch() {
    const { step } = this.state;
    if (step === 'namespace') {
      const newQuery = this.state.query.slice(0, -1);
      const filtered = this.fuzzySearch(newQuery, this.state.namespaces);
      this.setState({ 
        query: newQuery,
        filteredNamespaces: filtered,
        selectedIndex: 0
      });
    } else if (step === 'secret') {
      const newQuery = this.state.secretQuery.slice(0, -1);
      const filtered = this.fuzzySearch(newQuery, this.state.secrets, (s) => s.name);
      this.setState({ 
        secretQuery: newQuery,
        filteredSecrets: filtered,
        selectedIndex: 0
      });
    }
  }
  
  handlePrintableInSearch(key) {
    const { step } = this.state;
    const char = key.toString();
    
    if (step === 'namespace') {
      const newQuery = this.state.query + char;
      const filtered = this.fuzzySearch(newQuery, this.state.namespaces);
      this.setState({ 
        query: newQuery,
        filteredNamespaces: filtered,
        selectedIndex: 0
      });
    } else if (step === 'secret') {
      const newQuery = this.state.secretQuery + char;
      const filtered = this.fuzzySearch(newQuery, this.state.secrets, (s) => s.name);
      this.setState({ 
        secretQuery: newQuery,
        filteredSecrets: filtered,
        selectedIndex: 0
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
}

module.exports = { CopyWizardScreen };