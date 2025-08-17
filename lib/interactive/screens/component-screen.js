/**
 * Component-based Screen Base Class
 * 
 * A new base class for screens that use the declarative component system.
 * Screens extending this class only need to:
 * 1. Define getComponents() to declare what to display
 * 2. Define setupKeyHandlers() to handle user input
 * 
 * All rendering and terminal operations are handled by the Terminal Manager.
 */

const { KeyEventManager } = require('../key-handlers');
const { KeyHandlerSet } = require('../key-handler-set');

class ComponentScreen {
  constructor(options = {}) {
    this.id = options.id || `screen-${Date.now()}`;
    this.state = options.initialState || {};
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
    this.setState = this.setState.bind(this);
  }

  /**
   * Get components to render
   * Subclasses MUST override this method
   * @param {Object} state - Current screen state
   * @returns {Array} Array of components to render
   */
  getComponents(state) {
    throw new Error(`Screen ${this.constructor.name} must implement getComponents(state)`);
  }

  /**
   * Setup key handlers
   * Subclasses should override this to add their key handlers
   */
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

  /**
   * Convenience method to create key handlers
   * @returns {KeyHandlerSet} A new key handler set
   */
  createKeyHandlers() {
    return new KeyHandlerSet();
  }

  /**
   * Activate this screen
   */
  activate() {
    if (this.isActive) return;
    
    this.isActive = true;
    
    // Set up key handlers
    this.setupKeyHandlers();
    
    // Call lifecycle hook for custom activation logic
    this.onActivate();
    
    // Trigger initial render
    this.render();
  }

  /**
   * Deactivate this screen
   */
  deactivate() {
    if (!this.isActive) return;
    
    this.isActive = false;
    this.keyManager.clearHandlers();
    
    // Call lifecycle hook for custom deactivation logic
    this.onDeactivate();
  }

  /**
   * Clean up resources
   */
  cleanup() {
    this.deactivate();
    
    if (this.resolvePromise) {
      this.resolvePromise(null);
      this.resolvePromise = null;
    }
  }

  /**
   * Handle key press events
   */
  handleKeyPress(key) {
    if (!this.isActive) {
      return;
    }
    
    const keyStr = key.toString();
    const context = { screen: this };
    
    // Process through key manager
    const consumed = this.keyManager.processKeyPress(keyStr, this.state, context);
  }

  /**
   * Update screen state and trigger re-render
   */
  setState(newState) {
    // Only update state if something actually changed
    const hasChanged = Object.keys(newState).some(key => this.state[key] !== newState[key]);
    if (!hasChanged) {
      return; // Don't render if nothing changed
    }
    
    this.state = { ...this.state, ...newState };
    this.render();
  }

  /**
   * Render the screen using the new component system
   */
  render() {
    if (!this.isActive) return;
    
    const { TerminalManager } = require('../terminal-manager');
    const terminalManager = TerminalManager.getInstance();
    
    // Get components from subclass
    const components = this.getComponents(this.state);
    
    // Render through terminal manager
    terminalManager.renderComponents(components);
  }

  /**
   * Screen lifecycle methods - override in subclasses
   */
  onActivate() {
    // Called when screen becomes active
  }

  onDeactivate() {
    // Called when screen becomes inactive
  }

  /**
   * Navigation methods
   */
  goBack() {
    const { TerminalManager } = require('../terminal-manager');
    const terminalManager = TerminalManager.getInstance();
    
    const previousScreen = terminalManager.popScreen();
    if (previousScreen) {
      // Successfully went back to previous screen
      if (this.resolvePromise) {
        this.resolvePromise({ action: 'back', data: null });
        this.resolvePromise = null;
      }
    }
  }

  exit() {
    process.exit(0);
  }

  /**
   * Promise-based execution
   */
  run() {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
    });
  }

  /**
   * Resolve with a result
   */
  resolve(result) {
    if (this.resolvePromise) {
      this.resolvePromise(result);
      this.resolvePromise = null;
    }
  }
  
  /**
   * Helper methods for common patterns
   */
  
  // Navigate to item at index
  navigateToIndex(index, listLength) {
    return Math.max(0, Math.min(listLength - 1, index));
  }
  
  // Page navigation helpers
  pageUp(currentIndex, pageSize = 10) {
    return Math.max(0, currentIndex - pageSize);
  }
  
  pageDown(currentIndex, pageSize = 10, listLength) {
    return Math.min(listLength - 1, currentIndex + pageSize);
  }
  
  // Filter items with fuzzy search
  fuzzySearch(query, items, keyFunc = null) {
    if (!query) return items;
    
    try {
      const regex = new RegExp(query, 'i');
      return items.filter(item => {
        const text = keyFunc ? keyFunc(item) : String(item);
        return regex.test(text);
      });
    } catch (error) {
      // Fall back to simple search for invalid regex
      const lowerQuery = query.toLowerCase();
      return items.filter(item => {
        const text = keyFunc ? keyFunc(item) : String(item);
        return text.toLowerCase().includes(lowerQuery);
      });
    }
  }
}

module.exports = { ComponentScreen };