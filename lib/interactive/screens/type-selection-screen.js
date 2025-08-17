const { FuzzySearchScreen } = require('./fuzzy-search-screen');
const { output } = require('../terminal-utils');
const { colorize } = require('../../core/colors');
const { StatusComponents } = require('../ui-components');
const { getPopupManager } = require('../popup-manager');
const AwsProfilePopup = require('./aws-profile-screen');
const { KeyHandlerSet, KeyDetector } = require('../key-handler-set');

// Type Selection Screen - handles the first step of interactive flow
class TypeSelectionScreen extends FuzzySearchScreen {
  constructor(options) {
    const types = [
      { name: 'aws-secrets-manager', description: 'AWS Secrets Manager' },
      { name: 'env', description: 'Environment files (.env*)' },
      { name: 'json', description: 'JSON files' },
      { name: 'kubernetes', description: 'Kubernetes Secrets' }
    ];

    super({
      id: 'type-selection',
      items: types,
      question: 'Select secret type:',
      displayFunction: (type) => `${type.name} - ${type.description}`,
      hasBackNavigation: false,
      breadcrumbs: [],
      initialState: { errorMessage: null }
    });

    this.originalOptions = options;
  }

  async onSelection(selectedType) {
    // For kubernetes, we need to handle namespace selection first
    if (selectedType.name === 'kubernetes') {
      return await this.handleKubernetesSelection(selectedType);
    }

    // Validate the type has available items before proceeding
    try {
      const { listAwsSecrets } = require('../../providers/aws');
      const { listEnvFiles, listJsonFiles } = require('../../providers/files');
      
      let choices = [];
      
      if (selectedType.name === 'aws-secrets-manager') {
        const secrets = await listAwsSecrets(this.originalOptions.region);
        choices = secrets.map(secret => ({
          name: secret.Name,
          lastChanged: secret.LastChangedDate ? new Date(secret.LastChangedDate).toISOString().split('T')[0] : 'Unknown'
        })).sort((a, b) => a.name.localeCompare(b.name));
      } else if (selectedType.name === 'env') {
        const files = listEnvFiles(this.originalOptions.path || '.');
        choices = files.map(file => ({ name: file }));
      } else if (selectedType.name === 'json') {
        const files = listJsonFiles(this.originalOptions.path || '.');
        choices = files.map(file => ({ name: file }));
      }
      
      if (choices.length === 0) {
        // Update state to show error and stay on this screen
        this.setState({ errorMessage: `No ${selectedType.name} secrets found` });
        this.render(true);
        return false; // Don't navigate away
      }

      // Create and push the secret selection screen
      const { TerminalManager } = require('../terminal-manager');
      const { SecretSelectionScreen } = require('./secret-selection-screen');
      const terminalManager = TerminalManager.getInstance();
      
      const secretScreen = new SecretSelectionScreen({
        selectedType,
        choices,
        originalOptions: this.originalOptions,
        searchState: {}
      });
      
      terminalManager.pushScreen(secretScreen);
      return true; // Navigation handled
      
    } catch (error) {
      this.setState({ errorMessage: `Error accessing ${selectedType.name}: ${error.message}` });
      this.render(true);
      return false;
    }
  }

  // Override the key handlers to handle selection
  setupKeyHandlers() {
    // Call parent setup first to register all normal handlers
    super.setupKeyHandlers();
    
    // Create a KeyHandlerSet for type-selection specific handlers
    const typeSelectionHandlers = new KeyHandlerSet()
      .onKey('\u0001', () => { // Ctrl+A
        this.showAwsProfilePopup();
        return true;
      })
      .onEnter(() => {
        const { filteredItems = [], selectedIndex = 0, searchMode = false } = this.state;
        
        // Clear any existing error message before attempting selection
        if (this.state.errorMessage) {
          this.setState({ errorMessage: null });
        }
        
        // If in search mode, just exit search mode (consistent with other screens)
        if (searchMode) {
          this.setState({ searchMode: false });
          return true;
        }
        
        // Otherwise, handle selection
        if (filteredItems.length > 0) {
          const selectedType = filteredItems[selectedIndex];
          // Handle async operation without blocking
          this.onSelection(selectedType).catch(error => {
            output.error(`Error in type selection: ${error.message}`);
          });
          return true; // Consume the key press
        }
        
        return false;
      })
      .onUpArrow(() => {
        if (this.state.errorMessage) {
          this.setState({ errorMessage: null });
        }
        return false; // Let parent handler process navigation
      })
      .onDownArrow(() => {
        if (this.state.errorMessage) {
          this.setState({ errorMessage: null });
        }
        return false; // Let parent handler process navigation
      })
      .onKey('j', () => {
        if (this.state.errorMessage) {
          this.setState({ errorMessage: null });
        }
        return false; // Let parent handler process navigation
      })
      .onKey('k', () => {
        if (this.state.errorMessage) {
          this.setState({ errorMessage: null });
        }
        return false; // Let parent handler process navigation
      })
      .onKey('\u0015', () => { // Ctrl+U (Page up)
        if (this.state.errorMessage) {
          this.setState({ errorMessage: null });
        }
        return false; // Let parent handler process navigation
      })
      .onKey('\u0002', () => { // Ctrl+B (Page up)
        if (this.state.errorMessage) {
          this.setState({ errorMessage: null });
        }
        return false; // Let parent handler process navigation
      })
      .onKey('\u0004', () => { // Ctrl+D (Page down)
        if (this.state.errorMessage) {
          this.setState({ errorMessage: null });
        }
        return false; // Let parent handler process navigation
      })
      .onKey('\u0006', () => { // Ctrl+F (Page down)
        if (this.state.errorMessage) {
          this.setState({ errorMessage: null });
        }
        return false; // Let parent handler process navigation
      });

    // Add the handlers to the key manager with priority for Enter key
    this.keyManager.handlers.unshift((key, state, context) => {
      return typeSelectionHandlers.process(key, { 
        state: state, 
        setState: this.setState.bind(this),
        screen: this
      });
    });
  }

  renderFuzzySearch(state) {
    const output = super.renderFuzzySearch(state);
    
    // Add error message if present using StatusComponents
    if (state.errorMessage) {
      const lines = output.split('\n');
      const instructionsIndex = lines.findIndex(line => line.includes('Use ↑↓/jk'));
      if (instructionsIndex !== -1) {
        const errorMessage = StatusComponents.renderErrorMessage(state.errorMessage);
        
        // Find and remove any blank lines before the instructions
        let linesToRemove = 0;
        for (let i = instructionsIndex - 1; i >= 0; i--) {
          if (lines[i] === '') {
            linesToRemove++;
          } else {
            break;
          }
        }
        
        // Remove all blank lines before instructions and insert error + single blank line
        if (linesToRemove > 0) {
          lines.splice(instructionsIndex - linesToRemove, linesToRemove, errorMessage, '');
        } else {
          // If no blank lines found, insert before instructions
          lines.splice(instructionsIndex, 0, errorMessage, '');
        }
      }
      return lines.join('\n');
    }
    
    return output;
  }

  async handleKubernetesSelection(selectedType) {
    try {
      const kubernetes = require('../../providers/kubernetes');
      
      // First check if kubectl is available and cluster is accessible
      await kubernetes.checkKubectlAccess();
      
      // Get current context for display
      const currentContext = await kubernetes.getCurrentContext();
      
      // Get available namespaces
      const namespaces = await kubernetes.listNamespaces();
      
      if (namespaces.length === 0) {
        this.setState({ errorMessage: 'No namespaces found in cluster' });
        this.render(true);
        return false;
      }

      // Create namespace selection screen
      const { TerminalManager } = require('../terminal-manager');
      const { KubernetesNamespaceScreen } = require('./kubernetes-namespace-screen');
      const terminalManager = TerminalManager.getInstance();
      
      const namespaceScreen = new KubernetesNamespaceScreen({
        selectedType,
        namespaces,
        currentContext,
        originalOptions: this.originalOptions
      });
      
      terminalManager.pushScreen(namespaceScreen);
      return true; // Navigation handled
      
    } catch (error) {
      this.setState({ errorMessage: `Kubernetes error: ${error.message}` });
      this.render(true);
      return false;
    }
  }

  showAwsProfilePopup() {
    const popupManager = getPopupManager();
    const popup = new AwsProfilePopup({
      onConfigChange: (config) => {
        // Handle configuration change - could update displayed information
        console.log('AWS configuration changed:', config);
      }
    });
    
    popupManager.showPopup(popup, this);
  }
}

module.exports = { TypeSelectionScreen };