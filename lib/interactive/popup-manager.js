/**
 * Popup Management System
 * 
 * Manages popup overlays that can appear above any screen, handling
 * key event routing and rendering coordination between base screen and popup.
 */

const { ModalComponents } = require('./ui-components');

class PopupManager {
  constructor() {
    this.activePopup = null;
    this.baseScreen = null;
    this.originalKeyHandlers = [];
  }

  /**
   * Show a popup above the current screen
   * @param {Object} popup - Popup instance with render() and handleKey() methods
   * @param {Object} baseScreen - The screen that the popup appears over
   */
  showPopup(popup, baseScreen) {
    const debugLogger = require('../core/debug-logger');
    
    try {
      debugLogger.log('PopupManager.showPopup called', {
        hasActivePopup: !!this.activePopup,
        baseScreenId: baseScreen.id,
        popupType: popup.constructor.name
      });
      
      if (this.activePopup) {
        debugLogger.log('Closing existing popup');
        this.closePopup(); // Close any existing popup first
      }

      this.activePopup = popup;
      this.baseScreen = baseScreen;
      
      debugLogger.log('Storing original key handlers', { 
        handlerCount: baseScreen.keyManager.handlers.length 
      });
      
      // Store original key handlers
      this.originalKeyHandlers = [...baseScreen.keyManager.handlers];
      
      // Clear base screen handlers and add popup handler
      baseScreen.keyManager.clearHandlers();
      baseScreen.keyManager.addHandler(this.createPopupKeyHandler());
      
      debugLogger.log('Key handlers updated for popup');
      
      // Set up popup callbacks
      popup.onClose = () => {
        debugLogger.log('Popup onClose callback triggered');
        this.closePopup();
      };
      
      debugLogger.log('About to render popup');
      
      // Trigger re-render
      this.render();
      
      debugLogger.log('Popup render completed');
      
    } catch (error) {
      debugLogger.log('Error in PopupManager.showPopup', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Close the active popup and restore original key handlers
   */
  closePopup() {
    if (!this.activePopup || !this.baseScreen) {
      return;
    }

    // Store reference to base screen before cleanup
    const baseScreen = this.baseScreen;

    // Restore original key handlers
    baseScreen.keyManager.clearHandlers();
    this.originalKeyHandlers.forEach(handler => {
      baseScreen.keyManager.addHandler(handler);
    });

    // Clean up
    this.activePopup = null;
    this.baseScreen = null;
    this.originalKeyHandlers = [];

    // Trigger re-render of base screen
    baseScreen.render();
  }

  /**
   * Create a key handler that routes keys to the popup
   */
  createPopupKeyHandler() {
    return (key, state, context) => {
      const debugLogger = require('../core/debug-logger');
      
      debugLogger.log('PopupManager.createPopupKeyHandler called', {
        key: key,
        keyCode: key.charCodeAt ? key.charCodeAt(0) : 'no charCodeAt',
        keyLength: key.length,
        hasActivePopup: !!this.activePopup
      });
      
      if (!this.activePopup) {
        debugLogger.log('PopupManager: No active popup, returning false');
        return false;
      }

      // Let popup handle the key
      debugLogger.log('PopupManager: Delegating key to popup', { 
        popupType: this.activePopup.constructor.name 
      });
      const result = this.activePopup.handleKey(key, state, context);
      
      debugLogger.log('PopupManager: Popup key handler result', { result });
      
      // Re-render after key handling
      this.render();
      
      return result;
    };
  }

  /**
   * Render the combined view (base screen + popup overlay)
   */
  render() {
    const debugLogger = require('../core/debug-logger');
    
    try {
      debugLogger.log('PopupManager.render called', {
        hasActivePopup: !!this.activePopup,
        hasBaseScreen: !!this.baseScreen
      });
      
      if (!this.activePopup || !this.baseScreen) {
        debugLogger.log('No active popup or base screen, skipping render');
        return;
      }

      debugLogger.log('Getting base screen content');
      // Get base screen content by calling the render function directly
      let baseContent = '';
      if (this.baseScreen.renderer && this.baseScreen.renderer.renderFunction) {
        baseContent = this.baseScreen.renderer.renderFunction(this.baseScreen.state) || '';
      } else {
        debugLogger.log('No render function available on base screen');
        baseContent = 'No content available';
      }
      debugLogger.log('Base content length', { length: baseContent.length });
      
      debugLogger.log('Getting popup content');
      // Get popup content
      const popupContent = this.activePopup.render();
      debugLogger.log('Popup content length', { length: popupContent.length });
      
      debugLogger.log('Combining content');
      // Combine them - popup renders over base content
      const combinedContent = this.combineContent(baseContent, popupContent);
      debugLogger.log('Combined content length', { length: combinedContent.length });
      
      debugLogger.log('Writing to terminal');
      // Output to terminal
      process.stdout.write('\x1B[2J\x1B[H'); // Clear screen and move cursor to top
      process.stdout.write(combinedContent);
      
      debugLogger.log('Render completed successfully');
      
    } catch (error) {
      debugLogger.log('Error in PopupManager.render', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Combine base screen content with popup overlay using intelligent positioning
   */
  combineContent(baseContent, popupContent) {
    const baseLines = baseContent.split('\n');
    const popupLines = popupContent.split('\n');
    
    // Get terminal dimensions
    const terminalWidth = process.stdout.columns || 80;
    const terminalHeight = process.stdout.rows || 24;
    
    // Calculate popup dimensions (strip ANSI codes for accurate measurement)
    const popupDimensions = this.calculatePopupDimensions(popupLines);
    const baseDimensions = this.calculateBaseDimensions(baseLines);
    
    // Determine optimal positioning
    const position = this.calculateOptimalPosition(
      popupDimensions, 
      baseDimensions, 
      terminalWidth, 
      terminalHeight
    );
    
    // Overlay popup onto base content
    return this.overlayContent(baseLines, popupLines, position, popupDimensions);
  }

  /**
   * Calculate popup content dimensions
   */
  calculatePopupDimensions(popupLines) {
    let maxWidth = 0;
    const height = popupLines.length;
    
    popupLines.forEach(line => {
      // Strip ANSI escape codes for accurate width calculation
      const strippedLine = line.replace(/\x1B\[[0-9;]*m/g, '');
      maxWidth = Math.max(maxWidth, strippedLine.length);
    });
    
    return { width: maxWidth, height };
  }

  /**
   * Calculate base screen content dimensions
   */
  calculateBaseDimensions(baseLines) {
    let maxWidth = 0;
    const height = baseLines.length;
    
    baseLines.forEach(line => {
      const strippedLine = line.replace(/\x1B\[[0-9;]*m/g, '');
      maxWidth = Math.max(maxWidth, strippedLine.length);
    });
    
    return { width: maxWidth, height };
  }

  /**
   * Calculate optimal position for popup overlay
   */
  calculateOptimalPosition(popupDim, baseDim, terminalWidth, terminalHeight) {
    // Try to center the popup
    let x = Math.floor((terminalWidth - popupDim.width) / 2);
    let y = Math.floor((terminalHeight - popupDim.height) / 2);
    
    // Ensure popup stays within terminal bounds
    x = Math.max(0, Math.min(x, terminalWidth - popupDim.width));
    y = Math.max(0, Math.min(y, terminalHeight - popupDim.height));
    
    return { x, y };
  }

  /**
   * Overlay popup content onto base content at specified position
   */
  overlayContent(baseLines, popupLines, position, popupDimensions) {
    const terminalHeight = process.stdout.rows || 24;
    const terminalWidth = process.stdout.columns || 80;
    const result = [];
    
    // Ensure we have enough base lines to work with
    const workingBaseLines = [...baseLines];
    while (workingBaseLines.length < terminalHeight) {
      workingBaseLines.push('');
    }
    
    // Pad base lines to terminal width for proper overlay
    for (let i = 0; i < workingBaseLines.length; i++) {
      const strippedLine = workingBaseLines[i].replace(/\x1B\[[0-9;]*m/g, '');
      if (strippedLine.length < terminalWidth) {
        workingBaseLines[i] += ' '.repeat(terminalWidth - strippedLine.length);
      }
    }
    
    for (let i = 0; i < terminalHeight; i++) {
      const popupLineIndex = i - position.y;
      
      // Check if this line should have popup content overlaid
      if (popupLineIndex >= 0 && popupLineIndex < popupLines.length) {
        const baseLine = workingBaseLines[i] || '';
        const popupLine = popupLines[popupLineIndex];
        
        // Overlay popup line onto base line at position.x
        const overlaidLine = this.overlayLineAtPosition(baseLine, popupLine, position.x, terminalWidth);
        result.push(overlaidLine);
      } else {
        // Use base content as-is
        result.push(workingBaseLines[i] || '');
      }
    }
    
    return result.join('\n');
  }

  /**
   * Overlay a popup line onto a base line at specified x position
   */
  overlayLineAtPosition(baseLine, popupLine, x, terminalWidth) {
    // Strip ANSI codes for accurate length calculations
    const popupStripped = popupLine.replace(/\x1B\[[0-9;]*m/g, '');
    
    // Ensure we don't go beyond terminal boundaries
    const maxX = Math.max(0, terminalWidth - popupStripped.length);
    const safeX = Math.min(x, maxX);
    
    // Parse base line into segments (characters with their ANSI codes)
    const baseSegments = this.parseAnsiLine(baseLine);
    
    // Build the result with proper ANSI code preservation
    let result = '';
    let currentAnsiState = '';
    
    // Add characters before popup position from base
    for (let i = 0; i < safeX; i++) {
      if (i < baseSegments.length) {
        if (baseSegments[i].ansi !== currentAnsiState) {
          result += baseSegments[i].ansi;
          currentAnsiState = baseSegments[i].ansi;
        }
        result += baseSegments[i].char;
      } else {
        result += ' ';
      }
    }
    
    // Reset ANSI state before adding popup content
    if (currentAnsiState) {
      result += '\x1B[0m';
    }
    
    // Add popup content
    result += popupLine;
    
    // Add remaining base content after popup (if any space left)
    const afterPopupX = safeX + popupStripped.length;
    if (afterPopupX < terminalWidth && afterPopupX < baseSegments.length) {
      // Reset ANSI state after popup
      result += '\x1B[0m';
      currentAnsiState = '';
      
      for (let i = afterPopupX; i < Math.min(baseSegments.length, terminalWidth); i++) {
        if (baseSegments[i].ansi !== currentAnsiState) {
          result += baseSegments[i].ansi;
          currentAnsiState = baseSegments[i].ansi;
        }
        result += baseSegments[i].char;
      }
    }
    
    return result;
  }

  /**
   * Parse a line with ANSI codes into segments
   */
  parseAnsiLine(line) {
    const segments = [];
    let currentAnsi = '';
    let i = 0;
    
    while (i < line.length) {
      if (line[i] === '\x1B') {
        // Found ANSI escape sequence
        let escapeSeq = '';
        while (i < line.length && line[i] !== 'm') {
          escapeSeq += line[i];
          i++;
        }
        if (i < line.length) {
          escapeSeq += line[i]; // Add the 'm'
          i++;
        }
        currentAnsi = escapeSeq;
      } else {
        segments.push({
          char: line[i],
          ansi: currentAnsi
        });
        i++;
      }
    }
    
    return segments;
  }

  /**
   * Check if a popup is currently active
   */
  hasActivePopup() {
    return this.activePopup !== null;
  }

  /**
   * Get the currently active popup
   */
  getActivePopup() {
    return this.activePopup;
  }
}

/**
 * Base class for popup components
 */
class BasePopup {
  constructor(options = {}) {
    this.options = options;
    this.onClose = null; // Will be set by PopupManager
  }

  /**
   * Handle key press - to be implemented by subclasses
   * @param {string} key - The key that was pressed
   * @param {Object} state - Current screen state
   * @param {Object} context - Additional context
   * @returns {boolean} - Whether the key was handled
   */
  handleKey(key, state, context) {
    // Default: close on Escape
    if (key === '\u001b') { // Escape
      this.close();
      return true;
    }
    return false;
  }

  /**
   * Render the popup content - to be implemented by subclasses
   * @returns {string} - Rendered content
   */
  render() {
    return 'Base Popup';
  }

  /**
   * Close this popup
   */
  close() {
    if (this.onClose) {
      this.onClose();
    }
  }
}

// Singleton instance
let popupManagerInstance = null;

/**
 * Get the singleton PopupManager instance
 */
function getPopupManager() {
  if (!popupManagerInstance) {
    popupManagerInstance = new PopupManager();
  }
  return popupManagerInstance;
}

module.exports = {
  PopupManager,
  BasePopup,
  getPopupManager
};