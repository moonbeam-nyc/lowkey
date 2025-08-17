const { terminal, output, ANSI } = require('./terminal-utils');

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
        this.currentScreen.handleKeyPress(processedKey);
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