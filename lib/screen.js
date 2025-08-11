const { ScreenRenderer, RenderUtils } = require('./renderer');
const { KeyEventManager, KeyHandlerUtils } = require('./key-handlers');
const { colorize } = require('./colors');

// Base class for interactive screens with isolated state
class Screen {
  constructor(options = {}) {
    this.id = options.id || `screen-${Date.now()}`;
    this.state = options.initialState || {};
    this.renderer = new ScreenRenderer();
    this.keyManager = new KeyEventManager();
    this.isActive = false;
    this.resolvePromise = null;
    
    // Screen configuration
    this.config = {
      hasBackNavigation: options.hasBackNavigation || false,
      hasSearch: options.hasSearch || false,
      hasEdit: options.hasEdit || false,
      breadcrumbs: options.breadcrumbs || [],
      ...options.config
    };
    
    // Bind methods to maintain context
    this.handleKeyPress = this.handleKeyPress.bind(this);
    this.render = this.render.bind(this);
    this.setState = this.setState.bind(this);
  }

  // Activate this screen
  activate() {
    if (this.isActive) return;
    
    this.isActive = true;
    this.renderer.setActive(true);
    
    // Set up key handlers
    this.setupKeyHandlers();
    
    // Initial render
    this.render(true);
  }

  // Deactivate this screen
  deactivate() {
    if (!this.isActive) return;
    
    this.isActive = false;
    this.renderer.setActive(false);
    this.keyManager.clearHandlers();
  }

  // Clean up resources
  cleanup() {
    this.deactivate();
    this.renderer.cleanup();
    
    if (this.resolvePromise) {
      this.resolvePromise(null);
      this.resolvePromise = null;
    }
  }

  // Set up key handlers - override in subclasses
  setupKeyHandlers() {
    // Default key handlers for common functionality
    this.keyManager.addHandler((key, state, context) => {
      const keyStr = key.toString();
      
      // Ctrl+C - exit
      if (keyStr === '\u0003') {
        this.exit();
        return true;
      }
      
      // Esc - go back (if navigation allowed)
      if (keyStr === '\u001b' && this.config.hasBackNavigation) {
        this.goBack();
        return true;
      }
      
      return false;
    });
  }

  // Handle key press events
  handleKeyPress(key) {
    const fs = require('fs');
    const debugLog = (msg) => fs.appendFileSync('lowkey-debug.log', `${new Date().toISOString()} ${msg}\n`);
    
    debugLog(`🔧 SCREEN DEBUG: handleKeyPress called on screen: ${this.id}`);
    debugLog(`🔧 SCREEN DEBUG: Screen isActive: ${this.isActive}`);
    
    if (!this.isActive) {
      debugLog('🔧 SCREEN DEBUG: Screen not active, ignoring key press');
      return;
    }
    
    const keyStr = key.toString();
    const context = { screen: this };
    
    debugLog(`🔧 SCREEN DEBUG: Processing key through manager, key: "${keyStr}" (charCode: ${keyStr.charCodeAt(0)}), handlers: ${this.keyManager.handlers.length}`);
    
    // Process through key manager
    const consumed = this.keyManager.processKeyPress(keyStr, this.state, context);
    debugLog(`🔧 SCREEN DEBUG: Key processing result: ${consumed ? 'consumed' : 'not consumed'}`);
  }

  // Update screen state and re-render
  setState(newState) {
    this.state = { ...this.state, ...newState };
    this.render();
  }

  // Render screen content
  render(immediate = false) {
    if (!this.isActive) return;
    
    this.renderer.render(this.state, immediate);
  }

  // Set render function
  setRenderFunction(renderFunction) {
    this.renderer.setRenderFunction(renderFunction);
  }

  // Screen lifecycle methods - override in subclasses
  onActivate() {
    // Called when screen becomes active
  }

  onDeactivate() {
    // Called when screen becomes inactive
  }

  // Navigation methods
  goBack() {
    const { TerminalManager } = require('./terminal-manager');
    const terminalManager = TerminalManager.getInstance();
    
    const previousScreen = terminalManager.popScreen();
    if (previousScreen) {
      // Successfully went back to previous screen
      if (this.resolvePromise) {
        this.resolvePromise({ action: 'back', data: null });
        this.resolvePromise = null;
      }
    } else {
      // No previous screen, exit
      this.exit();
    }
  }

  exit() {
    if (this.resolvePromise) {
      this.resolvePromise({ action: 'exit', data: null });
      this.resolvePromise = null;
    }
  }

  resolve(data) {
    if (this.resolvePromise) {
      this.resolvePromise({ action: 'complete', data });
      this.resolvePromise = null;
    }
  }

  // Promise-based interaction
  async run() {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
    });
  }
}

// Fuzzy search screen implementation
class FuzzySearchScreen extends Screen {
  constructor(options) {
    super({
      ...options,
      hasSearch: true,
      initialState: {
        query: options.initialQuery || '',
        selectedIndex: 0,
        searchMode: (options.initialQuery || '').length > 0,
        filteredItems: [],
        ...options.initialState
      }
    });
    
    this.items = options.items || [];
    this.displayFunction = options.displayFunction || null;
    this.question = options.question || 'Select an item:';
    this.errorMessage = options.errorMessage || null;
    
    // Set up render function
    this.setRenderFunction(this.renderFuzzySearch.bind(this));
  }

  setupKeyHandlers() {
    super.setupKeyHandlers();
    
    // Add fuzzy search specific handlers
    const handler = KeyHandlerUtils.createFuzzySearchKeyHandler({
      filteredItemsKey: 'filteredItems',
      hasEscape: this.config.hasBackNavigation,
      terminal: this, // Pass screen as terminal context
      onEscape: (state) => {
        this.goBack();
        return true;
      },
      onEnter: (filteredItems, selectedIndex, state) => {
        if (filteredItems.length > 0) {
          this.resolve({
            selection: filteredItems[selectedIndex],
            query: state.query || ''
          });
          return true;
        }
        return false;
      }
    });
    
    this.keyManager.addHandler(handler);
  }

  renderFuzzySearch(state) {
    const { query = '', selectedIndex = 0, searchMode = false } = state;
    const output = [];
    
    // Breadcrumbs
    if (this.config.breadcrumbs.length > 0) {
      output.push(RenderUtils.formatBreadcrumbs(this.config.breadcrumbs));
      output.push('');
    }
    
    // Question
    output.push(colorize(this.question, 'cyan'));
    
    // Search field
    const searchDisplay = RenderUtils.formatSearchDisplay(query, searchMode);
    if (searchDisplay) {
      output.push(searchDisplay);
    }
    
    output.push('');
    
    // Filter items and update state
    const filteredItems = this.fuzzySearch(query, this.items);
    if (state.filteredItems !== filteredItems) {
      this.setState({ filteredItems });
    }
    
    // Render items
    if (filteredItems.length === 0) {
      if (this.items.length === 0 && this.errorMessage) {
        output.push(colorize('(No items available)', 'yellow'));
      } else {
        output.push(colorize('No matches found', 'yellow'));
      }
    } else {
      this.renderItemList(output, filteredItems, selectedIndex, query, searchMode);
    }
    
    // Error message
    if (this.errorMessage) {
      output.push('');
      output.push(colorize(`⚠️  ${this.errorMessage}`, 'red'));
    }
    
    // Instructions
    output.push('');
    output.push(RenderUtils.formatInstructions(this.config.hasBackNavigation));
    
    return output.join('\n') + '\n';
  }

  renderItemList(output, items, selectedIndex, query, searchMode) {
    const boundedIndex = Math.max(0, Math.min(selectedIndex, items.length - 1));
    
    // Calculate pagination
    const availableHeight = RenderUtils.calculateAvailableHeight(output.length);
    const { startIndex, endIndex } = RenderUtils.calculatePaginationWindow(boundedIndex, items.length, availableHeight);
    const indicators = RenderUtils.getPaginationIndicators(startIndex, endIndex, items.length);
    
    // Previous items indicator
    if (indicators[0]) {
      output.push(indicators[0]);
    }
    
    // Render items
    for (let i = startIndex; i < endIndex; i++) {
      const item = items[i];
      let display = this.displayFunction ? this.displayFunction(item) : 
                    (typeof item === 'string' ? item : (item.Name || item.name || item));
      
      // Apply highlighting
      if (query) {
        if (this.displayFunction && item.name) {
          const highlightedName = this.highlightMatch(item.name, query);
          display = display.replace(item.name, highlightedName);
        } else {
          const name = typeof item === 'string' ? item : (item.Name || item.name || item);
          display = this.highlightMatch(name, query);
        }
      }
      
      const isSelected = i === boundedIndex && !searchMode;
      const prefix = isSelected ? colorize('> ', 'green') : '  ';
      const color = isSelected ? 'bright' : 'reset';
      
      const finalDisplay = query ? display : colorize(display, color);
      output.push(`${prefix}${finalDisplay}`);
    }
    
    // More items indicator
    if (indicators[1]) {
      output.push(indicators[1]);
    }
  }

  // Fuzzy search implementation
  fuzzySearch(query, items) {
    if (!query) return items;
    
    try {
      const regex = new RegExp(query, 'i');
      
      return items.filter(item => {
        const name = typeof item === 'string' ? item : (item.Name || item.name || item);
        return regex.test(name);
      });
      
    } catch (error) {
      // Fallback to simple text search
      const lowerQuery = query.toLowerCase();
      return items.filter(item => {
        const name = typeof item === 'string' ? item : (item.Name || item.name || item);
        return name.toLowerCase().includes(lowerQuery);
      });
    }
  }

  // Highlight matching text
  highlightMatch(text, query) {
    if (!query) return text;
    
    try {
      const regex = new RegExp(`(${query})`, 'gi');
      return text.replace(regex, colorize('$1', 'yellow'));
    } catch (error) {
      // Fallback to simple highlighting
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
}

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
    this.keys = Object.keys(this.secretData).sort();
    
    // Set up render function
    this.setRenderFunction(this.renderKeyBrowser.bind(this));
  }

  setupKeyHandlers() {
    super.setupKeyHandlers();
    
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
    
    // Breadcrumbs
    if (this.config.breadcrumbs.length > 0) {
      output.push(RenderUtils.formatBreadcrumbs(this.config.breadcrumbs));
      output.push('');
    }
    
    // Search field
    const searchDisplay = RenderUtils.formatSearchDisplay(query, searchMode);
    if (searchDisplay) {
      output.push(searchDisplay);
    }
    
    // Values toggle
    output.push(colorize(`Values: ${showValues ? 'ON' : 'OFF'} (Ctrl+V to toggle)`, 'gray'));
    output.push('');
    
    // Filter keys and update state
    const filteredKeys = this.fuzzySearch(query, this.keys);
    if (state.filteredKeys !== filteredKeys) {
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
    
    // Instructions
    output.push(RenderUtils.formatInstructions(this.config.hasBackNavigation, this.config.hasEdit));
    
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

  // Handle editing functionality
  async handleEdit(keysToEdit) {
    const fs = require('fs');
    const debugLog = (msg) => fs.appendFileSync('lowkey-debug.log', `${new Date().toISOString()} ${msg}\n`);
    
    const { TerminalManager } = require('./terminal-manager');
    const terminalManager = TerminalManager.getInstance();
    
    debugLog('🔧 DEBUG: Starting edit process');
    debugLog(`🔧 DEBUG: Terminal active before suspend: ${terminalManager.active}`);
    debugLog(`🔧 DEBUG: Current screen exists: ${!!terminalManager.currentScreen}`);
    debugLog(`🔧 DEBUG: Screen stack length: ${terminalManager.screenStack.length}`);
    
    try {
      // Temporarily suspend terminal management for editor
      debugLog('🔧 DEBUG: Suspending terminal...');
      terminalManager.suspend();
      debugLog(`🔧 DEBUG: Terminal suspended, active: ${terminalManager.active}`);
      
      let editorPromise;
      if (this.secretType === 'env') {
        const { editWithEditor } = require('./interactive');
        editorPromise = editWithEditor(this.secretData, keysToEdit);
      } else if (this.secretType === 'json') {
        const { editWithJsonEditor } = require('./interactive');
        editorPromise = editWithJsonEditor(this.secretData, keysToEdit);
      } else if (this.secretType === 'aws-secrets-manager') {
        const { editAwsSecret } = require('./interactive');
        editorPromise = editAwsSecret(this.secretData, keysToEdit, this.secretName, this.region);
      }

      if (editorPromise) {
        debugLog('🔧 DEBUG: Editor promise created, waiting for editor to exit...');
        const editedData = await editorPromise;
        debugLog(`🔧 DEBUG: Editor exited, editedData: ${editedData !== null ? 'has changes' : 'no changes'}`);
        
        if (editedData !== null) {
          // Update the secretData with edited values
          Object.assign(this.secretData, editedData);

          // Save changes back to the original file (only for local files, not AWS)
          if (this.secretName && this.secretType !== 'aws-secrets-manager') {
            try {
              let newContent;
              if (this.secretType === 'env') {
                const { generateEnvContent } = require('./secrets');
                newContent = generateEnvContent(this.secretData);
              } else if (this.secretType === 'json') {
                const { generateJsonContent } = require('./secrets');
                newContent = generateJsonContent(this.secretData);
              }

              if (newContent) {
                fs.writeFileSync(this.secretName, newContent);
                debugLog('🔧 DEBUG: Changes saved to file');
              }
            } catch (saveError) {
              debugLog(`🔧 DEBUG: Error saving file: ${saveError.message}`);
            }
          }
        }
      }
      
    } catch (error) {
      debugLog(`🔧 DEBUG: Error in edit process: ${error.message}`);
    } finally {
      debugLog('🔧 DEBUG: In finally block, about to resume terminal...');
      debugLog(`🔧 DEBUG: Terminal active before resume: ${terminalManager.active}`);
      debugLog(`🔧 DEBUG: Current screen exists before resume: ${!!terminalManager.currentScreen}`);
      
      // Resume terminal management and re-render
      terminalManager.resume();
      
      debugLog(`🔧 DEBUG: Terminal resumed, active: ${terminalManager.active}`);
      debugLog(`🔧 DEBUG: Current screen exists after resume: ${!!terminalManager.currentScreen}`);
      debugLog('🔧 DEBUG: Edit process complete');
    }
  }
}

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
      const { listAwsSecrets } = require('./aws');
      const { listEnvFiles, listJsonFiles } = require('./files');
      
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
      const { TerminalManager } = require('./terminal-manager');
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
      const fs = require('fs');
      const debugLog = (msg) => fs.appendFileSync('lowkey-debug.log', `${new Date().toISOString()} ${msg}\n`);
      
      debugLog(`🔧 TYPE SELECTION HANDLER DEBUG: Received key: "${key}" (charCode: ${key.charCodeAt(0)})`);
      
      // Only handle Enter key, let everything else pass through
      if (key === '\r' || key === '\n') { // Enter key
        debugLog('🔧 TYPE SELECTION DEBUG: Enter key detected, processing selection');
        const { filteredItems = [], selectedIndex = 0 } = state;
        if (filteredItems.length > 0) {
          const selectedType = filteredItems[selectedIndex];
          debugLog(`🔧 TYPE SELECTION DEBUG: Selected type: ${selectedType.name}`);
          // Handle async operation without blocking
          this.onSelection(selectedType).catch(error => {
            debugLog(`🔧 TYPE SELECTION DEBUG: Error in onSelection: ${error.message}`);
          });
          return true; // Consume the key press
        }
      }
      debugLog(`🔧 TYPE SELECTION HANDLER DEBUG: Not an Enter key, returning false`);
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
        lines.splice(instructionsIndex, 0, '', require('./colors').colorize(`⚠️  ${state.errorMessage}`, 'red'));
      }
      return lines.join('\n');
    }
    
    return output;
  }
}

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
          return `${choice.name} ${require('./colors').colorize(`(${choice.lastChanged})`, 'gray')}`;
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
      const { fetchSecret, parseSecretData } = require('./secrets');
      const { colorize } = require('./colors');
      
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
      const { TerminalManager } = require('./terminal-manager');
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
      const { colorize } = require('./colors');
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

module.exports = {
  Screen,
  FuzzySearchScreen,
  KeyBrowserScreen,
  TypeSelectionScreen,
  SecretSelectionScreen
};