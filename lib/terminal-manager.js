const { colorize } = require('./colors');

// Manages terminal raw mode, alternate screen buffer, and cleanup
class TerminalManager {
  constructor() {
    this.isActive = false;
    this.cleanupCallbacks = [];
    this.initialized = false;
  }

  initialize() {
    if (this.isActive) return;
    
    this.isActive = true;
    
    // Enter alternate screen buffer
    process.stdout.write('\x1b[?1049h');
    
    // Set raw mode for character-by-character input
    process.stdin.setRawMode(true);
    process.stdin.resume();
    
    // Register cleanup handlers only once
    if (!this.initialized) {
      process.on('exit', this.cleanup.bind(this));
      process.on('SIGINT', this.handleExit.bind(this));
      process.on('SIGTERM', this.handleExit.bind(this));
      this.initialized = true;
    }
  }

  cleanup() {
    if (!this.isActive) return;
    
    this.isActive = false;
    
    // Restore normal terminal mode
    process.stdin.setRawMode(false);
    process.stdin.pause();
    process.stdin.removeAllListeners('data');
    
    // Exit alternate screen buffer
    process.stdout.write('\x1b[?1049l');
    
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

  // Set up key event listening
  onKeyPress(handler) {
    process.stdin.on('data', handler);
  }

  // Remove key event listening
  removeKeyListener(handler) {
    process.stdin.removeListener('data', handler);
  }

  // Check if terminal is currently active
  get active() {
    return this.isActive;
  }
}

module.exports = { TerminalManager };