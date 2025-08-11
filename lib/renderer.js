const { colorize } = require('./colors');
const { INTERACTIVE } = require('./constants');

// Manages rendering with throttling and screen management
class ScreenRenderer {
  constructor() {
    this.renderTimeout = null;
    this.renderFunction = null;
    this.isActive = false;
  }

  setActive(active) {
    this.isActive = active;
  }

  setRenderFunction(renderFunction) {
    this.renderFunction = renderFunction;
  }

  render(state, immediate = false) {
    if (!this.isActive) return;
    
    if (this.renderTimeout) {
      clearTimeout(this.renderTimeout);
      this.renderTimeout = null;
    }
    
    if (immediate) {
      this.doRender(state);
    } else {
      // Throttle rendering for performance
      this.renderTimeout = setTimeout(() => this.doRender(state), INTERACTIVE.RENDER_TIMEOUT_MS);
    }
  }

  doRender(state) {
    if (!this.isActive || !this.renderFunction) return;
    
    try {
      // Clear screen and move cursor to top
      process.stdout.write('\x1b[2J\x1b[H');
      
      const output = this.renderFunction(state);
      if (output && typeof output === 'string') {
        process.stdout.write(output);
      }
    } catch (error) {
      console.error(colorize(`Render error: ${error.message}`, 'red'));
    }
  }

  cleanup() {
    if (this.renderTimeout) {
      clearTimeout(this.renderTimeout);
      this.renderTimeout = null;
    }
  }
}

// Utility functions for common rendering patterns
const RenderUtils = {
  // Calculate available height for list display
  calculateAvailableHeight(usedLines) {
    const terminalHeight = process.stdout.rows || INTERACTIVE.DEFAULT_TERMINAL_HEIGHT;
    const totalUsedLines = usedLines + INTERACTIVE.RESERVED_LINES_FOR_UI;
    return Math.max(INTERACTIVE.MIN_AVAILABLE_HEIGHT, terminalHeight - totalUsedLines);
  },

  // Calculate pagination window for large lists
  calculatePaginationWindow(selectedIndex, totalItems, availableHeight) {
    const halfHeight = Math.floor(availableHeight / 2);
    const startIndex = Math.max(0, selectedIndex - halfHeight);
    const endIndex = Math.min(totalItems, startIndex + availableHeight);
    
    return { startIndex, endIndex };
  },

  // Generate pagination indicators
  getPaginationIndicators(startIndex, endIndex, totalItems) {
    const indicators = [];
    
    if (startIndex > 0) {
      indicators.push(colorize(`... ${startIndex} previous items`, 'gray'));
    }
    
    if (endIndex < totalItems) {
      const remaining = totalItems - endIndex;
      indicators.push(colorize(`... ${remaining} more items`, 'gray'));
    }
    
    return indicators;
  },

  // Create breadcrumb display
  formatBreadcrumbs(breadcrumbs) {
    if (!breadcrumbs || breadcrumbs.length === 0) {
      return colorize('📍 ', 'gray');
    }
    
    const breadcrumbText = breadcrumbs.join(' > ');
    return colorize(`📍 ${breadcrumbText}`, 'gray');
  },

  // Format search display with cursor
  formatSearchDisplay(query, searchMode = false) {
    if (!searchMode && !query) return null;
    
    const displayQuery = searchMode ? query + '█' : query;
    return `Search: ${colorize(displayQuery, 'bright')}`;
  },

  // Format instructions based on context
  formatInstructions(hasBackNavigation = false, hasEdit = false) {
    const navigation = 'Use ↑↓/jk to navigate, Ctrl+U/D or Ctrl+B/F to page';
    const search = '/ or type to search';
    const action = 'Enter to select';
    const edit = hasEdit ? 'e to edit, ' : '';
    const values = hasEdit ? 'Ctrl+V to toggle values, ' : '';
    const back = hasBackNavigation ? 'Esc to go back, ' : '';
    const exit = hasBackNavigation ? 'Ctrl+C to cancel' : 'Ctrl+C to exit';
    
    return colorize(`${navigation}, ${search}, ${action}, ${edit}${values}${back}${exit}`, 'gray');
  },

  // Truncate long values for display
  truncateValue(value) {
    const displayValue = String(value);
    if (displayValue.length > INTERACTIVE.VALUE_TRUNCATION_LENGTH) {
      const truncateAt = INTERACTIVE.VALUE_TRUNCATION_LENGTH - INTERACTIVE.VALUE_TRUNCATION_SUFFIX.length;
      return displayValue.substring(0, truncateAt) + INTERACTIVE.VALUE_TRUNCATION_SUFFIX;
    }
    return displayValue;
  }
};

module.exports = { ScreenRenderer, RenderUtils };