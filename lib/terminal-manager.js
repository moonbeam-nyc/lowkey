const { colorize } = require('./colors');

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
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      console.warn('Warning: Not running in a TTY environment, interactive mode disabled');
      return;
    }
    
    // Enter alternate screen buffer
    process.stdout.write('\x1b[?1049h');
    
    // Set raw mode for character-by-character input
    if (process.stdin.setRawMode) {
      process.stdin.setRawMode(true);
      process.stdin.resume();
    }
    
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
    
    // Restore normal terminal mode only if we're in a TTY
    if (process.stdin.isTTY && process.stdin.setRawMode) {
      process.stdin.setRawMode(false);
      process.stdin.pause();
    }
    process.stdin.removeAllListeners('data');
    
    // Exit alternate screen buffer only if we're in a TTY
    if (process.stdout.isTTY) {
      process.stdout.write('\x1b[?1049l');
    }
    
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
    const fs = require('fs');
    const debugLog = (msg) => fs.appendFileSync('lowkey-debug.log', `${new Date().toISOString()} ${msg}\n`);
    
    const keyStr = key.toString();
    debugLog(`🔧 TERMINAL DEBUG: routeKeyPress called, key: "${keyStr}" (charCode: ${keyStr.charCodeAt(0)})`);
    debugLog(`🔧 TERMINAL DEBUG: isActive: ${this.isActive}, currentScreen exists: ${!!this.currentScreen}`);
    
    if (!this.isActive || !this.currentScreen) {
      debugLog('🔧 TERMINAL DEBUG: Not routing key - terminal inactive or no current screen');
      return;
    }
    
    try {
      const processedKey = this.processEscapeSequences(keyStr);
      if (processedKey !== null) {
        debugLog(`🔧 TERMINAL DEBUG: Routing processed key to screen: ${this.currentScreen.id}, key: "${processedKey}" (charCode: ${processedKey.charCodeAt(0)})`);
        this.currentScreen.handleKeyPress(processedKey);
      }
    } catch (error) {
      debugLog(`🔧 TERMINAL DEBUG: Key press routing error: ${error.message}`);
      console.error(colorize(`Key press routing error: ${error.message}`, 'red'));
    }
  }
  
  processEscapeSequences(keyStr) {
    const fs = require('fs');
    const debugLog = (msg) => fs.appendFileSync('lowkey-debug.log', `${new Date().toISOString()} ${msg}\n`);
    
    // Check if this is already a complete arrow sequence coming in as one piece
    if (keyStr.charCodeAt(0) === 27 && keyStr.length > 1) {
      debugLog(`🔧 ESCAPE DEBUG: Multi-char sequence detected: "${keyStr}"`);
      
      // Convert common arrow key sequences
      if (keyStr === '\u001b[A' || keyStr === '[A') {
        debugLog('🔧 ESCAPE DEBUG: Up arrow sequence detected, returning \\u001b[A');
        return '\u001b[A';
      } else if (keyStr === '\u001b[B' || keyStr === '[B') {
        debugLog('🔧 ESCAPE DEBUG: Down arrow sequence detected, returning \\u001b[B');
        return '\u001b[B';
      } else if (keyStr === '\u001b[C' || keyStr === '[C') {
        debugLog('🔧 ESCAPE DEBUG: Right arrow sequence detected, returning \\u001b[C');
        return '\u001b[C';
      } else if (keyStr === '\u001b[D' || keyStr === '[D') {
        debugLog('🔧 ESCAPE DEBUG: Left arrow sequence detected, returning \\u001b[D');
        return '\u001b[D';
      }
      
      // If it's not a recognized sequence, treat it as a regular key
      debugLog('🔧 ESCAPE DEBUG: Unrecognized escape sequence, treating as regular key');
      return keyStr;
    }
    
    // Handle piece-by-piece escape sequences
    if (keyStr === '\u001b') { // ESC
      debugLog('🔧 ESCAPE DEBUG: ESC detected, starting escape sequence');
      this.escapeBuffer = '\u001b';
      
      // Clear any existing timeout
      if (this.escapeTimeout) {
        clearTimeout(this.escapeTimeout);
      }
      
      // Set timeout to handle incomplete sequences
      this.escapeTimeout = setTimeout(() => {
        debugLog('🔧 ESCAPE DEBUG: Escape sequence timeout, treating as plain ESC');
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
      debugLog(`🔧 ESCAPE DEBUG: Building escape sequence: "${this.escapeBuffer}"`);
      
      // Check for complete arrow key sequences
      if (this.escapeBuffer === '\u001b[A') { // Up arrow
        debugLog('🔧 ESCAPE DEBUG: Complete up arrow sequence detected');
        this.clearEscapeBuffer();
        return '\u001b[A';
      } else if (this.escapeBuffer === '\u001b[B') { // Down arrow
        debugLog('🔧 ESCAPE DEBUG: Complete down arrow sequence detected');
        this.clearEscapeBuffer();
        return '\u001b[B';
      } else if (this.escapeBuffer === '\u001b[C') { // Right arrow
        debugLog('🔧 ESCAPE DEBUG: Complete right arrow sequence detected');
        this.clearEscapeBuffer();
        return '\u001b[C';
      } else if (this.escapeBuffer === '\u001b[D') { // Left arrow
        debugLog('🔧 ESCAPE DEBUG: Complete left arrow sequence detected');
        this.clearEscapeBuffer();
        return '\u001b[D';
      }
      
      // If buffer is getting long without a match, reset it
      if (this.escapeBuffer.length > 3) {
        debugLog('🔧 ESCAPE DEBUG: Buffer too long, resetting');
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
    
    // Restore normal terminal mode only if we're in a TTY
    if (process.stdin.isTTY && process.stdin.setRawMode) {
      debugLog('🔧 TERMINAL DEBUG: Setting raw mode false and pausing stdin');
      process.stdin.setRawMode(false);
      process.stdin.pause();
    }
    debugLog('🔧 TERMINAL DEBUG: Removing all data listeners');
    process.stdin.removeAllListeners('data');
    
    // Exit alternate screen buffer only if we're in a TTY
    if (process.stdout.isTTY) {
      debugLog('🔧 TERMINAL DEBUG: Exiting alternate screen buffer');
      process.stdout.write('\x1b[?1049l');
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
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      debugLog('Warning: Not running in a TTY environment, interactive mode disabled');
      return;
    }
    
    debugLog('🔧 TERMINAL DEBUG: Entering alternate screen buffer');
    // Enter alternate screen buffer
    process.stdout.write('\x1b[?1049h');
    
    // Set raw mode for character-by-character input
    if (process.stdin.setRawMode) {
      debugLog('🔧 TERMINAL DEBUG: Setting raw mode true and resuming stdin');
      process.stdin.setRawMode(true);
      process.stdin.resume();
    }
    
    debugLog('🔧 TERMINAL DEBUG: Setting up key event routing');
    // Set up key event routing
    process.stdin.on('data', this.routeKeyPress.bind(this));
    
    // Re-render current screen if available
    if (this.currentScreen && this.currentScreen.isActive) {
      debugLog('🔧 TERMINAL DEBUG: Re-rendering current screen');
      this.currentScreen.render(true);
    } else {
      debugLog('🔧 TERMINAL DEBUG: No current screen to render or screen not active');
      debugLog(`🔧 TERMINAL DEBUG: currentScreen: ${!!this.currentScreen}`);
      if (this.currentScreen) {
        debugLog(`🔧 TERMINAL DEBUG: currentScreen.isActive: ${this.currentScreen.isActive}`);
      }
    }
    
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