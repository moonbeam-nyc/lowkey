/**
 * Centralized Key Handling System
 * 
 * Provides a consistent way to handle key detection and routing,
 * abstracting away character encoding issues and providing a clean API.
 */

/**
 * Key detection utilities that handle various character encodings
 */
class KeyDetector {
  /**
   * Check if a key matches any of the provided patterns
   * @param {string|Buffer} key - The key input
   * @param {Array<string|number>} patterns - Array of patterns to match against
   * @returns {boolean}
   */
  static matches(key, patterns) {
    const keyStr = key.toString();
    const keyCode = keyStr.length > 0 ? keyStr.charCodeAt(0) : null;
    const keyBytes = Buffer.isBuffer(key) ? Array.from(key) : [...key];
    
    return patterns.some(pattern => {
      if (typeof pattern === 'string') {
        return keyStr === pattern;
      } else if (typeof pattern === 'number') {
        // For number patterns, only match if it's a single-character key
        // This prevents arrow keys (multi-char) from matching ESC (27)
        if (keyStr.length === 1) {
          return keyCode === pattern;
        } else {
          // For multi-character keys, check if the entire sequence matches the number as bytes
          return keyBytes.length === 1 && keyBytes[0] === pattern;
        }
      }
      return false;
    });
  }

  /**
   * Check if key is backspace (handles various encodings)
   */
  static isBackspace(key) {
    return this.matches(key, ['\b', '\u007f', 8, 127]);
  }

  /**
   * Check if key is escape
   */
  static isEscape(key) {
    return this.matches(key, ['\u001b', 27]);
  }

  /**
   * Check if key is enter
   */
  static isEnter(key) {
    return this.matches(key, ['\r', '\n', 13, 10]);
  }

  /**
   * Check if key is up arrow
   */
  static isUpArrow(key) {
    return this.matches(key, ['\u001b[A']);
  }

  /**
   * Check if key is down arrow
   */
  static isDownArrow(key) {
    return this.matches(key, ['\u001b[B']);
  }

  /**
   * Check if key is a printable character
   */
  static isPrintable(key) {
    const keyStr = key.toString();
    if (keyStr.length !== 1) return false;
    const code = keyStr.charCodeAt(0);
    return code >= 32 && code <= 126; // Standard printable ASCII range
  }

  /**
   * Check if key is forward slash (search trigger)
   */
  static isSearchTrigger(key) {
    return this.matches(key, ['/']);
  }

  /**
   * Check if key is Ctrl+C
   */
  static isCtrlC(key) {
    return this.matches(key, ['\u0003', 3]);
  }

  /**
   * Get a normalized string representation of the key
   */
  static normalize(key) {
    const keyStr = key.toString();
    const keyBytes = Buffer.isBuffer(key) ? Array.from(key) : [...key];
    
    // Handle special cases where toString() doesn't work properly
    if (keyStr === '' && keyBytes.length === 1) {
      const byte = keyBytes[0];
      if (byte === 127) return '\u007f'; // DEL -> backspace
      if (byte === 8) return '\b';       // BS -> backspace
      if (byte === 27) return '\u001b';  // ESC
      if (byte === 13) return '\r';      // CR -> enter
      if (byte === 10) return '\n';      // LF -> enter
    }
    
    return keyStr;
  }
}

/**
 * A set of key handlers that can process keys and route them to appropriate functions
 */
class KeyHandlerSet {
  constructor() {
    this.handlers = [];
  }

  /**
   * Add a key handler
   * @param {Function} detector - Function that takes a key and returns true if it should handle it
   * @param {Function} handler - Function to call when the key is detected
   * @param {string} name - Optional name for debugging
   */
  on(detector, handler, name = 'anonymous') {
    this.handlers.push({ detector, handler, name });
    return this;
  }

  /**
   * Add a handler for backspace
   */
  onBackspace(handler) {
    return this.on((key) => KeyDetector.isBackspace(key), handler, 'backspace');
  }

  /**
   * Add a handler for escape
   */
  onEscape(handler) {
    return this.on((key) => KeyDetector.isEscape(key), handler, 'escape');
  }

  /**
   * Add a handler for enter
   */
  onEnter(handler) {
    return this.on((key) => KeyDetector.isEnter(key), handler, 'enter');
  }

  /**
   * Add a handler for up arrow
   */
  onUpArrow(handler) {
    return this.on((key) => KeyDetector.isUpArrow(key), handler, 'up');
  }

  /**
   * Add a handler for down arrow
   */
  onDownArrow(handler) {
    return this.on((key) => KeyDetector.isDownArrow(key), handler, 'down');
  }

  /**
   * Add a handler for printable characters
   */
  onPrintable(handler) {
    return this.on((key) => KeyDetector.isPrintable(key), handler, 'printable');
  }

  /**
   * Add a handler for Ctrl+C
   */
  onCtrlC(handler) {
    return this.on((key) => KeyDetector.isCtrlC(key), handler, 'ctrl-c');
  }

  /**
   * Add a handler for search trigger (/)
   */
  onSearchTrigger(handler) {
    return this.on((key) => KeyDetector.isSearchTrigger(key), handler, 'search-trigger');
  }

  /**
   * Add a handler for a specific string or character code
   */
  onKey(pattern, handler, name) {
    const detector = (key) => KeyDetector.matches(key, [pattern]);
    return this.on(detector, handler, name || `key-${pattern}`);
  }

  /**
   * Process a key through all registered handlers
   * @param {string|Buffer} key - The key input
   * @param {Object} context - Additional context to pass to handlers
   * @returns {boolean} - True if any handler processed the key
   */
  process(key, context = {}) {
    const debugLogger = require('../core/debug-logger');
    
    debugLogger.log('KeyHandlerSet.process', 'Processing key', {
      key: KeyDetector.normalize(key),
      keyStr: key.toString(),
      keyBytes: Buffer.isBuffer(key) ? Array.from(key) : [...key],
      handlerCount: this.handlers.length
    });

    for (const { detector, handler, name } of this.handlers) {
      try {
        if (detector(key)) {
          debugLogger.log('KeyHandlerSet.process', `Handler '${name}' matched key`, {
            key: KeyDetector.normalize(key)
          });
          
          const result = handler(key, context);
          
          if (result !== false) { // Allow handlers to return false to continue processing
            debugLogger.log('KeyHandlerSet.process', `Handler '${name}' processed key`, {
              result: result
            });
            return true;
          }
        }
      } catch (error) {
        debugLogger.log('KeyHandlerSet.process', `Error in handler '${name}'`, {
          error: error.message,
          stack: error.stack
        });
      }
    }

    debugLogger.log('KeyHandlerSet.process', 'No handler processed key', {
      key: KeyDetector.normalize(key)
    });
    return false;
  }

  /**
   * Clear all handlers
   */
  clear() {
    this.handlers = [];
    return this;
  }

  /**
   * Get the number of registered handlers
   */
  size() {
    return this.handlers.length;
  }
}

module.exports = {
  KeyHandlerSet,
  KeyDetector
};