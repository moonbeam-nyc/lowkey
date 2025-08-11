const { FuzzySearchScreen } = require('./fuzzy-search-screen');
const { colorize } = require('../colors');

// Secret Selection Screen - handles the second step
class SecretSelectionScreen extends FuzzySearchScreen {
  constructor(options) {
    const { selectedType, choices, originalOptions, searchState } = options;

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
      breadcrumbs: [` ${selectedType.name}`],
      initialQuery: searchState.secretQuery || ''
    });

    this.selectedType = selectedType;
    this.originalOptions = originalOptions;
    this.searchState = searchState;
  }

  async onSelection(selectedSecret) {
    try {
      // Fetch the secret data
      const { fetchSecret, parseSecretData } = require('../secrets');
      
      const fetchOptions = {
        inputType: this.selectedType.name,
        inputName: selectedSecret.name,
        region: this.originalOptions.region,
        path: this.originalOptions.path
      };
      
      const secretString = await fetchSecret(fetchOptions);
      const secretData = parseSecretData(secretString);
    
      if (typeof secretData !== 'object' || secretData === null) {
        throw new Error('Secret data is not in a valid key-value format');
      }
      
      const keys = Object.keys(secretData);
      
      if (keys.length === 0) {
        console.log(colorize('No keys found in the secret', 'yellow'));
        return true;
      }
      
      console.log(colorize(`Found ${keys.length} key(s):`, 'green'));
      
      // Create and push the key browser screen
      const { TerminalManager } = require('../terminal-manager');
      const { KeyBrowserScreen } = require('./key-browser-screen');
      const terminalManager = TerminalManager.getInstance();
      
      const keyBrowserScreen = new KeyBrowserScreen({
        secretData,
        secretType: this.selectedType.name,
        secretName: selectedSecret.name,
        region: this.originalOptions.region,
        hasBackNavigation: true,
        hasEdit: this.selectedType.name === 'env' || this.selectedType.name === 'json' || this.selectedType.name === 'aws-secrets-manager',
        breadcrumbs: [` ${this.selectedType.name}`, `${selectedSecret.name}`],
        initialShowValues: this.originalOptions.showValues || false
      });
      
      terminalManager.pushScreen(keyBrowserScreen);
      return true;
      
    } catch (error) {
      console.error(colorize(`Error inspecting secret: ${error.message}`, 'red'));
      return false;
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
        const { filteredItems = [], selectedIndex = 0 } = state;
        if (filteredItems.length > 0) {
          const selectedSecret = filteredItems[selectedIndex];
          // Store the search query before navigating
          this.searchState.secretQuery = state.query || '';
          // Handle async operation without blocking
          this.onSelection(selectedSecret).catch(error => {
            console.error(`Error in secret selection: ${error.message}`);
          });
          return true; // Consume the key press
        }
      }
      return false; // Let other handlers process it
    });
  }
}

module.exports = { SecretSelectionScreen };