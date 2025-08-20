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
  Text
} = require('../component-system');
const { colorize } = require('../../core/colors');

class SecretSelectionScreen extends ComponentScreen {
  constructor(options) {
    const { selectedType, choices, originalOptions, searchState, breadcrumbs } = options;

    super({
      id: 'secret-selection',
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
    
    // Breadcrumbs are handled by the header system, no need to add them here
    
    // Question/Title
    components.push(Title(this.question));
    components.push(Spacer());
    
    // Search input (only add spacer if search is active or has query)
    if (searchMode || query) {
      components.push(SearchInput(query, searchMode, 'Type to filter... (Esc to exit)'));
      components.push(Spacer());
    }
    
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
            return `${choice.name} ${colorize(`(last updated ${choice.lastChanged})`, 'gray')}`;
          }
          return choice.name;
        },
        searchQuery: query, // Enable search highlighting
        emptyMessage: this.items.length === 0 ? 'No secrets available' : 'No matching secrets found',
        showSelectionIndicator: !searchMode // Hide cursor when in search mode
      }
    ));
    
    components.push(Spacer());
    
    // Instructions (including Ctrl+A for AWS and Ctrl+D for delete)
    const instructionOptions = {
      hasSearch: true,
      hasBackNavigation: true,
      hasDelete: true
    };
    
    components.push(InstructionsFromOptions(instructionOptions));
    
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
      
      // Delete secret
      .onKey('\u0004', () => { // Ctrl+D
        if (!this.state.searchMode && this.state.filteredItems.length > 0) {
          const selectedSecret = this.state.filteredItems[this.state.selectedIndex];
          this.handleDeleteSecret(selectedSecret);
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
    const newIndex = Math.max(0, selectedIndex - 10);
    this.setState({ selectedIndex: newIndex });
  }
  
  pageDown() {
    const { selectedIndex, filteredItems } = this.state;
    const newIndex = Math.min(filteredItems.length - 1, selectedIndex + 10);
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
      const { KeyBrowserScreen } = require('./key-browser-screen');
      const terminalManager = TerminalManager.getInstance();
      
      const keyBrowserScreen = new KeyBrowserScreen({
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
  
  /**
   * Handle delete secret request
   */
  async handleDeleteSecret(selectedSecret) {
    try {
      const { DeleteConfirmationPopup } = require('./delete-confirmation-screen');
      const { getPopupManager } = require('../popup-manager');
      const popupManager = getPopupManager();
      
      const deletePopup = new DeleteConfirmationPopup({
        secretName: selectedSecret.name,
        secretType: this.selectedType.name,
        onConfirm: async () => {
          await this.performDelete(selectedSecret);
        },
        onCancel: () => {
          popupManager.closePopup(); // Close the delete confirmation popup
        }
      });
      
      popupManager.showPopup(deletePopup, this);
      
    } catch (error) {
      this.setState({ errorMessage: `Error opening delete confirmation: ${error.message}` });
    }
  }
  
  /**
   * Perform the actual delete operation
   */
  async performDelete(selectedSecret) {
    try {
      const deleteOperations = require('../../providers/delete-operations');
      
      await deleteOperations.deleteSecret({
        type: this.selectedType.name,
        name: selectedSecret.name,
        region: this.originalOptions.region,
        path: this.originalOptions.path,
        namespace: this.selectedType.namespace,
        context: this.selectedType.context
      });
      
      // Refresh the secrets list to remove the deleted item
      await this.refreshSecrets();
      
    } catch (error) {
      throw error; // Let the confirmation screen handle the error display
    }
  }
}

module.exports = { SecretSelectionScreen };