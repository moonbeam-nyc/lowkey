const { terminal, output } = require('./terminal-utils');
const { INTERACTIVE } = require('../core/constants');

// Manages key event routing and handler registration
class KeyEventManager {
  constructor() {
    this.handlers = [];
    this.globalHandlers = new Map();
    
    // Set up global key handlers
    this.setupGlobalHandlers();
  }

  setupGlobalHandlers() {
    // Ctrl+C - Universal exit
    this.globalHandlers.set('\u0003', (keyStr, state, context) => {
      if (context.terminal) {
        context.terminal.handleExit();
      } else {
        process.exit(0);
      }
      return true;
    });
  }

  addHandler(handler) {
    this.handlers.push(handler);
  }

  removeHandler(handler) {
    const index = this.handlers.indexOf(handler);
    if (index > -1) {
      this.handlers.splice(index, 1);
    }
  }

  clearHandlers() {
    this.handlers = [];
  }

  // Process key press through registered handlers
  processKeyPress(keyStr, state, context = {}) {
    try {
      // Check global handlers first
      if (this.globalHandlers.has(keyStr)) {
        const handler = this.globalHandlers.get(keyStr);
        if (handler(keyStr, state, context)) {
          return true; // Handler consumed the key
        }
      }

      // Pass through registered handlers
      for (let i = 0; i < this.handlers.length; i++) {
        const handler = this.handlers[i];
        const result = handler(keyStr, state, context);
        if (result) {
          return true; // Handler consumed the key
        }
      }

      return false; // No handler consumed the key
    } catch (error) {
      output.error(`Key handler error: ${error.message}`);
      return false;
    }
  }
}

// Common key handler utilities
const KeyHandlerUtils = {
  // Check if key is navigation (arrow keys or vim-style)
  isNavigationKey(keyStr) {
    return keyStr === '\u001b[A' || keyStr === '\u001b[B' || // Up/Down arrows
           keyStr === 'k' || keyStr === 'j'; // Vim navigation
  },

  // Check if key is page navigation
  isPageKey(keyStr) {
    return keyStr === '\u0015' || keyStr === '\u0002' || // Ctrl+U or Ctrl+B
           keyStr === '\u0004' || keyStr === '\u0006';   // Ctrl+D or Ctrl+F
  },

  // Check if key is editing
  isEditingKey(keyStr) {
    return keyStr === '\u007f' || keyStr === '\b' || // Backspace
           keyStr === '/'; // Search trigger
  },

  // Check if key is printable character
  isPrintableKey(keyStr) {
    return keyStr.length === 1 && keyStr >= ' ';
  },

  // Get page size for terminal
  getPageSize() {
    const dimensions = terminal.getDimensions();
    return Math.max(1, Math.floor(dimensions.rows / INTERACTIVE.PAGE_SIZE_DIVISOR));
  },

  // Navigation key handlers
  handleUpKey(state) {
    const { selectedIndex = 0, filteredItems = [] } = state;
    return { selectedIndex: Math.max(0, selectedIndex - 1) };
  },

  handleDownKey(state) {
    const { selectedIndex = 0, filteredItems = [] } = state;
    if (filteredItems.length === 0) {
      return { selectedIndex: 0 };
    }
    return { selectedIndex: Math.min(filteredItems.length - 1, selectedIndex + 1) };
  },

  handlePageUp(state) {
    const { selectedIndex = 0 } = state;
    const pageSize = this.getPageSize();
    return { selectedIndex: Math.max(0, selectedIndex - pageSize) };
  },

  handlePageDown(state) {
    const { selectedIndex = 0, filteredItems = [] } = state;
    if (filteredItems.length === 0) {
      return { selectedIndex: 0 };
    }
    const pageSize = this.getPageSize();
    return { selectedIndex: Math.min(filteredItems.length - 1, selectedIndex + pageSize) };
  },

  // Search key handlers
  handleBackspace(state) {
    const { query = '' } = state;
    if (query.length > 0) {
      return { 
        query: query.slice(0, -1), 
        selectedIndex: 0 
      };
    }
    return {};
  },

  handleSearchMode(state) {
    return { searchMode: true };
  },

  handleCharacterInput(keyStr, state) {
    const { query = '', searchMode = false } = state;
    if (searchMode || query.length > 0) {
      return {
        query: query + keyStr,
        selectedIndex: 0
      };
    }
    return {};
  },

  // Create a standard fuzzy search key handler
  createFuzzySearchKeyHandler(options = {}) {
    const { 
      filteredItemsKey = 'filteredChoices',
      hasEscape = true,
      onEscape = null,
      onEnter = null,
      terminal = null
    } = options;

    return (keyStr, state) => {
      let { 
        query = '', 
        selectedIndex = 0, 
        searchMode = false,
        [filteredItemsKey]: filteredItems = []
      } = state;

      if (keyStr === '\u001b') { // Escape
        if (searchMode) {
          searchMode = false;
          if (terminal) terminal.setState({ searchMode });
          return true;
        } else if (query.length > 0) {
          // Clear the search query and show all items
          query = '';
          selectedIndex = 0;
          // Recalculate filtered items to show all items when query is cleared
          const allItems = terminal?.items || [];
          const stateUpdate = { 
            query, 
            selectedIndex,
            [filteredItemsKey]: allItems
          };
          if (terminal) terminal.setState(stateUpdate);
          return true;
        } else if (hasEscape && onEscape) {
          return onEscape(state);
        }
      } else if (keyStr === '\r' || keyStr === '\n') { // Enter
        if (searchMode) {
          searchMode = false;
          if (terminal) terminal.setState({ searchMode });
          return true;
        } else if (onEnter) {
          return onEnter(filteredItems, selectedIndex, state);
        }
      } else if (this.isNavigationKey(keyStr) && !searchMode) {
        if (keyStr === '\u001b[A' || keyStr === 'k') { // Up
          const newIndex = Math.max(0, selectedIndex - 1);
          if (newIndex !== selectedIndex && terminal) {
            terminal.setState({ selectedIndex: newIndex });
          }
          return true;
        } else if (keyStr === '\u001b[B' || keyStr === 'j') { // Down
          const newIndex = filteredItems.length === 0 ? 0 : Math.min(filteredItems.length - 1, selectedIndex + 1);
          if (newIndex !== selectedIndex && terminal) {
            terminal.setState({ selectedIndex: newIndex });
          }
          return true;
        }
      } else if (this.isPageKey(keyStr) && !searchMode) {
        const pageSize = this.getPageSize();
        if (keyStr === '\u0015' || keyStr === '\u0002') { // Ctrl+U or Ctrl+B - Page up
          const newIndex = Math.max(0, selectedIndex - pageSize);
          if (newIndex !== selectedIndex && terminal) {
            terminal.setState({ selectedIndex: newIndex });
          }
          return true;
        } else if (keyStr === '\u0004' || keyStr === '\u0006') { // Ctrl+D or Ctrl+F - Page down
          const newIndex = filteredItems.length === 0 ? 0 : Math.min(filteredItems.length - 1, selectedIndex + pageSize);
          if (newIndex !== selectedIndex && terminal) {
            terminal.setState({ selectedIndex: newIndex });
          }
          return true;
        }
      } else if (this.isEditingKey(keyStr)) {
        if (keyStr === '\u007f' || keyStr === '\b') { // Backspace
          // Only handle backspace in search mode
          if (searchMode && query.length > 0) {
            query = query.slice(0, -1);
            selectedIndex = 0;
            if (terminal) terminal.setState({ query, selectedIndex });
            return true;
          }
          // If not in search mode or no query, don't consume backspace
          return false;
        } else if (keyStr === '/') { // Forward slash starts search mode
          if (!searchMode) {
            searchMode = true;
            if (terminal) terminal.setState({ searchMode });
          }
          return true;
        }
      } else if (this.isPrintableKey(keyStr)) {
        // Only add to query if explicitly in search mode
        if (searchMode) {
          query += keyStr;
          selectedIndex = 0;
          if (terminal) terminal.setState({ query, selectedIndex });
          return true;
        }
        // If not in search mode, don't consume printable keys (let them be ignored)
        return false;
      }

      return false;
    };
  },

  // Create an interactive browser key handler with additional features
  createInteractiveBrowserKeyHandler(options = {}) {
    const {
      secretData = {},
      filteredItemsKey = 'filteredKeys',
      hasEscape = true,
      hasEdit = false,
      hasToggle = false,
      onEscape = null,
      onEdit = null,
      onToggle = null,
      terminal = null
    } = options;

    const baseHandler = this.createFuzzySearchKeyHandler({
      filteredItemsKey,
      hasEscape,
      onEscape,
      terminal
    });

    return async (keyStr, state) => {
      // Handle special browser keys first
      if (keyStr === '\u0016' && hasToggle) { // Ctrl+V
        if (onToggle) {
          const result = onToggle(state);
          if (terminal && result) terminal.setState(result);
        }
        return true;
      } else if (keyStr === 'e' && hasEdit) { // e key for editing
        const { searchMode = false, query = '' } = state;
        if (!searchMode && onEdit) {
          const filteredItems = state[filteredItemsKey] || [];
          const keysToEdit = query.length > 0 ? filteredItems : null;
          await onEdit(secretData, keysToEdit, terminal);
          return true;
        }
        // If edit key pressed but conditions not met, don't consume it
        // Fall through to base handler
      }

      // Fall back to standard fuzzy search handling
      return baseHandler(keyStr, state);
    };
  }
};

module.exports = { KeyEventManager, KeyHandlerUtils };