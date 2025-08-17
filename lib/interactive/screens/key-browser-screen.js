const { Screen } = require('./base-screen');
const { output } = require('../terminal-utils');
const { KeyHandlerUtils } = require('../key-handlers');
const { RenderUtils } = require('../renderer');
const { colorize } = require('../../core/colors');
const { NavigationComponents, SearchComponents, ListComponents, StatusComponents } = require('../ui-components');
const { getPopupManager } = require('../popup-manager');
const AwsProfilePopup = require('./aws-profile-screen');

// Key browser screen implementation
class KeyBrowserScreen extends Screen {
  constructor(options) {
    super({
      ...options,
      hasSearch: true,
      hasEdit: options.hasEdit || false,
      initialState: {
        query: '',
        selectedIndex: 0,
        searchMode: false,
        showValues: options.initialShowValues || false,
        filteredKeys: [],
        ...options.initialState
      }
    });
    
    this.secretData = options.secretData || {};
    this.secretType = options.secretType || null;
    this.secretName = options.secretName || null;
    this.region = options.region || null;
    this.namespace = options.namespace || null;
    this.context = options.context || null;
    this.originalOptions = options; // Store for refresh
    this.keys = Object.keys(this.secretData).sort();
    
    // Set up render function
    this.setRenderFunction(this.renderKeyBrowser.bind(this));
  }

  // Refresh the secret data when screen becomes active
  async onActivate() {
    await this.refreshSecretData();
  }

  async refreshSecretData() {
    try {
      const { fetchSecret, parseSecretData } = require('../../utils/secrets');
      
      const fetchOptions = {
        inputType: this.secretType,
        inputName: this.secretName,
        region: this.region,
        path: this.originalOptions?.path,
        namespace: this.namespace,
        context: this.context
      };
      
      const secretString = await fetchSecret(fetchOptions);
      const secretData = parseSecretData(secretString);
      
      if (typeof secretData === 'object' && secretData !== null) {
        this.secretData = secretData;
        this.keys = Object.keys(secretData).sort();
        
        // Apply current filter
        const query = this.state.query || '';
        const filteredKeys = query ? this.keys.filter(key => 
          key.toLowerCase().includes(query.toLowerCase())
        ) : this.keys;
        
        // Update the state with new data
        this.setState({ filteredKeys });
      }
    } catch (error) {
      // If refresh fails, we'll continue with the old data
      // Could add error handling here if needed
    }
  }

  setupKeyHandlers() {
    super.setupKeyHandlers();
    
    // Add Ctrl+A handler for AWS profile/region selection
    const awsProfileHandler = (keyStr, state) => {
      if (keyStr === '\u0001') { // Ctrl+A
        this.showAwsProfilePopup();
        return true;
      }
      return false;
    };
    
    this.keyManager.addHandler(awsProfileHandler);
    
    // Add Ctrl+S handler for copy wizard FIRST (higher priority)
    const copyHandler = (keyStr, state) => {
      if (keyStr === '\u0013') { // Ctrl+S (ASCII 19)
        const { searchMode = false, query = '', filteredKeys = [] } = state;
        if (!searchMode) {
          // Launch copy wizard with current filtered keys (don't await)
          this.launchCopyWizard(query ? filteredKeys : null);
          return true;
        }
      }
      return false;
    };
    
    this.keyManager.addHandler(copyHandler);
    
    // Add key browser specific handlers
    const handler = KeyHandlerUtils.createInteractiveBrowserKeyHandler({
      secretData: this.secretData,
      filteredItemsKey: 'filteredKeys',
      hasEscape: this.config.hasBackNavigation,
      hasEdit: this.config.hasEdit,
      hasToggle: true,
      terminal: this,
      onEscape: (state) => {
        this.goBack();
        return true;
      },
      onToggle: (state) => {
        const { showValues = false } = state;
        return { showValues: !showValues };
      },
      onEdit: async (secretData, keysToEdit, terminal) => {
        // Handle editing logic here
        await this.handleEdit(keysToEdit);
      }
    });
    
    this.keyManager.addHandler(handler);
  }

  renderKeyBrowser(state) {
    const { query = '', selectedIndex = 0, searchMode = false, showValues = false } = state;
    const output = [];
    
    // Breadcrumbs using NavigationComponents
    if (this.config.breadcrumbs.length > 0) {
      output.push(NavigationComponents.renderBreadcrumbs(this.config.breadcrumbs));
      output.push('');
    }
    
    // Search field using SearchComponents
    const searchDisplay = SearchComponents.renderSearchInput(query, searchMode, 'Type to filter keys...');
    if (searchDisplay) {
      output.push(searchDisplay);
    }
    
    // Values toggle
    output.push(colorize(`Values: ${showValues ? 'ON' : 'OFF'} (Ctrl+V to toggle)`, 'gray'));
    output.push('');
    
    // Filter keys and update state only if they've changed
    const filteredKeys = this.fuzzySearch(query, this.keys);
    
    // Check if filtered keys have actually changed (deep comparison for arrays)
    const keysChanged = !state.filteredKeys || 
                        state.filteredKeys.length !== filteredKeys.length ||
                        state.filteredKeys.some((key, index) => key !== filteredKeys[index]);
    
    if (keysChanged) {
      this.setState({ filteredKeys });
    }
    
    // Render keys
    if (filteredKeys.length === 0) {
      output.push(colorize('No matches found', 'yellow'));
    } else {
      this.renderKeyList(output, filteredKeys, selectedIndex, query, searchMode, showValues);
    }
    
    // Footer info
    output.push('');
    output.push(colorize(`Showing ${filteredKeys.length} of ${this.keys.length} keys`, 'gray'));
    output.push('');
    
    // Instructions using NavigationComponents
    const instructions = NavigationComponents.getNavigationInstructions({
      hasBackNavigation: this.config.hasBackNavigation,
      hasSearch: true,
      hasEdit: this.config.hasEdit,
      hasToggle: true,
      hasCopy: true
    });
    output.push(instructions);
    
    return output.join('\n') + '\n';
  }

  renderKeyList(output, keys, selectedIndex, query, searchMode, showValues) {
    const boundedIndex = Math.max(0, Math.min(selectedIndex, keys.length - 1));
    
    // Calculate pagination
    const availableHeight = RenderUtils.calculateAvailableHeight(output.length);
    const { startIndex, endIndex } = RenderUtils.calculatePaginationWindow(boundedIndex, keys.length, availableHeight);
    const indicators = RenderUtils.getPaginationIndicators(startIndex, endIndex, keys.length);
    
    // Previous items indicator
    if (indicators[0]) {
      output.push(indicators[0]);
    }
    
    // Render keys
    for (let i = startIndex; i < endIndex; i++) {
      const key = keys[i];
      const isSelected = i === boundedIndex && !searchMode;
      const prefix = isSelected ? colorize('> ', 'green') : '  ';
      const keyColor = isSelected ? 'bright' : 'reset';
      
      // Apply highlighting to the key
      const displayKey = query ? this.highlightMatch(key, query) : colorize(key, keyColor);
      
      if (showValues) {
        const value = this.secretData[key];
        const displayValue = String(value);
        const truncatedValue = RenderUtils.truncateValue(displayValue);
        output.push(`${prefix}${displayKey}: ${colorize(truncatedValue, 'cyan')}`);
      } else {
        output.push(`${prefix}${displayKey}`);
      }
    }
    
    // More items indicator
    if (indicators[1]) {
      output.push(indicators[1]);
    }
  }

  // Fuzzy search for keys
  fuzzySearch(query, keys) {
    if (!query) return keys;
    
    try {
      const regex = new RegExp(query, 'i');
      return keys.filter(key => regex.test(key));
    } catch (error) {
      const lowerQuery = query.toLowerCase();
      return keys.filter(key => key.toLowerCase().includes(lowerQuery));
    }
  }

  // Highlight matching text
  highlightMatch(text, query) {
    if (!query) return text;
    
    try {
      const regex = new RegExp(`(${query})`, 'gi');
      return text.replace(regex, colorize('$1', 'yellow'));
    } catch (error) {
      const lowerText = text.toLowerCase();
      const lowerQuery = query.toLowerCase();
      const index = lowerText.indexOf(lowerQuery);
      
      if (index !== -1) {
        const before = text.substring(0, index);
        const match = text.substring(index, index + query.length);
        const after = text.substring(index + query.length);
        return before + colorize(match, 'yellow') + after;
      }
      
      return text;
    }
  }

  // Launch copy wizard
  async launchCopyWizard(filteredKeys = null) {
    try {
      const { CopyWizardScreen } = require('./copy-wizard-screen');
      const { TerminalManager } = require('../terminal-manager');
      const terminalManager = TerminalManager.getInstance();
      
      // Use filtered keys if provided, otherwise use all keys
      const keysToExport = filteredKeys || Object.keys(this.secretData);
      
      // Create copy wizard screen
      const wizardScreen = new CopyWizardScreen({
        secretData: this.secretData,
        filteredKeys: keysToExport,
        sourceType: this.secretType,
        sourceName: this.secretName,
        region: this.region,
        namespace: this.namespace,
        context: this.context,
        breadcrumbs: this.config.breadcrumbs,
        hasBackNavigation: true
      });
      
      // Use TerminalManager to push the wizard screen
      terminalManager.pushScreen(wizardScreen);
      
    } catch (error) {
      // Silent error for now - could add UI notification later
      throw error;
    }
  }

  // Update secret data with subset editing logic
  updateSecretDataSubset(editedData) {
    const keysToEdit = this.originalKeysToEdit;
    
    if (!keysToEdit) {
      // If no subset was specified, replace all data (full edit)
      this.secretData = { ...editedData };
      return;
    }
    
    // Subset editing: surgical updates only
    
    // 1. Remove keys that were in the editing scope but are now missing (deletions)
    keysToEdit.forEach(key => {
      if (!(key in editedData)) {
        delete this.secretData[key];
      }
    });
    
    // 2. Add/update keys from the edited data
    Object.keys(editedData).forEach(key => {
      this.secretData[key] = editedData[key];
    });
  }

  // Handle editing functionality
  async handleEdit(keysToEdit) {
    // Store the original keys that were sent to editor for proper deletion handling
    this.originalKeysToEdit = keysToEdit;
    const { TerminalManager } = require('../terminal-manager');
    const terminalManager = TerminalManager.getInstance();
    
    try {
      // Stop rendering before suspending
      this.renderer.setActive(false);
      
      // Temporarily suspend terminal management for editor
      terminalManager.suspend();
      
      // Add a small delay to ensure terminal is fully suspended
      await new Promise(resolve => setTimeout(resolve, 100));
      
      let editorPromise;
      if (this.secretType === 'env') {
        const { editWithEditor } = require('../interactive');
        editorPromise = editWithEditor(this.secretData, keysToEdit);
      } else if (this.secretType === 'json') {
        const { editWithJsonEditor } = require('../interactive');
        editorPromise = editWithJsonEditor(this.secretData, keysToEdit);
      } else if (this.secretType === 'aws-secrets-manager') {
        const { editAwsSecret } = require('../interactive');
        editorPromise = editAwsSecret(this.secretData, keysToEdit, this.secretName, this.region);
      } else if (this.secretType === 'kubernetes') {
        const { editKubernetesSecret } = require('../interactive');
        editorPromise = editKubernetesSecret(this.secretData, keysToEdit, this.secretName, this.namespace);
      }

      if (editorPromise) {
        const editedData = await editorPromise;
        
        if (editedData !== null) {
          // Handle subset editing: only update keys that were in the editing scope
          this.updateSecretDataSubset(editedData);

          // Save changes back to the original file (only for local files, not AWS)
          if (this.secretName && this.secretType !== 'aws-secrets-manager') {
            try {
              const fs = require('fs');
              let newContent;
              if (this.secretType === 'env') {
                const { generateEnvContent } = require('../../utils/secrets');
                newContent = generateEnvContent(this.secretData);
              } else if (this.secretType === 'json') {
                const { generateJsonContent } = require('../../utils/secrets');
                newContent = generateJsonContent(this.secretData);
              }

              if (newContent) {
                fs.writeFileSync(this.secretName, newContent);
              }
            } catch (saveError) {
              // Don't use console.error as it bypasses alternate screen buffer
              // For now, silently continue - could add UI notification later
            }
          }

          // Update keys list and refresh display after successful edit
          this.keys = Object.keys(this.secretData).sort();
          
          // Apply current filter to show updated keys (including any new ones)
          const query = this.state.query || '';
          const filteredKeys = query ? this.keys.filter(key => 
            key.toLowerCase().includes(query.toLowerCase())
          ) : this.keys;
          
          // Update state to reflect new keys
          this.setState({ filteredKeys });
        }
      }
      
    } catch (error) {
      output.error(`Error in edit process: ${error.message}`);
    } finally {
      // Resume terminal management
      terminalManager.resume();
      
      // Wait a bit for terminal to stabilize, then reactivate renderer
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Reactivate renderer and force a clean re-render
      this.renderer.setActive(true);
      this.render(true);
    }
  }

  showAwsProfilePopup() {
    const popupManager = getPopupManager();
    const popup = new AwsProfilePopup({
      onConfigChange: (config) => {
        // Handle configuration change - could refresh data or update display
        console.log('AWS configuration changed:', config);
        
        // Update region for future operations
        this.region = config.region;
      }
    });
    
    popupManager.showPopup(popup, this);
  }
}

module.exports = { KeyBrowserScreen };