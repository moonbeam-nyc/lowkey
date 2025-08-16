const { FuzzySearchScreen } = require('./fuzzy-search-screen');
const { output } = require('../terminal-utils');
const { colorize } = require('../../core/colors');

// Secret Selection Screen - handles the second step
class SecretSelectionScreen extends FuzzySearchScreen {
  constructor(options) {
    const { selectedType, choices, originalOptions, searchState, breadcrumbs } = options;

    super({
      id: 'secret-selection',
      items: choices,
      question: `Select ${selectedType.name} secret:`,
      displayFunction: (choice) => {
        if (choice.lastChanged) {
          return `${choice.name} ${colorize(`(${choice.lastChanged})`, 'gray')}`;
        }
        return choice.name;
      },
      hasBackNavigation: true,
      breadcrumbs: breadcrumbs || [` ${selectedType.name}`],
      initialQuery: searchState.secretQuery || ''
    });

    this.selectedType = selectedType;
    this.originalOptions = originalOptions;
    this.searchState = searchState;
  }

  // Refresh the list of secrets when screen becomes active
  async onActivate() {
    await this.refreshSecrets();
  }

  async refreshSecrets() {
    try {
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
      
      // Update the items and refresh the screen
      this.items = choices;
      this.setState({ filteredItems: this.fuzzySearch(this.state.query || '', choices) });
      
    } catch (error) {
      // If refresh fails, we'll continue with the old data
      // Could add error handling here if needed
    }
  }

  async onSelection(selectedSecret) {
    try {
      // Fetch the secret data
      const { fetchSecret, parseSecretData } = require('../../utils/secrets');
      
      const fetchOptions = {
        inputType: this.selectedType.name,
        inputName: selectedSecret.name,
        region: this.originalOptions.region,
        path: this.originalOptions.path,
        // Add kubernetes-specific options
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
        // No keys found - this should be handled by the key browser screen
        // showing an empty state rather than console output
        return true;
      }
      
      // Don't use console.log as it bypasses alternate screen buffer
      
      // Create and push the key browser screen
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
        breadcrumbs: [` ${this.selectedType.name}`, `${selectedSecret.name}`],
        initialShowValues: this.originalOptions.showValues || false
      });
      
      terminalManager.pushScreen(keyBrowserScreen);
      return true;
      
    } catch (error) {
      // Don't use console.error as it bypasses alternate screen buffer
      // Let the error bubble up or handle it in the UI instead
      throw error;
    }
  }

  // Override the key handlers to handle selection
  setupKeyHandlers() {
    // Call parent setup first to register all normal handlers
    super.setupKeyHandlers();
    
    // Add a custom enter handler that takes priority by checking first in the handler list
    this.keyManager.handlers.unshift((key, state, context) => {
      // Only handle Enter key, let everything else pass through
      if (key === '\r' || key === '\n') { // Enter key
        const { filteredItems = [], selectedIndex = 0, searchMode = false } = state;
        
        // If in search mode, just exit search mode (like key browser does)
        if (searchMode) {
          this.setState({ searchMode: false });
          return true;
        }
        
        // Otherwise, handle selection
        if (filteredItems.length > 0) {
          const selectedSecret = filteredItems[selectedIndex];
          // Store the search query before navigating
          this.searchState.secretQuery = state.query || '';
          // Handle async operation without blocking
          this.onSelection(selectedSecret).catch(error => {
            output.error(`Error in secret selection: ${error.message}`);
          });
          return true; // Consume the key press
        }
      }
      return false; // Let other handlers process it
    });
  }
}

module.exports = { SecretSelectionScreen };