const { FuzzySearchScreen } = require('./fuzzy-search-screen');
const { output } = require('../terminal-utils');
const { colorize } = require('../colors');

// Type Selection Screen - handles the first step of interactive flow
class TypeSelectionScreen extends FuzzySearchScreen {
  constructor(options) {
    const types = [
      { name: 'aws-secrets-manager', description: 'AWS Secrets Manager' },
      { name: 'env', description: 'Environment files (.env*)' },
      { name: 'json', description: 'JSON files' }
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
    // Validate the type has available items before proceeding
    try {
      const { listAwsSecrets } = require('../aws');
      const { listEnvFiles, listJsonFiles } = require('../files');
      
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
    
    // Add a custom enter handler that takes priority by checking first in the handler list
    this.keyManager.handlers.unshift((key, state, context) => {
      // Only handle Enter key, let everything else pass through
      if (key === '\r' || key === '\n') { // Enter key
        const { filteredItems = [], selectedIndex = 0 } = state;
        if (filteredItems.length > 0) {
          const selectedType = filteredItems[selectedIndex];
          // Handle async operation without blocking
          this.onSelection(selectedType).catch(error => {
            output.error(`Error in type selection: ${error.message}`);
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
        lines.splice(instructionsIndex, 0, '', colorize(`⚠️  ${state.errorMessage}`, 'red'));
      }
      return lines.join('\n');
    }
    
    return output;
  }
}

module.exports = { TypeSelectionScreen };