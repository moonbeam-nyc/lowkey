/**
 * Kubernetes Namespace Selection Screen (Component-based version)
 * 
 * This screen allows users to select a Kubernetes namespace before browsing secrets.
 * It uses the declarative component system for consistent UI rendering.
 */

const { ComponentScreen } = require('./component-screen');
const { 
  Title, 
  Spacer, 
  SearchInput, 
  List, 
  InstructionsFromOptions,
  ErrorText,
  Text
} = require('../component-system');

class KubernetesNamespaceScreen extends ComponentScreen {
  constructor(options) {
    const { namespaces, currentContext, selectedType, originalOptions } = options;
    
    super({
      id: 'kubernetes-namespace-selection',
      hasBackNavigation: true,
      hasSearch: true,
      breadcrumbs: ['Type Selection', 'Kubernetes'],
      initialState: {
        selectedIndex: 0,
        searchMode: false,
        query: '',
        filteredItems: namespaces || [],
        errorMessage: null,
        isRefreshing: false
      }
    });

    this.namespaces = namespaces || [];
    this.currentContext = currentContext;
    this.selectedType = selectedType;
    this.originalOptions = originalOptions;
    
    // Question text with context
    this.question = `Select Kubernetes namespace (Context: ${currentContext}):`;
  }

  /**
   * Declare what to display - using the component system
   */
  getComponents(state) {
    const { selectedIndex, searchMode, query, filteredItems, errorMessage, isRefreshing } = state;
    
    const components = [];
    
    // Breadcrumbs are handled by the header system, no need to add them here
    
    // Title with context
    components.push(Title(this.question));
    components.push(Spacer());
    
    // Search input (only show if search is active or has query)
    if (searchMode || query) {
      components.push(SearchInput(query, searchMode, 'Type to filter... (Esc to exit)'));
      components.push(Spacer());
    }
    
    // Refreshing indicator
    if (isRefreshing) {
      components.push(Text('Refreshing namespaces...', 'yellow'));
      components.push(Spacer());
    }
    
    // Error message (if any)
    if (errorMessage) {
      components.push(ErrorText(errorMessage));
      components.push(Spacer());
    }
    
    // List of namespaces
    components.push(List(
      filteredItems,
      selectedIndex,
      {
        paginate: true,
        displayFunction: (namespace) => {
          // Handle both string and object formats
          return typeof namespace === 'string' ? namespace : namespace.name;
        },
        searchQuery: query,
        emptyMessage: this.namespaces.length === 0 ? 'No namespaces available' : 'No matching namespaces found',
        showSelectionIndicator: !searchMode // Hide cursor when in search mode
      }
    ));
    
    components.push(Spacer());
    
    // Instructions
    components.push(InstructionsFromOptions({
      hasSearch: true,
      hasBackNavigation: true
    }));
    
    return components;
  }

  /**
   * Set up key handlers - focused on business logic
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
      
      // Exit search mode, clear query, or go back
      .onEscape(() => {
        const { searchMode, query } = this.state;
        if (searchMode) {
          // Exit search mode
          this.setState({ searchMode: false });
          return true;
        } else if (query) {
          // Clear search query and show full list
          this.updateSearch('');
          return true;
        } else if (this.config.hasBackNavigation) {
          // Go back to previous screen
          this.goBack();
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
          this.pageUpAction();
        }
        return true;
      })
      
      .onKey('\u0006', () => { // Ctrl+F
        if (!this.state.searchMode) {
          this.pageDownAction();
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
          this.selectNamespace(filteredItems[selectedIndex]);
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
   * Business logic methods
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
  
  pageUpAction() {
    const { selectedIndex, filteredItems } = this.state;
    const newIndex = Math.max(0, selectedIndex - 10);
    this.setState({ selectedIndex: newIndex });
  }
  
  pageDownAction() {
    const { selectedIndex, filteredItems } = this.state;
    const newIndex = Math.min(filteredItems.length - 1, selectedIndex + 10);
    this.setState({ selectedIndex: newIndex });
  }
  
  updateSearch(newQuery) {
    const filteredItems = this.fuzzySearch(newQuery, this.namespaces, (namespace) => 
      typeof namespace === 'string' ? namespace : namespace.name
    );
    this.setState({ 
      query: newQuery,
      filteredItems,
      selectedIndex: 0 // Reset selection
    });
  }
  
  async selectNamespace(selectedNamespace) {
    try {
      const kubernetes = require('../../providers/kubernetes');
      
      // Get the namespace name (handle both string and object)
      const namespaceName = typeof selectedNamespace === 'string' 
        ? selectedNamespace 
        : selectedNamespace.name;
      
      // List secrets in the selected namespace
      const secrets = await kubernetes.listSecrets(namespaceName);
      
      // Create choices for secret selection
      const choices = secrets.map(secretName => ({ 
        name: secretName,
        namespace: namespaceName 
      }));
      
      if (choices.length === 0) {
        this.setState({ errorMessage: `No secrets found in namespace '${namespaceName}'` });
        return;
      }

      // Navigate to secret selection screen
      const { TerminalManager } = require('../terminal-manager');
      const { SecretSelectionScreen } = require('./secret-selection-screen');
      const terminalManager = TerminalManager.getInstance();
      
      const secretScreen = new SecretSelectionScreen({
        selectedType: {
          ...this.selectedType,
          namespace: namespaceName,
          context: this.currentContext
        },
        choices,
        originalOptions: this.originalOptions,
        searchState: {},
        breadcrumbs: ['Type Selection', 'Kubernetes', `Namespace: ${namespaceName}`]
      });
      
      terminalManager.pushScreen(secretScreen);
      
    } catch (error) {
      this.setState({ errorMessage: `Error listing secrets: ${error.message}` });
    }
  }
  
  /**
   * Refresh namespaces when screen becomes active
   */
  async onActivate() {
    super.onActivate();
    await this.refreshNamespaces();
  }
  
  async refreshNamespaces() {
    try {
      this.setState({ isRefreshing: true });
      
      const kubernetes = require('../../providers/kubernetes');
      
      // Check if kubectl is still accessible
      await kubernetes.checkKubectlAccess();
      
      // Get current context (might have changed)
      const currentContext = await kubernetes.getCurrentContext();
      
      // Get available namespaces
      const namespaces = await kubernetes.listNamespaces();
      
      if (namespaces.length > 0) {
        // Update the namespaces
        this.namespaces = namespaces;
        this.currentContext = currentContext;
        
        // Update the question if context changed
        this.question = `Select Kubernetes namespace (Context: ${currentContext}):`;
        
        // Filter with current query
        const query = this.state.query || '';
        const filteredItems = this.fuzzySearch(query, namespaces, (namespace) => 
          typeof namespace === 'string' ? namespace : namespace.name
        );
        
        this.setState({ 
          filteredItems,
          isRefreshing: false 
        });
      } else {
        this.setState({ 
          isRefreshing: false,
          errorMessage: 'No namespaces found in cluster'
        });
      }
    } catch (error) {
      this.setState({ 
        isRefreshing: false,
        errorMessage: `Failed to refresh namespaces: ${error.message}`
      });
    }
  }
}

module.exports = { KubernetesNamespaceScreen };