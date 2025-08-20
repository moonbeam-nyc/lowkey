const { terminal, output, ANSI } = require('./terminal-utils');
const { ComponentRenderer } = require('./component-renderer');
const { Header } = require('./component-system');

// Singleton terminal manager for consistent terminal state management
class TerminalManager {
  constructor() {
    if (TerminalManager.instance) {
      return TerminalManager.instance;
    }
    
    this.isActive = false;
    this.cleanupCallbacks = [];
    this.initialized = false;
    this.screenStack = [];
    this.currentScreen = null;
    
    // Escape sequence handling
    this.escapeBuffer = '';
    this.escapeTimeout = null;
    
    // Global header state
    this.headerInfo = {
      awsProfile: 'loading...',
      awsRegion: 'loading...',
      k8sContext: 'loading...'
    };
    this.headerEnabled = true;
    
    // Component renderer for new declarative system
    this.componentRenderer = new ComponentRenderer();
    
    TerminalManager.instance = this;
  }

  static getInstance() {
    if (!TerminalManager.instance) {
      TerminalManager.instance = new TerminalManager();
    }
    return TerminalManager.instance;
  }

  initialize() {
    if (this.isActive) return;
    
    this.isActive = true;
    
    // Check if we're in a TTY environment
    if (!terminal.isTTY()) {
      output.warn('Warning: Not running in a TTY environment, interactive mode disabled');
      return;
    }
    
    // Set raw mode and enter alternate screen using centralized utilities
    terminal.enableRawMode();
    terminal.enterAlternateScreen();
    
    // Register cleanup handlers only once
    if (!this.initialized) {
      process.on('exit', this.cleanup.bind(this));
      process.on('SIGINT', this.handleExit.bind(this));
      process.on('SIGTERM', this.handleExit.bind(this));
      this.initialized = true;
    }
    
    // Set up key event routing
    process.stdin.on('data', this.routeKeyPress.bind(this));
    
    // Load header information asynchronously
    this.loadHeaderInfo();
  }

  async loadHeaderInfo() {
    const { colorize } = require('../core/colors');
    
    try {
      // Load AWS profile and region
      const { getCurrentProfile } = require('../utils/aws-config');
      this.headerInfo.awsProfile = getCurrentProfile();
      this.headerInfo.awsRegion = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
    } catch (error) {
      this.headerInfo.awsProfile = 'unavailable';
      this.headerInfo.awsRegion = 'unavailable';
    }
    
    try {
      // Load Kubernetes context
      const kubernetes = require('../providers/kubernetes');
      this.headerInfo.k8sContext = await kubernetes.getCurrentContext();
    } catch (error) {
      this.headerInfo.k8sContext = 'unavailable';
    }
    
    // Trigger re-render of current screen with updated header
    if (this.currentScreen && this.currentScreen.render) {
      this.currentScreen.render(true);
    }
  }

  // Method to refresh header info when contexts change
  refreshHeaderInfo() {
    this.loadHeaderInfo();
  }

  // Get formatted header lines for rendering
  getHeaderLines(breadcrumbs = []) {
    const { colorize } = require('../core/colors');
    
    if (!this.headerEnabled) {
      return [];
    }
    
    const lines = [];
    const headerParts = [];
    
    // Application name
    headerParts.push(colorize('lowkey', 'cyan'));
    
    // AWS info (add space after colon)
    const awsInfo = this.headerInfo.awsProfile === 'unavailable' 
      ? colorize('aws: unavailable', 'gray')
      : colorize(`aws: ${this.headerInfo.awsProfile}@${this.headerInfo.awsRegion}`, 'gray');
    headerParts.push(awsInfo);
    
    // Kubernetes info (add space after colon)
    const k8sInfo = this.headerInfo.k8sContext === 'unavailable'
      ? colorize('k8s: unavailable', 'gray') 
      : colorize(`k8s: ${this.headerInfo.k8sContext}`, 'gray');
    headerParts.push(k8sInfo);
    
    // Create main header line
    const headerLine = headerParts.join(colorize(' | ', 'gray'));
    lines.push(headerLine);
    
    // Add breadcrumbs as second line if provided
    if (breadcrumbs && breadcrumbs.length > 0) {
      // Style breadcrumbs with hierarchy: parent items in gray, current item in white
      const styledItems = breadcrumbs.map((item, index) => {
        const isCurrentScreen = index === breadcrumbs.length - 1;
        return colorize(item, isCurrentScreen ? 'white' : 'gray');
      });
      
      const graySeparator = colorize(' > ', 'gray');
      const breadcrumbText = styledItems.join(graySeparator);
      lines.push(breadcrumbText);
    }
    
    // Add separator
    const separator = colorize('─'.repeat(80), 'gray');
    lines.push(separator);
    
    // Add empty line for spacing
    lines.push('');
    
    return lines;
  }

  // Enable or disable the global header
  setHeaderEnabled(enabled) {
    this.headerEnabled = enabled;
    if (this.currentScreen && this.currentScreen.render) {
      this.currentScreen.render(true);
    }
  }

  /**
   * New component-based rendering system
   */
  
  // Render components directly (for new declarative screens)
  renderComponents(components) {
    if (!this.isActive) return;
    
    try {
      // Clear screen
      terminal.clearScreen();
      
      // Extract breadcrumbs from components and filter them out
      let breadcrumbs = [];
      const filteredComponents = [];
      
      components.forEach(component => {
        if (component && component.type === 'breadcrumbs') {
          breadcrumbs = component.props.items || [];
        } else {
          filteredComponents.push(component);
        }
      });
      
      // Add header if enabled (with breadcrumbs integrated)
      const allComponents = this.headerEnabled 
        ? [Header({ breadcrumbs }), ...filteredComponents]
        : filteredComponents;
      
      // Render components
      const output = this.componentRenderer.render(allComponents);
      
      // Write to terminal
      if (output) {
        terminal.write(output);
      }
    } catch (error) {
      output.error(`Component render error: ${error.message}`);
    }
  }
  
  // Render current screen using new system (if it supports it)
  renderCurrentScreen() {
    if (!this.currentScreen) return;
    
    // Check if screen uses new component system
    if (this.currentScreen.getComponents) {
      const components = this.currentScreen.getComponents(this.currentScreen.state);
      this.renderComponents(components);
    } else if (this.currentScreen.render) {
      // Fall back to old rendering system
      this.currentScreen.render(true);
    }
  }
  
  // Check if current screen uses component system
  isComponentScreen() {
    return this.currentScreen && typeof this.currentScreen.getComponents === 'function';
  }

  cleanup() {
    if (!this.isActive) return;
    
    this.isActive = false;
    
    // Clear escape sequence handling
    this.clearEscapeBuffer();
    
    // Clear all screens
    this.screenStack = [];
    this.currentScreen = null;
    
    // Use centralized terminal cleanup
    terminal.clearScreen();
    terminal.exitAlternateScreen();
    terminal.disableRawMode();
    terminal.clearStdinListeners();
    
    // Call any registered cleanup callbacks
    this.cleanupCallbacks.forEach(callback => {
      try { 
        callback(); 
      } catch (e) { 
        // Ignore cleanup errors to prevent cascading failures
      }
    });
    
    this.cleanupCallbacks = [];
  }

  handleExit() {
    this.cleanup();
    process.exit(0);
  }

  onCleanup(callback) {
    this.cleanupCallbacks.push(callback);
  }

  // Route key presses to the current active screen
  routeKeyPress(key) {
    // Handle DEL character (127) which toString() converts to empty string
    let keyStr;
    if (key.length === 1 && key[0] === 127) {
      keyStr = '\u007f'; // Convert DEL to proper backspace character
    } else {
      keyStr = key.toString();
    }
    
    const debugLogger = require('../core/debug-logger');
    
    // Debug raw key input
    debugLogger.log('TerminalManager.routeKeyPress', 'Key received', {
      keyStr: keyStr,
      keyLength: keyStr.length,
      keyBytes: Buffer.isBuffer(key) ? Array.from(key) : [...key],
      keyCharCodes: keyStr.split('').map(c => c.charCodeAt(0)),
      isActive: this.isActive,
      hasCurrentScreen: !!this.currentScreen
    });
    
    if (!this.isActive || !this.currentScreen) {
      debugLogger.log('TerminalManager.routeKeyPress: Early return - inactive or no screen');
      return;
    }
    
    try {
      const processedKey = this.processEscapeSequences(keyStr);
      debugLogger.log('TerminalManager.routeKeyPress: Processed key', {
        originalKey: keyStr,
        processedKey: processedKey
      });
      
      if (processedKey !== null) {
        // Handle global key shortcuts first
        const globalHandled = this.handleGlobalKeys(processedKey);
        
        // If not handled globally, pass to current screen
        if (!globalHandled) {
          this.currentScreen.handleKeyPress(processedKey);
        }
      }
    } catch (error) {
      debugLogger.log('Error processing key press', {
        error: error.message,
        stack: error.stack,
        key: keyStr
      });
      output.error(`Key press routing error: ${error.message}`);
    }
  }

  // Handle global key shortcuts that work on every screen
  handleGlobalKeys(keyStr) {
    const debugLogger = require('../core/debug-logger');
    
    debugLogger.log('TerminalManager.handleGlobalKeys', 'Checking global shortcuts', {
      key: keyStr,
      keyCode: keyStr.charCodeAt(0)
    });
    
    // ? - Help popup (global)
    if (keyStr === '?') {
      debugLogger.log('TerminalManager.handleGlobalKeys', '? detected - showing help popup');
      this.showGlobalHelpPopup();
      return true;
    }
    
    // Ctrl+A - AWS Profile Popup (global)
    if (keyStr === '\u0001') {
      debugLogger.log('TerminalManager.handleGlobalKeys', 'Ctrl+A detected - showing AWS profile popup');
      this.showGlobalAwsProfilePopup();
      return true;
    }
    
    return false; // Not handled globally
  }

  // Show help popup globally
  showGlobalHelpPopup() {
    const debugLogger = require('../core/debug-logger');
    
    try {
      debugLogger.log('TerminalManager.showGlobalHelpPopup', 'Showing global help popup');
      
      const { showHelp } = require('./screens/help-popup');
      
      // Determine context based on current screen
      let context = 'general';
      const screenId = this.currentScreen?.id;
      
      if (screenId) {
        if (screenId.includes('type-selection')) context = 'type-selection';
        else if (screenId.includes('secret-selection')) context = 'secret-selection';
        else if (screenId.includes('key-browser')) context = 'key-browser';
        else if (screenId.includes('copy-wizard')) context = 'copy-wizard';
        else if (this.currentScreen?.state?.searchMode) context = 'search-mode';
      }
      
      debugLogger.log('TerminalManager.showGlobalHelpPopup', 'Determined context', { context, screenId });
      
      // Show help popup with appropriate context
      showHelp(this.currentScreen, context);
      
    } catch (error) {
      debugLogger.log('TerminalManager.showGlobalHelpPopup', 'Error showing help popup', {
        error: error.message,
        stack: error.stack
      });
    }
  }

  // Show AWS profile popup globally
  showGlobalAwsProfilePopup() {
    const debugLogger = require('../core/debug-logger');
    
    try {
      debugLogger.log('TerminalManager.showGlobalAwsProfilePopup', 'Showing global AWS profile popup');
      
      const { getPopupManager } = require('./popup-manager');
      const AwsProfilePopup = require('./screens/aws-profile-screen');
      
      const popupManager = getPopupManager();
      
      const popup = new AwsProfilePopup({
        onConfigChange: (config) => {
          debugLogger.log('TerminalManager.showGlobalAwsProfilePopup', 'AWS configuration changed globally', config);
          
          // Update global header information
          this.headerInfo.awsProfile = config.profile || 'default';
          this.headerInfo.awsRegion = config.region || 'us-east-1';
          
          // Trigger header refresh
          this.refreshHeaderInfo();
          
          // Notify current screen about AWS config change (for screen-specific refresh logic)
          if (this.currentScreen && typeof this.currentScreen.onAwsConfigChange === 'function') {
            this.currentScreen.onAwsConfigChange(config);
          }
          
          // Re-render current screen to show updated header
          if (this.currentScreen && this.currentScreen.render) {
            this.currentScreen.render(true);
          }
        }
      });
      
      popupManager.showPopup(popup, this.currentScreen);
      
    } catch (error) {
      debugLogger.log('TerminalManager.showGlobalAwsProfilePopup', 'Error showing global AWS profile popup', {
        error: error.message,
        stack: error.stack
      });
      
      // Show error to user if current screen supports it
      if (this.currentScreen && this.currentScreen.setState) {
        this.currentScreen.setState({ 
          errorMessage: `Error showing AWS profile popup: ${error.message}` 
        });
      }
    }
  }
  
  processEscapeSequences(keyStr) {
    // Check if this is already a complete arrow sequence coming in as one piece
    if (keyStr.charCodeAt(0) === 27 && keyStr.length > 1) {
      // Convert common arrow key sequences
      if (keyStr === '\u001b[A' || keyStr === '[A') {
        return '\u001b[A';
      } else if (keyStr === '\u001b[B' || keyStr === '[B') {
        return '\u001b[B';
      } else if (keyStr === '\u001b[C' || keyStr === '[C') {
        return '\u001b[C';
      } else if (keyStr === '\u001b[D' || keyStr === '[D') {
        return '\u001b[D';
      }
      
      // If it's not a recognized sequence, treat it as a regular key
      return keyStr;
    }
    
    // Handle piece-by-piece escape sequences
    if (keyStr === '\u001b') { // ESC
      this.escapeBuffer = '\u001b';
      
      // Clear any existing timeout
      if (this.escapeTimeout) {
        clearTimeout(this.escapeTimeout);
      }
      
      // Set timeout to handle incomplete sequences
      this.escapeTimeout = setTimeout(() => {
        if (this.currentScreen) {
          this.currentScreen.handleKeyPress('\u001b');
        }
        this.escapeBuffer = '';
        this.escapeTimeout = null;
      }, 100); // 100ms timeout
      
      return null; // Don't process yet
    }
    
    // If we have an escape buffer, continue building the sequence
    if (this.escapeBuffer) {
      this.escapeBuffer += keyStr;
      
      // Check for complete arrow key sequences
      if (this.escapeBuffer === '\u001b[A') { // Up arrow
        this.clearEscapeBuffer();
        return '\u001b[A';
      } else if (this.escapeBuffer === '\u001b[B') { // Down arrow
        this.clearEscapeBuffer();
        return '\u001b[B';
      } else if (this.escapeBuffer === '\u001b[C') { // Right arrow
        this.clearEscapeBuffer();
        return '\u001b[C';
      } else if (this.escapeBuffer === '\u001b[D') { // Left arrow
        this.clearEscapeBuffer();
        return '\u001b[D';
      }
      
      // If buffer is getting long without a match, reset it
      if (this.escapeBuffer.length > 3) {
        this.clearEscapeBuffer();
        return keyStr; // Process as normal key
      }
      
      return null; // Still building sequence
    }
    
    // Normal key processing
    return keyStr;
  }
  
  clearEscapeBuffer() {
    if (this.escapeTimeout) {
      clearTimeout(this.escapeTimeout);
      this.escapeTimeout = null;
    }
    this.escapeBuffer = '';
  }

  // Screen stack management
  pushScreen(screen) {
    if (this.currentScreen) {
      this.currentScreen.deactivate();
      this.screenStack.push(this.currentScreen);
    }
    
    this.currentScreen = screen;
    screen.activate();
  }

  popScreen() {
    if (this.currentScreen) {
      this.currentScreen.deactivate();
      this.currentScreen.cleanup();
    }
    
    if (this.screenStack.length > 0) {
      this.currentScreen = this.screenStack.pop();
      this.currentScreen.activate();
      return this.currentScreen;
    } else {
      this.currentScreen = null;
      return null;
    }
  }

  // Replace current screen without adding to stack
  replaceScreen(screen) {
    if (this.currentScreen) {
      this.currentScreen.deactivate();
      this.currentScreen.cleanup();
    }
    
    this.currentScreen = screen;
    screen.activate();
  }

  // Clear all screens and set new root screen
  setRootScreen(screen) {
    // Clean up all existing screens
    if (this.currentScreen) {
      this.currentScreen.deactivate();
      this.currentScreen.cleanup();
    }
    
    this.screenStack.forEach(screen => {
      screen.deactivate();
      screen.cleanup();
    });
    
    this.screenStack = [];
    this.currentScreen = screen;
    screen.activate();
  }

  // Temporarily suspend terminal management for external processes (like editors)
  suspend() {
    const fs = require('fs');
    const debugLog = (msg) => fs.appendFileSync('lowkey-debug.log', `${new Date().toISOString()} ${msg}\n`);
    
    debugLog(`🔧 TERMINAL DEBUG: suspend() called, isActive: ${this.isActive}`);
    debugLog(`🔧 TERMINAL DEBUG: currentScreen exists: ${!!this.currentScreen}`);
    debugLog(`🔧 TERMINAL DEBUG: screenStack length: ${this.screenStack.length}`);
    
    if (!this.isActive) {
      debugLog('🔧 TERMINAL DEBUG: suspend() - terminal not active, returning');
      return;
    }
    
    // Deactivate current screen to stop rendering
    if (this.currentScreen) {
      debugLog('🔧 TERMINAL DEBUG: Deactivating current screen to stop rendering');
      this.currentScreen.renderer.setActive(false);
    }
    
    // Restore normal terminal mode using centralized utilities
    if (terminal.isTTY()) {
      debugLog('🔧 TERMINAL DEBUG: Disabling raw mode and clearing listeners');
      terminal.disableRawMode();
      terminal.clearStdinListeners();
      
      debugLog('🔧 TERMINAL DEBUG: Exiting alternate screen buffer');
      terminal.exitAlternateScreen();
    }
    
    debugLog('🔧 TERMINAL DEBUG: suspend() complete');
  }

  // Resume terminal management after external process
  resume() {
    const fs = require('fs');
    const debugLog = (msg) => fs.appendFileSync('lowkey-debug.log', `${new Date().toISOString()} ${msg}\n`);
    
    debugLog(`🔧 TERMINAL DEBUG: resume() called, isActive: ${this.isActive}`);
    debugLog(`🔧 TERMINAL DEBUG: currentScreen exists: ${!!this.currentScreen}`);
    debugLog(`🔧 TERMINAL DEBUG: screenStack length: ${this.screenStack.length}`);
    
    if (!this.isActive) {
      debugLog('🔧 TERMINAL DEBUG: resume() - terminal not active, returning');
      return;
    }
    
    // Check if we're in a TTY environment
    if (!terminal.isTTY()) {
      debugLog('Warning: Not running in a TTY environment, interactive mode disabled');
      return;
    }
    
    // Set raw mode and enter alternate screen using centralized utilities
    debugLog('🔧 TERMINAL DEBUG: Enabling raw mode and entering alternate screen');
    terminal.enableRawMode();
    terminal.enterAlternateScreen();
    
    debugLog('🔧 TERMINAL DEBUG: Setting up key event routing');
    // Set up key event routing
    process.stdin.on('data', this.routeKeyPress.bind(this));
    
    // Don't immediately re-render - let the screen handle it after editor completes
    debugLog('🔧 TERMINAL DEBUG: Terminal resumed, screen will handle re-rendering');
    
    debugLog('🔧 TERMINAL DEBUG: resume() complete');
  }

  // Check if terminal is currently active
  get active() {
    return this.isActive;
  }

  // Get current screen depth
  get screenDepth() {
    return this.screenStack.length + (this.currentScreen ? 1 : 0);
  }
}

module.exports = { TerminalManager };