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
        isRefreshing: false,
        selectedKeys: new Set(),
        inMultiSelectMode: false
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
    const { selectedIndex, searchMode, query, showValues, filteredKeys, errorMessage, successMessage, isRefreshing, selectedKeys, inMultiSelectMode } = state;
    
    const components = [];
    
    // Breadcrumbs subheader - show the navigation path
    if (this.config.breadcrumbs && this.config.breadcrumbs.length > 0) {
      components.push(Breadcrumbs(this.config.breadcrumbs, ' > '));
    }
    
    // Search input (only show if search is active or has query)
    if (searchMode || query) {
      components.push(SearchInput(query, searchMode, 'Type to filter... (Esc to exit)'));
      components.push(Spacer());
    }
    
    // Values toggle and multi-select indicator
    let statusText = `Values: ${showValues ? 'ON' : 'OFF'} (Ctrl+V to toggle)`;
    if (inMultiSelectMode) {
      const selectedCount = selectedKeys.size;
      statusText += ` | Selected: ${selectedCount} key${selectedCount === 1 ? '' : 's'}`;
    }
    components.push(Text(statusText, 'gray'));
    components.push(Spacer());
    
    // Refreshing indicator
    if (isRefreshing) {
      components.push(Text('Refreshing secret data...', 'yellow'));
      components.push(Spacer());
    }
    
    // No changes message (yellow/neutral)
    if (this.noChangesMessage) {
      components.push(Text(this.noChangesMessage, 'yellow'));
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
            const isSelected = selectedKeys.has(key);
            let displayText;
            
            if (showValues) {
              const value = this.secretData[key];
              const displayValue = String(value);
              // Truncate long values for display
              const truncatedValue = displayValue.length > 50 
                ? displayValue.substring(0, 47) + '...'
                : displayValue;
              displayText = `${key}: ${truncatedValue}`;
            } else {
              displayText = key;
            }
            
            // Add visual indicator for selected keys
            if (isSelected) {
              displayText = `✓ ${displayText}`;
            }
            
            return displayText;
          },
          searchQuery: query, // Enable search highlighting
          emptyMessage: 'No keys available',
          showSelectionIndicator: !searchMode // Hide cursor when in search mode
        }
      ));
    }
    
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
      
      // Exit search mode, clear selection, clear query, or go back
      .onEscape(() => {
        const { searchMode, query, inMultiSelectMode } = this.state;
        if (searchMode) {
          // Exit search mode
          this.setState({ searchMode: false });
          return true;
        } else if (inMultiSelectMode) {
          // Clear multi-selection mode
          this.clearSelection();
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
          this.handleBase64FileEdit();
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
          const { filteredKeys } = this.state;
          if (filteredKeys.length > 0) {
            this.setState({ selectedIndex: filteredKeys.length - 1 });
          }
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
          this.launchCopyWizard();
        }
        return true;
      })
      
      // Delete keys
      .onKey('\u0004', () => { // Ctrl+D
        if (!this.state.searchMode) {
          this.handleDeleteKeys();
        }
        return true;
      })
      
      // Toggle key selection
      .onKey(' ', () => { // Spacebar
        if (!this.state.searchMode) {
          this.toggleKeySelection();
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
    const newIndex = Math.max(0, selectedIndex - 10);
    this.setState({ selectedIndex: newIndex });
  }
  
  pageDown() {
    const { selectedIndex, filteredKeys } = this.state;
    const newIndex = Math.min(filteredKeys.length - 1, selectedIndex + 10);
    this.setState({ selectedIndex: newIndex });
  }

  /**
   * Multi-select helper methods
   */
  toggleKeySelection() {
    const { selectedIndex, filteredKeys, selectedKeys } = this.state;
    
    if (filteredKeys.length === 0) {
      return;
    }
    
    const currentKey = filteredKeys[selectedIndex];
    const newSelectedKeys = new Set(selectedKeys);
    
    if (newSelectedKeys.has(currentKey)) {
      newSelectedKeys.delete(currentKey);
    } else {
      newSelectedKeys.add(currentKey);
    }
    
    this.setState({ 
      selectedKeys: newSelectedKeys,
      inMultiSelectMode: newSelectedKeys.size > 0
    });
  }
  
  clearSelection() {
    this.setState({ 
      selectedKeys: new Set(),
      inMultiSelectMode: false 
    });
  }
  
  handleDeleteKeys() {
    const { selectedKeys, selectedIndex, filteredKeys, inMultiSelectMode } = this.state;
    
    let keysToDelete;
    if (inMultiSelectMode && selectedKeys.size > 0) {
      // Delete all selected keys
      keysToDelete = Array.from(selectedKeys);
    } else if (filteredKeys.length > 0) {
      // Delete the currently focused key
      keysToDelete = [filteredKeys[selectedIndex]];
    } else {
      // No keys to delete
      return;
    }
    
    // Show delete confirmation popup
    this.showDeleteKeysConfirmation(keysToDelete);
  }
  
  showDeleteKeysConfirmation(keysToDelete) {
    try {
      const { DeleteKeysConfirmationPopup } = require('./delete-keys-confirmation-screen');
      const { getPopupManager } = require('../popup-manager');
      const popupManager = getPopupManager();
      
      const deletePopup = new DeleteKeysConfirmationPopup({
        keysToDelete: keysToDelete,
        secretName: this.secretName,
        onConfirm: async () => {
          await this.performDeleteKeys(keysToDelete);
        },
        onCancel: () => {
          popupManager.closePopup();
        }
      });
      
      popupManager.showPopup(deletePopup, this);
      
    } catch (error) {
      this.setState({ errorMessage: `Error opening delete confirmation: ${error.message}` });
    }
  }
  
  async performDeleteKeys(keysToDelete) {
    const fs = require('fs');
    const path = require('path');
    
    try {
      // Create updated secret data with keys removed
      const updatedSecretData = { ...this.secretData };
      keysToDelete.forEach(key => {
        delete updatedSecretData[key];
      });

      if (this.secretType === 'env') {
        await this.deleteKeysFromEnvFile(keysToDelete, updatedSecretData);
      } else if (this.secretType === 'json') {
        await this.deleteKeysFromJsonFile(keysToDelete, updatedSecretData);
      } else if (this.secretType === 'aws-secrets-manager') {
        await this.deleteKeysFromAwsSecret(keysToDelete, updatedSecretData);
      } else if (this.secretType === 'kubernetes') {
        await this.deleteKeysFromKubernetesSecret(keysToDelete, updatedSecretData);
      } else {
        throw new Error(`Unsupported secret type: ${this.secretType}`);
      }

      // Update local state with new data
      this.secretData = updatedSecretData;
      this.keys = Object.keys(this.secretData).sort();
      
      // Update filtered keys to remove deleted ones
      const { query } = this.state;
      const newFilteredKeys = this.fuzzySearch(query || '', this.keys);
      
      this.setState({ 
        filteredKeys: newFilteredKeys,
        selectedKeys: new Set(),
        inMultiSelectMode: false,
        selectedIndex: Math.min(this.state.selectedIndex, Math.max(0, newFilteredKeys.length - 1)),
        successMessage: `Deleted ${keysToDelete.length} key${keysToDelete.length === 1 ? '' : 's'} successfully`
      });
      
    } catch (error) {
      this.setState({ 
        errorMessage: `Error deleting keys: ${error.message}`,
        selectedKeys: new Set(),
        inMultiSelectMode: false
      });
    }
  }

  async deleteKeysFromEnvFile(keysToDelete, updatedSecretData) {
    const fs = require('fs');
    const path = require('path');
    const { generateEnvContent } = require('../../utils/secrets');
    
    const filePath = this.secretName;
    const backupPath = `${filePath}.bak`;
    
    try {
      // Create backup
      if (fs.existsSync(filePath)) {
        fs.copyFileSync(filePath, backupPath);
      }
      
      // Generate new env content
      const envContent = generateEnvContent(updatedSecretData);
      
      // Write updated content
      fs.writeFileSync(filePath, envContent, 'utf8');
      
      // Remove backup on success
      if (fs.existsSync(backupPath)) {
        fs.unlinkSync(backupPath);
      }
      
    } catch (error) {
      // Restore backup on failure
      if (fs.existsSync(backupPath)) {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
        fs.renameSync(backupPath, filePath);
      }
      throw error;
    }
  }

  async deleteKeysFromJsonFile(keysToDelete, updatedSecretData) {
    const fs = require('fs');
    const path = require('path');
    
    const filePath = this.secretName;
    const backupPath = `${filePath}.bak`;
    
    try {
      // Create backup
      if (fs.existsSync(filePath)) {
        fs.copyFileSync(filePath, backupPath);
      }
      
      // Write updated JSON content
      const jsonContent = JSON.stringify(updatedSecretData, null, 2);
      fs.writeFileSync(filePath, jsonContent, 'utf8');
      
      // Remove backup on success
      if (fs.existsSync(backupPath)) {
        fs.unlinkSync(backupPath);
      }
      
    } catch (error) {
      // Restore backup on failure
      if (fs.existsSync(backupPath)) {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
        fs.renameSync(backupPath, filePath);
      }
      throw error;
    }
  }

  async deleteKeysFromAwsSecret(keysToDelete, updatedSecretData) {
    const { uploadToAwsSecretsManager } = require('../../providers/aws');
    
    // AWS: Atomic batch update - either all succeeds or all fails
    await uploadToAwsSecretsManager(
      updatedSecretData, 
      this.secretName, 
      this.region, 
      'AWSCURRENT', 
      true // autoYes - don't prompt for creation since we're updating
    );
  }

  async deleteKeysFromKubernetesSecret(keysToDelete, updatedSecretData) {
    const kubernetes = require('../../providers/kubernetes');
    
    // Kubernetes: Atomic batch update - either all succeeds or all fails
    await kubernetes.setSecret(
      this.secretName, 
      updatedSecretData, 
      this.namespace, 
      this.context
    );
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
  
  async launchCopyWizard() {
    try {
      const { CopyWizardScreen } = require('./copy-wizard-screen');
      const { TerminalManager } = require('../terminal-manager');
      const terminalManager = TerminalManager.getInstance();
      
      const { selectedKeys, inMultiSelectMode } = this.state;
      
      // Determine keys to export based on selection state
      let keysToExport;
      
      if (inMultiSelectMode && selectedKeys.size > 0) {
        // Multi-select mode: copy selected keys
        keysToExport = Array.from(selectedKeys).sort();
        const debugLogger = require('../../core/debug-logger');
        debugLogger.log('KeyBrowserScreen.launchCopyWizard', 'Multi-select mode - copying selected keys', { keysToExport, selectedKeysSize: selectedKeys.size });
      } else {
        // No selection: copy all keys
        keysToExport = Object.keys(this.secretData).sort();
        const debugLogger = require('../../core/debug-logger');
        debugLogger.log('KeyBrowserScreen.launchCopyWizard', 'No selection - copying all keys', { keysToExport, totalKeys: keysToExport.length });
      }
      
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
        const result = await editorPromise;
        
        if (result !== null) {
          // Handle new result format that includes change detection
          if (result && typeof result === 'object' && 'changed' in result) {
            if (!result.changed) {
              this.setState({ errorMessage: null, successMessage: null });
              // Use a custom message that will be rendered in yellow
              this.noChangesMessage = 'No changes made, not saving';
              // Clear message after delay
              setTimeout(() => {
                this.noChangesMessage = null;
                this.render();
              }, 3000);
              this.render();
              return;
            }
            // Use the actual edited data
            const editedData = result.data;
            
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
          } else {
            // Legacy format - backward compatibility
            const editedData = result;
            this.updateSecretDataSubset(editedData);

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

            this.keys = Object.keys(this.secretData).sort();
            const query = this.state.query || '';
            const filteredKeys = this.fuzzySearch(query, this.keys);
            
            this.setState({ 
              filteredKeys,
              successMessage: 'Changes saved successfully',
              selectedIndex: 0
            });
            
            setTimeout(() => {
              this.setState({ successMessage: null });
            }, 3000);
          }
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
  
  /**
   * Base64 file editing helpers
   */
  isValidBase64(str) {
    try {
      // Check if string looks like base64 (contains valid base64 characters)
      if (!/^[A-Za-z0-9+/]+=*$/.test(str)) {
        return false;
      }
      
      // Try to decode - if it succeeds and produces reasonable content, it's valid base64
      const decoded = Buffer.from(str, 'base64').toString('utf8');
      
      // Verify it's not just random binary data by checking if it re-encodes to the same value
      const reencoded = Buffer.from(decoded, 'utf8').toString('base64');
      
      return reencoded === str;
    } catch (error) {
      return false;
    }
  }
  
  async handleBase64FileEdit() {
    const { selectedIndex, filteredKeys } = this.state;
    
    if (filteredKeys.length === 0) {
      this.setState({ errorMessage: 'No keys available to edit' });
      return;
    }
    
    const currentKey = filteredKeys[selectedIndex];
    const currentValue = String(this.secretData[currentKey] || '');
    
    // Check if the current key value is valid base64
    if (!this.isValidBase64(currentValue)) {
      this.setState({ errorMessage: 'Current key value is not valid base64 content' });
      return;
    }
    
    const debugLogger = require('../../core/debug-logger');
    debugLogger.log('KeyBrowserScreen.handleBase64FileEdit', 'Starting base64 file edit', { 
      key: currentKey, 
      valueLength: currentValue.length 
    });
    
    const { TerminalManager } = require('../terminal-manager');
    const terminalManager = TerminalManager.getInstance();
    
    try {
      // Decode base64 content
      const decodedContent = Buffer.from(currentValue, 'base64').toString('utf8');
      
      // Temporarily suspend terminal management for editor
      terminalManager.suspend();
      
      // Add a small delay to ensure terminal is fully suspended
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Launch editor with decoded content
      const { editBase64Content } = require('../interactive');
      const editedContent = await editBase64Content(decodedContent, currentKey);
      
      if (editedContent !== null) {
        // Check if content actually changed
        if (editedContent === decodedContent) {
          this.noChangesMessage = 'No changes made, not saving';
          this.render();
          debugLogger.log('KeyBrowserScreen.handleBase64FileEdit', 'No changes detected', { key: currentKey });
          // Clear message after delay
          setTimeout(() => {
            this.noChangesMessage = null;
            this.render();
          }, 3000);
        } else {
          // Encode the edited content back to base64
          const newEncodedValue = Buffer.from(editedContent, 'utf8').toString('base64');
          
          // Update the secret data
          this.secretData[currentKey] = newEncodedValue;
          
          // Save changes back to the original storage
          await this.saveBase64EditChanges(currentKey, newEncodedValue);
          
          this.setState({ successMessage: `Base64 content for key '${currentKey}' updated successfully` });
          debugLogger.log('KeyBrowserScreen.handleBase64FileEdit', 'Successfully updated base64 content', { 
            key: currentKey, 
            oldLength: currentValue.length,
            newLength: newEncodedValue.length 
          });
          
          // Clear success message after a delay
          setTimeout(() => {
            this.setState({ successMessage: null });
          }, 3000);
        }
      }
      
    } catch (error) {
      this.setState({ errorMessage: `Error editing base64 content: ${error.message}` });
      debugLogger.log('KeyBrowserScreen.handleBase64FileEdit', 'Error during base64 edit', { 
        key: currentKey, 
        error: error.message 
      });
    } finally {
      // Resume terminal management
      terminalManager.resume();
      
      // Wait a bit for terminal to stabilize, then trigger re-render
      await new Promise(resolve => setTimeout(resolve, 100));
      this.render();
    }
  }
  
  async saveBase64EditChanges(key, newValue) {
    try {
      if (this.secretType === 'env') {
        const fs = require('fs');
        const { generateEnvContent } = require('../../utils/secrets');
        const newContent = generateEnvContent(this.secretData);
        fs.writeFileSync(this.secretName, newContent);
      } else if (this.secretType === 'json') {
        const fs = require('fs');
        const { generateJsonContent } = require('../../utils/secrets');
        const newContent = generateJsonContent(this.secretData);
        fs.writeFileSync(this.secretName, newContent);
      } else if (this.secretType === 'aws-secrets-manager') {
        const { uploadToAwsSecretsManager } = require('../../providers/aws');
        await uploadToAwsSecretsManager(
          this.secretData, 
          this.secretName, 
          this.region, 
          'AWSCURRENT', 
          true // autoYes - don't prompt since we're updating existing
        );
      } else if (this.secretType === 'kubernetes') {
        const kubernetes = require('../../providers/kubernetes');
        await kubernetes.setSecret(
          this.secretName, 
          this.secretData, 
          this.namespace, 
          this.context
        );
      }
    } catch (error) {
      throw new Error(`Failed to save base64 edit changes: ${error.message}`);
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