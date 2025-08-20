/**
 * Type Selection Screen (Component-based version)
 * 
 * This is the new version that demonstrates the declarative component system.
 * Compare this to the original type-selection-screen.js to see the difference.
 * 
 * This screen only declares WHAT to display and HOW to handle input.
 * All rendering, pagination, and terminal operations are handled automatically.
 */

const { ComponentScreen } = require('./component-screen');
const { 
  Title, 
  Spacer, 
  SearchInput, 
  List, 
  InstructionsFromOptions,
  ErrorText
} = require('../component-system');
const { colorize } = require('../../core/colors');

class TypeSelectionScreen extends ComponentScreen {
  constructor(options) {
    const types = [
      { name: 'aws-secrets-manager', description: 'AWS Secrets Manager' },
      { name: 'env', description: 'Environment files (.env*)' },
      { name: 'json', description: 'JSON files' },
      { name: 'kubernetes', description: 'Kubernetes Secrets' }
    ];

    super({
      id: 'type-selection',
      hasBackNavigation: false,
      hasSearch: true,
      breadcrumbs: [],
      initialState: {
        selectedIndex: 0,
        searchMode: false,
        query: '',
        filteredItems: types,
        errorMessage: null
      }
    });

    this.types = types;
    this.originalOptions = options;
  }

  /**
   * Declare what to display - this is the key difference!
   * No output.push(), no calculating heights, no terminal operations.
   * Just declare the components we want.
   */
  getComponents(state) {
    const { selectedIndex, searchMode, query, filteredItems, errorMessage } = state;
    
    const components = [];
    
    // Breadcrumbs are handled by the header system, no need to add them here
    
    // Title
    components.push(Title('Select secret type:'));
    components.push(Spacer());
    
    // Search input (only add spacer if search is active or has query)
    if (searchMode || query) {
      components.push(SearchInput(query, searchMode, 'Type to filter... (Esc to exit)'));
      components.push(Spacer());
    }
    
    // Error message (if any)
    if (errorMessage) {
      components.push(ErrorText(errorMessage));
      components.push(Spacer());
    }
    
    // List of types
    components.push(List(
      filteredItems,
      selectedIndex,
      {
        paginate: true, // Terminal Manager handles pagination automatically
        displayFunction: (type) => `${type.name} - ${colorize(type.description, 'gray')}`,
        searchQuery: query, // Enable search highlighting
        emptyMessage: 'No matching types found',
        showSelectionIndicator: !searchMode // Hide cursor when in search mode
      }
    ));
    
    components.push(Spacer());
    
    // Instructions
    components.push(InstructionsFromOptions({
      hasSearch: true,
      hasBackNavigation: this.config.hasBackNavigation
    }));
    
    return components;
  }

  /**
   * Handle user input - also much simpler!
   * No terminal awareness, just business logic.
   */
  setupKeyHandlers() {
    // Don't call super.setupKeyHandlers() to avoid the default Escape handler
    
    // Add Ctrl+C handler first
    this.keyManager.addHandler((key, state, context) => {
      const keyStr = key.toString();
      
      // Ctrl+C - exit
      if (keyStr === '\u0003') {
        this.exit();
        return true;
      }
      
      return false;
    });
    
    const handlers = this.createKeyHandlers()
      // Search toggle
      .onKey('/', () => {
        this.setState({ searchMode: true });
        return true;
      })
      
      // Exit search mode or clear query (no back navigation on this screen)
      .onEscape(() => {
        const { searchMode, query } = this.state;
        if (searchMode) {
          this.setState({ searchMode: false });
          return true;
        } else if (query) {
          // Clear search query and show full list
          this.updateSearch('');
          return true;
        }
        return false;
      })
      
      // Navigation
      .onUpArrow(() => {
        if (!this.state.searchMode) {
          this.navigateUp();
        }
        return true;
      })
      
      .onDownArrow(() => {
        if (!this.state.searchMode) {
          this.navigateDown();
        }
        return true;
      })
      
      .onKey('j', () => {
        if (!this.state.searchMode) {
          this.navigateDown();
        }
        return true;
      })
      
      .onKey('k', () => {
        if (!this.state.searchMode) {
          this.navigateUp();
        }
        return true;
      })
      
      // Page navigation
      .onKey('\u0002', () => { // Ctrl+B
        if (!this.state.searchMode) {
          this.pageUp();
        }
        return true;
      })
      
      .onKey('\u0006', () => { // Ctrl+F
        if (!this.state.searchMode) {
          this.pageDown();
        }
        return true;
      })
      
      // Go to top/bottom
      .onKey('g', () => {
        if (!this.state.searchMode) {
          this.setState({ selectedIndex: 0 });
        }
        return true;
      })
      
      .onKey('G', () => {
        if (!this.state.searchMode) {
          const { filteredItems } = this.state;
          if (filteredItems.length > 0) {
            this.setState({ selectedIndex: filteredItems.length - 1 });
          }
        }
        return true;
      })
      
      // Selection
      .onEnter(() => {
        const { searchMode, filteredItems, selectedIndex } = this.state;
        
        // Clear error first
        if (this.state.errorMessage) {
          this.setState({ errorMessage: null });
        }
        
        if (searchMode) {
          this.setState({ searchMode: false });
          return true;
        }
        
        if (filteredItems.length > 0) {
          this.selectType(filteredItems[selectedIndex]);
        }
        return true;
      })
      
      // Search input
      .onBackspace(() => {
        if (this.state.searchMode && this.state.query.length > 0) {
          this.updateSearch(this.state.query.slice(0, -1));
        }
        return true;
      })
      
      .onPrintable((key) => {
        if (this.state.searchMode) {
          const char = key.toString();
          this.updateSearch(this.state.query + char);
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
   * Business logic methods - clean and simple
   */
  
  navigateUp() {
    const { selectedIndex, filteredItems } = this.state;
    const newIndex = this.navigateToIndex(selectedIndex - 1, filteredItems.length);
    this.setState({ selectedIndex: newIndex });
  }
  
  navigateDown() {
    const { selectedIndex, filteredItems } = this.state;
    const newIndex = this.navigateToIndex(selectedIndex + 1, filteredItems.length);
    this.setState({ selectedIndex: newIndex });
  }
  
  pageUp() {
    const { selectedIndex, filteredItems } = this.state;
    const newIndex = Math.max(0, selectedIndex - 10);
    this.setState({ selectedIndex: newIndex });
  }
  
  pageDown() {
    const { selectedIndex, filteredItems } = this.state;
    const newIndex = Math.min(filteredItems.length - 1, selectedIndex + 10);
    this.setState({ selectedIndex: newIndex });
  }
  
  updateSearch(newQuery) {
    const filteredItems = this.fuzzySearch(newQuery, this.types, (type) => `${type.name} ${type.description}`);
    this.setState({ 
      query: newQuery,
      filteredItems,
      selectedIndex: 0 // Reset selection
    });
  }
  
  async selectType(selectedType) {
    try {
      // Validate the type has available items before proceeding
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
      } else if (selectedType.name === 'kubernetes') {
        return await this.handleKubernetesSelection(selectedType);
      }
      
      if (choices.length === 0) {
        this.setState({ errorMessage: `No ${selectedType.name} secrets found` });
        return;
      }

      // Navigate to secret selection screen
      this.navigateToSecretSelection(selectedType, choices);
      
    } catch (error) {
      this.setState({ errorMessage: `Error accessing ${selectedType.name}: ${error.message}` });
    }
  }
  
  navigateToSecretSelection(selectedType, choices) {
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
        return;
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
      
    } catch (error) {
      this.setState({ errorMessage: `Kubernetes error: ${error.message}` });
    }
  }
}

module.exports = { TypeSelectionScreen };