/**
 * Secret Selection Screen (Component-based version)
 * 
 * This is the new version that demonstrates the declarative component system
 * for secret selection with search, AWS profile management, and navigation.
 * 
 * Compare to the original secret-selection-screen.js to see the difference.
 * This version focuses purely on business logic and component declarations.
 */

const { ComponentScreen } = require('./component-screen');
const { 
  Title, 
  Spacer, 
  SearchInput, 
  List, 
  InstructionsFromOptions,
  ErrorText,
  Breadcrumbs,
  Text
} = require('../component-system');

class SecretSelectionScreenV2 extends ComponentScreen {
  constructor(options) {
    const { selectedType, choices, originalOptions, searchState, breadcrumbs } = options;

    super({
      id: 'secret-selection-v2',
      hasBackNavigation: true,
      hasSearch: true,
      breadcrumbs: breadcrumbs || [selectedType.name],
      initialState: {
        selectedIndex: 0,
        searchMode: false,
        query: searchState?.secretQuery || '',
        filteredItems: choices || [],
        errorMessage: null,
        isRefreshing: false
      }
    });

    this.selectedType = selectedType;
    this.originalOptions = originalOptions;
    this.searchState = searchState || {};
    this.items = choices || [];
    
    // Question text based on type
    this.question = `Select ${selectedType.name} secret:`;
  }

  /**
   * Declare what to display - much cleaner than the original!
   */
  getComponents(state) {
    const { selectedIndex, searchMode, query, filteredItems, errorMessage, isRefreshing } = state;
    
    const components = [];
    
    // Breadcrumbs
    if (this.config.breadcrumbs.length > 0) {
      components.push(Breadcrumbs(this.config.breadcrumbs));
      components.push(Spacer());
    }
    
    // Question/Title
    components.push(Title(this.question));
    components.push(Spacer());
    
    // Search input
    components.push(SearchInput(query, searchMode, 'Type to search...'));
    components.push(Spacer());
    
    // Refreshing indicator
    if (isRefreshing) {
      components.push(Text('Refreshing secrets...', 'yellow'));
      components.push(Spacer());
    }
    
    // Error message (if any)
    if (errorMessage) {
      components.push(ErrorText(errorMessage));
      components.push(Spacer());
    }
    
    // List of secrets
    components.push(List(
      filteredItems,
      selectedIndex,
      {
        paginate: true, // Automatic pagination
        displayFunction: (choice) => {
          if (choice.lastChanged) {
            return `${choice.name} (${choice.lastChanged})`;
          }
          return choice.name;
        },
        searchQuery: query, // Enable search highlighting
        emptyMessage: this.items.length === 0 ? 'No secrets available' : 'No matching secrets found'
      }
    ));
    
    components.push(Spacer());
    
    // Instructions (including Ctrl+A for AWS)
    const instructionOptions = {
      hasSearch: true,
      hasBackNavigation: true
    };
    
    // No need for AWS-specific instructions since Ctrl+A is now global
    
    components.push(InstructionsFromOptions(instructionOptions));
    
    return components;
  }

  /**
   * Set up key handlers - focused on business logic
   */
  setupKeyHandlers() {
    super.setupKeyHandlers();
    
    const handlers = this.createKeyHandlers()
      // Search toggle
      .onKey('/', () => {
        this.setState({ searchMode: true });
        return true;
      })
      
      // Exit search mode
      .onEscape(() => {
        const { searchMode } = this.state;
        if (searchMode) {
          this.setState({ searchMode: false });
          return true;
        }
        return false; // Let default handler handle it (go back)
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
      .onKey('\u0015', () => { // Ctrl+U
        if (!this.state.searchMode) {
          this.pageUp();
        }
        return true;
      })
      
      .onKey('\u0004', () => { // Ctrl+D
        if (!this.state.searchMode) {
          this.pageDown();
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
        
        // If in search mode, exit search mode
        if (searchMode) {
          this.setState({ searchMode: false });
          return true;
        }
        
        // Otherwise, handle selection
        if (filteredItems.length > 0) {
          this.selectSecret(filteredItems[selectedIndex]);
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
      })
      
    
    this.keyManager.addHandler((key, state, context) => {
      return handlers.process(key, { 
        state: state, 
        setState: this.setState.bind(this),
        screen: this
      });
    });
  }

  /**
   * Screen lifecycle - refresh secrets when activated
   */
  async onActivate() {
    await this.refreshSecrets();
  }

  /**
   * Business logic methods - much cleaner without rendering concerns
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
    const newIndex = this.pageUp(selectedIndex);
    this.setState({ selectedIndex: this.navigateToIndex(newIndex, filteredItems.length) });
  }
  
  pageDown() {
    const { selectedIndex, filteredItems } = this.state;
    const newIndex = this.pageDown(selectedIndex, 10, filteredItems.length);
    this.setState({ selectedIndex: newIndex });
  }
  
  updateSearch(newQuery) {
    const filteredItems = this.fuzzySearch(newQuery, this.items, (item) => item.name);
    this.setState({ 
      query: newQuery,
      filteredItems,
      selectedIndex: 0 // Reset selection
    });
  }
  
  async refreshSecrets() {
    try {
      this.setState({ isRefreshing: true, errorMessage: null });
      
      const { listAwsSecrets } = require('../../providers/aws');
      const { listEnvFiles, listJsonFiles } = require('../../providers/files');
      
      let choices = [];
      
      if (this.selectedType.name === 'aws-secrets-manager') {
        const secrets = await listAwsSecrets(this.originalOptions.region);
        choices = secrets.map(secret => ({
          name: secret.Name,
          lastChanged: secret.LastChangedDate ? new Date(secret.LastChangedDate).toISOString().split('T')[0] : 'Unknown'
        })).sort((a, b) => a.name.localeCompare(b.name));
      } else if (this.selectedType.name === 'env') {
        const files = listEnvFiles(this.originalOptions.path || '.');
        choices = files.map(file => ({ name: file }));
      } else if (this.selectedType.name === 'json') {
        const files = listJsonFiles(this.originalOptions.path || '.');
        choices = files.map(file => ({ name: file }));
      } else if (this.selectedType.name === 'kubernetes') {
        const kubernetes = require('../../providers/kubernetes');
        const secrets = await kubernetes.listSecrets(this.selectedType.namespace);
        choices = secrets.map(secret => ({ name: secret.name || secret }));
      }
      
      // Update items and refresh filtered list
      this.items = choices;
      const filteredItems = this.fuzzySearch(this.state.query || '', choices, (item) => item.name);
      
      this.setState({ 
        filteredItems,
        isRefreshing: false,
        selectedIndex: 0 // Reset selection after refresh
      });
      
    } catch (error) {
      this.setState({ 
        errorMessage: `Failed to refresh secrets: ${error.message}`,
        isRefreshing: false
      });
    }
  }
  
  async selectSecret(selectedSecret) {
    try {
      // Store the search query before navigating
      this.searchState.secretQuery = this.state.query || '';
      
      // Fetch the secret data
      const { fetchSecret, parseSecretData } = require('../../utils/secrets');
      
      const fetchOptions = {
        inputType: this.selectedType.name,
        inputName: selectedSecret.name,
        region: this.originalOptions.region,
        path: this.originalOptions.path,
        namespace: this.selectedType.namespace,
        context: this.selectedType.context
      };
      
      const secretString = await fetchSecret(fetchOptions);
      const secretData = parseSecretData(secretString);
    
      if (typeof secretData !== 'object' || secretData === null) {
        throw new Error('Secret data is not in a valid key-value format');
      }
      
      const keys = Object.keys(secretData);
      
      if (keys.length === 0) {
        this.setState({ errorMessage: 'Secret contains no key-value pairs' });
        return;
      }
      
      // Navigate to key browser screen
      const { TerminalManager } = require('../terminal-manager');
      const { KeyBrowserScreenV2 } = require('./key-browser-screen-v2');
      const terminalManager = TerminalManager.getInstance();
      
      const keyBrowserScreen = new KeyBrowserScreenV2({
        secretData,
        secretType: this.selectedType.name,
        secretName: selectedSecret.name,
        region: this.originalOptions.region,
        namespace: this.selectedType.namespace,
        context: this.selectedType.context,
        hasBackNavigation: true,
        hasEdit: this.selectedType.name === 'env' || this.selectedType.name === 'json' || this.selectedType.name === 'aws-secrets-manager' || this.selectedType.name === 'kubernetes',
        breadcrumbs: [this.selectedType.name, selectedSecret.name],
        initialShowValues: this.originalOptions.showValues || false
      });
      
      terminalManager.pushScreen(keyBrowserScreen);
      
    } catch (error) {
      this.setState({ errorMessage: `Error loading secret: ${error.message}` });
    }
  }
  
  // Handle AWS config changes (called by global handler)
  onAwsConfigChange(config) {
    // Refresh the secret list if we're on AWS secrets
    if (this.selectedType.name === 'aws-secrets-manager') {
      this.refreshSecrets();
    }
  }
}

module.exports = { SecretSelectionScreenV2 };