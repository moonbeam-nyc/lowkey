const { FuzzySearchScreen } = require('./fuzzy-search-screen');
const { output } = require('../terminal-utils');
const { colorize } = require('../colors');

// Kubernetes Namespace Selection Screen
class KubernetesNamespaceScreen extends FuzzySearchScreen {
  constructor(options) {
    const { namespaces, currentContext, selectedType, originalOptions } = options;
    
    // Convert namespaces to items with descriptions
    const namespaceItems = namespaces.map(namespace => ({
      name: namespace,
      description: namespace === 'default' ? 'Default namespace' : `Namespace: ${namespace}`
    }));

    super({
      id: 'kubernetes-namespace-selection',
      items: namespaceItems,
      question: `Select Kubernetes namespace (Context: ${currentContext}):`,
      displayFunction: (item) => `${item.name} - ${item.description}`,
      hasBackNavigation: true,
      breadcrumbs: ['Type Selection', 'Kubernetes'],
      initialState: { errorMessage: null }
    });

    this.selectedType = selectedType;
    this.currentContext = currentContext;
    this.originalOptions = originalOptions;
  }

  async onSelection(selectedNamespace) {
    try {
      const kubernetes = require('../kubernetes');
      
      // List secrets in the selected namespace
      const secrets = await kubernetes.listSecrets(selectedNamespace.name);
      
      // Create choices for secret selection
      const choices = secrets.map(secretName => ({ 
        name: secretName,
        namespace: selectedNamespace.name 
      }));
      
      if (choices.length === 0) {
        this.setState({ errorMessage: `No secrets found in namespace '${selectedNamespace.name}'` });
        this.render(true);
        return false;
      }

      // Create secret selection screen with kubernetes-specific data
      const { TerminalManager } = require('../terminal-manager');
      const { SecretSelectionScreen } = require('./secret-selection-screen');
      const terminalManager = TerminalManager.getInstance();
      
      const secretScreen = new SecretSelectionScreen({
        selectedType: {
          ...this.selectedType,
          namespace: selectedNamespace.name,
          context: this.currentContext
        },
        choices,
        originalOptions: this.originalOptions,
        searchState: {},
        breadcrumbs: ['Type Selection', 'Kubernetes', `Namespace: ${selectedNamespace.name}`]
      });
      
      terminalManager.pushScreen(secretScreen);
      return true; // Navigation handled
      
    } catch (error) {
      this.setState({ errorMessage: `Error listing secrets: ${error.message}` });
      this.render(true);
      return false;
    }
  }

  // Override the key handlers to handle selection
  setupKeyHandlers() {
    // Call parent setup first to register all normal handlers
    super.setupKeyHandlers();
    
    // Add handler to clear error message when navigating
    this.keyManager.addHandler((key, state, context) => {
      // Clear error message on any navigation
      if (state.errorMessage && (
        key === '\u001b[A' || key === '\u001b[B' || // Arrow keys
        key === 'j' || key === 'k' || // vim keys
        key === '\u0015' || key === '\u0002' || // Page up
        key === '\u0004' || key === '\u0006' // Page down
      )) {
        this.setState({ errorMessage: null });
        return false; // Let the navigation handler process it
      }
      return false;
    });
    
    // Add a custom enter handler that takes priority
    this.keyManager.handlers.unshift((key, state, context) => {
      // Only handle Enter key, let everything else pass through
      if (key === '\r' || key === '\n') { // Enter key
        const { filteredItems = [], selectedIndex = 0, searchMode = false } = state;
        
        // Clear any existing error message before attempting selection
        if (state.errorMessage) {
          this.setState({ errorMessage: null });
        }
        
        // If in search mode, just exit search mode (consistent with other screens)
        if (searchMode) {
          this.setState({ searchMode: false });
          return true;
        }
        
        // Otherwise, handle selection
        if (filteredItems.length > 0) {
          const selectedNamespace = filteredItems[selectedIndex];
          // Handle async operation without blocking
          this.onSelection(selectedNamespace).catch(error => {
            output.error(`Error in namespace selection: ${error.message}`);
          });
          return true; // Consume the key press
        }
      }
      return false; // Let other handlers process it
    });
  }

  renderFuzzySearch(state) {
    const output = super.renderFuzzySearch(state);
    
    // Add error message if present
    if (state.errorMessage) {
      const lines = output.split('\n');
      const instructionsIndex = lines.findIndex(line => line.includes('Use ↑↓/jk'));
      if (instructionsIndex !== -1) {
        lines.splice(instructionsIndex, 0, '', colorize(`⚠️  ${state.errorMessage}`, 'red'), '');
      }
      return lines.join('\n');
    }
    
    return output;
  }
}

module.exports = { KubernetesNamespaceScreen };