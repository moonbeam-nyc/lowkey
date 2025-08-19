/**
 * Key Browser Screen (Component-based version)
 * 
 * This demonstrates how even the most complex screen becomes cleaner
 * with the declarative component system. Features include:
 * - Searchable key listing with highlighting
 * - Value visibility toggle
 * - Editing functionality
 * - Copy wizard integration
 * - AWS profile management
 * - Automatic pagination
 * 
 * Compare to the original key-browser-screen.js to see the transformation.
 */

const { ComponentScreen } = require('./component-screen');
const { 
  Title, 
  Spacer, 
  SearchInput, 
  List, 
  InstructionsFromOptions,
  ErrorText,
  SuccessText,
  Text,
  LabeledValue,
  Breadcrumbs
} = require('../component-system');

class KeyBrowserScreen extends ComponentScreen {
  constructor(options) {
    super({
      id: 'key-browser',
      hasBackNavigation: true,
      hasSearch: true,
      hasEdit: options.hasEdit || false,
      breadcrumbs: options.breadcrumbs || [],
      initialState: {
        selectedIndex: 0,
        searchMode: false,
        query: '',
        showValues: options.initialShowValues || false,
        filteredKeys: [],
        errorMessage: null,
        successMessage: null,
        isRefreshing: false
      }
    });

    this.secretData = options.secretData || {};
    this.secretType = options.secretType || null;
    this.secretName = options.secretName || null;
    this.region = options.region || null;
    this.namespace = options.namespace || null;
    this.context = options.context || null;
    this.originalOptions = options;
    this.keys = Object.keys(this.secretData).sort();
    this.originalKeysToEdit = null; // For subset editing
  }

  /**
   * Declare what to display
   */
  getComponents(state) {
    const { selectedIndex, searchMode, query, showValues, filteredKeys, errorMessage, successMessage, isRefreshing } = state;
    
    const components = [];
    
    // Breadcrumbs subheader - show the navigation path
    if (this.config.breadcrumbs && this.config.breadcrumbs.length > 0) {
      components.push(Breadcrumbs(this.config.breadcrumbs, ' > '));
    }
    
    // Search input (only show if search is active or has query)
    if (searchMode || query) {
      components.push(SearchInput(query, searchMode, 'Type to filter keys...'));
    }
    
    // Values toggle indicator
    components.push(Text(`Values: ${showValues ? 'ON' : 'OFF'} (Ctrl+V to toggle)`, 'gray'));
    components.push(Spacer());
    
    // Refreshing indicator
    if (isRefreshing) {
      components.push(Text('Refreshing secret data...', 'yellow'));
      components.push(Spacer());
    }
    
    // Success message
    if (successMessage) {
      components.push(SuccessText(successMessage));
      components.push(Spacer());
    }
    
    // Error message
    if (errorMessage) {
      components.push(ErrorText(errorMessage));
      components.push(Spacer());
    }
    
    // Key list
    if (filteredKeys.length === 0) {
      const emptyMessage = this.keys.length === 0 
        ? 'No keys found in this secret'
        : 'No matching keys found';
      components.push(Text(emptyMessage, 'yellow'));
    } else {
      components.push(List(
        filteredKeys,
        selectedIndex,
        {
          paginate: true,
          displayFunction: (key) => {
            if (showValues) {
              const value = this.secretData[key];
              const displayValue = String(value);
              // Truncate long values for display
              const truncatedValue = displayValue.length > 50 
                ? displayValue.substring(0, 47) + '...'
                : displayValue;
              return `${key}: ${truncatedValue}`;
            }
            return key;
          },
          searchQuery: query, // Enable search highlighting
          emptyMessage: 'No keys available'
        }
      ));
    }
    
    components.push(Spacer());
    
    // Footer info
    components.push(LabeledValue('Showing', `${filteredKeys.length} of ${this.keys.length} keys`));
    components.push(Spacer());
    
    // Instructions
    const instructionOptions = {
      hasSearch: true,
      hasBackNavigation: true,
      hasEdit: this.config.hasEdit,
      hasToggle: true,
      hasCopy: true
    };
    
    // No need for AWS-specific instructions since Ctrl+A is now global
    
    components.push(InstructionsFromOptions(instructionOptions));
    
    return components;
  }

  /**
   * Set up key handlers
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
      
      // Value toggle
      .onKey('\u0016', () => { // Ctrl+V
        const { showValues } = this.state;
        this.setState({ 
          showValues: !showValues
        });
        return true;
      })
      
      // Copy wizard
      .onKey('\u0013', () => { // Ctrl+S
        if (!this.state.searchMode) {
          const { query, filteredKeys } = this.state;
          this.launchCopyWizard(query ? filteredKeys : null);
        }
        return true;
      })
      
      // Editing
      .onKey('e', () => {
        if (!this.state.searchMode && this.config.hasEdit) {
          const { query, filteredKeys } = this.state;
          this.handleEdit(query ? filteredKeys : null);
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
      
      
      // Enter - no specific action for key browser
      .onEnter(() => {
        const { searchMode } = this.state;
        
        // Clear messages
        if (this.state.errorMessage || this.state.successMessage) {
          this.setState({ errorMessage: null, successMessage: null });
        }
        
        // If in search mode, exit search mode
        if (searchMode) {
          this.setState({ searchMode: false });
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
   * Screen lifecycle
   */
  async onActivate() {
    await this.refreshSecretData();
  }

  /**
   * Business logic methods
   */
  
  navigateUp() {
    const { selectedIndex, filteredKeys } = this.state;
    const newIndex = this.navigateToIndex(selectedIndex - 1, filteredKeys.length);
    this.setState({ selectedIndex: newIndex });
  }
  
  navigateDown() {
    const { selectedIndex, filteredKeys } = this.state;
    const newIndex = this.navigateToIndex(selectedIndex + 1, filteredKeys.length);
    this.setState({ selectedIndex: newIndex });
  }
  
  pageUp() {
    const { selectedIndex, filteredKeys } = this.state;
    const newIndex = this.pageUp(selectedIndex);
    this.setState({ selectedIndex: this.navigateToIndex(newIndex, filteredKeys.length) });
  }
  
  pageDown() {
    const { selectedIndex, filteredKeys } = this.state;
    const newIndex = this.pageDown(selectedIndex, 10, filteredKeys.length);
    this.setState({ selectedIndex: newIndex });
  }
  
  updateSearch(newQuery) {
    const filteredKeys = this.fuzzySearch(newQuery, this.keys);
    this.setState({ 
      query: newQuery,
      filteredKeys,
      selectedIndex: 0 // Reset selection
    });
  }
  
  async refreshSecretData() {
    try {
      this.setState({ isRefreshing: true, errorMessage: null });
      
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
        const filteredKeys = this.fuzzySearch(query, this.keys);
        
        this.setState({ 
          filteredKeys,
          isRefreshing: false,
          selectedIndex: 0 // Reset selection after refresh
        });
      }
    } catch (error) {
      this.setState({ 
        errorMessage: `Failed to refresh secret data: ${error.message}`,
        isRefreshing: false
      });
    }
  }
  
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
      this.setState({ errorMessage: `Failed to launch copy wizard: ${error.message}` });
    }
  }
  
  async handleEdit(keysToEdit = null) {
    // Store the original keys that were sent to editor for proper deletion handling
    this.originalKeysToEdit = keysToEdit;
    const { TerminalManager } = require('../terminal-manager');
    const terminalManager = TerminalManager.getInstance();
    
    try {
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

          // Save changes back to the original file (only for local files, not AWS/K8s)
          if (this.secretName && this.secretType !== 'aws-secrets-manager' && this.secretType !== 'kubernetes') {
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
              this.setState({ errorMessage: `Failed to save changes: ${saveError.message}` });
              return;
            }
          }

          // Update keys list and refresh display after successful edit
          this.keys = Object.keys(this.secretData).sort();
          
          // Apply current filter to show updated keys (including any new ones)
          const query = this.state.query || '';
          const filteredKeys = this.fuzzySearch(query, this.keys);
          
          // Update state to reflect new keys
          this.setState({ 
            filteredKeys,
            successMessage: 'Changes saved successfully',
            selectedIndex: 0 // Reset selection
          });
          
          // Clear success message after a delay
          setTimeout(() => {
            this.setState({ successMessage: null });
          }, 3000);
        }
      }
      
    } catch (error) {
      this.setState({ errorMessage: `Error during edit: ${error.message}` });
    } finally {
      // Resume terminal management
      terminalManager.resume();
      
      // Wait a bit for terminal to stabilize, then trigger re-render
      await new Promise(resolve => setTimeout(resolve, 100));
      this.render();
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
  
  // Handle AWS config changes (called by global handler)
  onAwsConfigChange(config) {
    // Update region for future operations
    this.region = config.region;
    this.setState({ successMessage: 'AWS configuration updated' });
    
    // Clear success message after a delay
    setTimeout(() => {
      this.setState({ successMessage: null });
    }, 2000);
  }
}

module.exports = { KeyBrowserScreen };