const { ScreenRenderer, RenderUtils } = require('../renderer');
const { KeyEventManager, KeyHandlerUtils } = require('../key-handlers');
const { colorize } = require('../colors');

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
    if (!this.isActive) {
      return;
    }
    
    const keyStr = key.toString();
    const context = { screen: this };
    
    // Process through key manager
    const consumed = this.keyManager.processKeyPress(keyStr, this.state, context);
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
    const { TerminalManager } = require('../terminal-manager');
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

module.exports = { Screen };