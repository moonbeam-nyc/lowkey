const { Screen } = require('./base-screen');
const { KeyHandlerUtils } = require('../key-handlers');
const { RenderUtils } = require('../renderer');
const { colorize } = require('../colors');

// Fuzzy search screen implementation
class FuzzySearchScreen extends Screen {
  constructor(options) {
    super({
      ...options,
      hasSearch: true,
      initialState: {
        query: options.initialQuery || '',
        selectedIndex: 0,
        searchMode: (options.initialQuery || '').length > 0,
        filteredItems: [],
        ...options.initialState
      }
    });
    
    this.items = options.items || [];
    this.displayFunction = options.displayFunction || null;
    this.question = options.question || 'Select an item:';
    this.errorMessage = options.errorMessage || null;
    
    // Set up render function
    this.setRenderFunction(this.renderFuzzySearch.bind(this));
  }

  setupKeyHandlers() {
    super.setupKeyHandlers();
    
    // Add fuzzy search specific handlers
    const handler = KeyHandlerUtils.createFuzzySearchKeyHandler({
      filteredItemsKey: 'filteredItems',
      hasEscape: this.config.hasBackNavigation,
      terminal: this, // Pass screen as terminal context
      onEscape: (state) => {
        this.goBack();
        return true;
      },
      onEnter: (filteredItems, selectedIndex, state) => {
        if (filteredItems.length > 0) {
          this.resolve({
            selection: filteredItems[selectedIndex],
            query: state.query || ''
          });
          return true;
        }
        return false;
      }
    });
    
    this.keyManager.addHandler(handler);
  }

  renderFuzzySearch(state) {
    const { query = '', selectedIndex = 0, searchMode = false } = state;
    const output = [];
    
    // Breadcrumbs
    if (this.config.breadcrumbs.length > 0) {
      output.push(RenderUtils.formatBreadcrumbs(this.config.breadcrumbs));
      output.push('');
    }
    
    // Question
    output.push(colorize(this.question, 'cyan'));
    
    // Search field
    const searchDisplay = RenderUtils.formatSearchDisplay(query, searchMode);
    if (searchDisplay) {
      output.push(searchDisplay);
    }
    
    output.push('');
    
    // Filter items and update state
    const filteredItems = this.fuzzySearch(query, this.items);
    if (state.filteredItems !== filteredItems) {
      this.setState({ filteredItems });
    }
    
    // Render items
    if (filteredItems.length === 0) {
      if (this.items.length === 0 && this.errorMessage) {
        output.push(colorize('(No items available)', 'yellow'));
      } else {
        output.push(colorize('No matches found', 'yellow'));
      }
    } else {
      this.renderItemList(output, filteredItems, selectedIndex, query, searchMode);
    }
    
    // Error message
    if (this.errorMessage) {
      output.push('');
      output.push(colorize(`⚠️  ${this.errorMessage}`, 'red'));
    }
    
    // Instructions
    output.push('');
    output.push(RenderUtils.formatInstructions(this.config.hasBackNavigation));
    
    return output.join('\n') + '\n';
  }

  renderItemList(output, items, selectedIndex, query, searchMode) {
    const boundedIndex = Math.max(0, Math.min(selectedIndex, items.length - 1));
    
    // Calculate pagination
    const availableHeight = RenderUtils.calculateAvailableHeight(output.length);
    const { startIndex, endIndex } = RenderUtils.calculatePaginationWindow(boundedIndex, items.length, availableHeight);
    const indicators = RenderUtils.getPaginationIndicators(startIndex, endIndex, items.length);
    
    // Previous items indicator
    if (indicators[0]) {
      output.push(indicators[0]);
    }
    
    // Render items
    for (let i = startIndex; i < endIndex; i++) {
      const item = items[i];
      let display = this.displayFunction ? this.displayFunction(item) : 
                    (typeof item === 'string' ? item : (item.Name || item.name || item));
      
      // Apply highlighting
      if (query) {
        if (this.displayFunction && item.name) {
          const highlightedName = this.highlightMatch(item.name, query);
          display = display.replace(item.name, highlightedName);
        } else {
          const name = typeof item === 'string' ? item : (item.Name || item.name || item);
          display = this.highlightMatch(name, query);
        }
      }
      
      const isSelected = i === boundedIndex && !searchMode;
      const prefix = isSelected ? colorize('> ', 'green') : '  ';
      const color = isSelected ? 'bright' : 'reset';
      
      const finalDisplay = query ? display : colorize(display, color);
      output.push(`${prefix}${finalDisplay}`);
    }
    
    // More items indicator
    if (indicators[1]) {
      output.push(indicators[1]);
    }
  }

  // Fuzzy search implementation
  fuzzySearch(query, items) {
    if (!query) return items;
    
    try {
      const regex = new RegExp(query, 'i');
      
      return items.filter(item => {
        const name = typeof item === 'string' ? item : (item.Name || item.name || item);
        return regex.test(name);
      });
      
    } catch (error) {
      // Fallback to simple text search
      const lowerQuery = query.toLowerCase();
      return items.filter(item => {
        const name = typeof item === 'string' ? item : (item.Name || item.name || item);
        return name.toLowerCase().includes(lowerQuery);
      });
    }
  }

  // Highlight matching text
  highlightMatch(text, query) {
    if (!query) return text;
    
    try {
      const regex = new RegExp(`(${query})`, 'gi');
      return text.replace(regex, colorize('$1', 'yellow'));
    } catch (error) {
      // Fallback to simple highlighting
      const lowerText = text.toLowerCase();
      const lowerQuery = query.toLowerCase();
      const index = lowerText.indexOf(lowerQuery);
      
      if (index !== -1) {
        const before = text.substring(0, index);
        const match = text.substring(index, index + query.length);
        const after = text.substring(index + query.length);
        return before + colorize(match, 'yellow') + after;
      }
      
      return text;
    }
  }
}

module.exports = { FuzzySearchScreen };