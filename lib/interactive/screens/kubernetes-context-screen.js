const { BasePopup } = require('../popup-manager');
const { getCurrentContext, getAvailableContexts, switchContext } = require('../../providers/kubernetes');
const { colorize } = require('../../core/colors');
const { KeyHandlerSet, KeyDetector } = require('../key-handler-set');

/**
 * Kubernetes Context Selection Popup
 * 
 * Provides a centered popup for selecting Kubernetes context
 * Triggered by Ctrl+K from any list screen
 */
class KubernetesContextPopup extends BasePopup {
  /**
   * Helper to wrap a line with ANSI reset codes to prevent color bleeding
   */
  wrapWithReset(line) {
    return `\x1B[0m${line}\x1B[0m`;
  }

  constructor(options = {}) {
    super(options);
    
    const debugLogger = require('../../core/debug-logger');
    
    try {
      debugLogger.log('KubernetesContextPopup constructor called', options);
      
      this.state = {
        mode: 'loading', // 'loading', 'context-list'
        selectedContextIndex: 0,
        query: '',
        searchMode: false,
        currentContext: null,
        availableContexts: [],
        error: null
      };
      
      this.onConfigChange = options.onConfigChange || (() => {});
      
      // Load contexts asynchronously
      this.loadContexts();
      
      debugLogger.log('KubernetesContextPopup constructor completed', { state: this.state });
      
    } catch (error) {
      debugLogger.log('Error in KubernetesContextPopup constructor', {
        error: error.message,
        stack: error.stack
      });
      this.state = {
        mode: 'error',
        error: error.message
      };
    }
  }

  async loadContexts() {
    const debugLogger = require('../../core/debug-logger');
    
    try {
      debugLogger.log('Loading Kubernetes contexts...');
      
      const currentContext = await getCurrentContext();
      const availableContexts = await getAvailableContexts();
      
      debugLogger.log('Kubernetes contexts loaded', {
        currentContext,
        availableContexts
      });
      
      this.state = {
        ...this.state,
        mode: 'context-list',
        currentContext,
        availableContexts,
        selectedContextIndex: Math.max(0, availableContexts.indexOf(currentContext)),
        error: null
      };
      
      // Trigger re-render
      if (this.onClose) {
        // Force re-render by calling the popup manager's render method
        const { getPopupManager } = require('../popup-manager');
        const popupManager = getPopupManager();
        if (popupManager.hasActivePopup()) {
          popupManager.render();
        }
      }
      
    } catch (error) {
      debugLogger.log('Error loading Kubernetes contexts', {
        error: error.message,
        stack: error.stack
      });
      
      this.state = {
        ...this.state,
        mode: 'error',
        error: error.message
      };
      
      // Trigger re-render
      if (this.onClose) {
        const { getPopupManager } = require('../popup-manager');
        const popupManager = getPopupManager();
        if (popupManager.hasActivePopup()) {
          popupManager.render();
        }
      }
    }
  }

  handleKey(key) {
    const { mode, selectedContextIndex, query, searchMode } = this.state;
    const debugLogger = require('../../core/debug-logger');
    
    debugLogger.log('KubernetesContextPopup.handleKey called', {
      key: key,
      mode: mode,
      state: this.state
    });
    
    if (mode === 'loading') {
      // Only allow Escape and Ctrl+C during loading
      if (key === '\u001b' || key === '\u0003') {
        debugLogger.log('Loading mode: Escape or Ctrl+C pressed, closing popup');
        this.close();
        return true;
      }
      return true; // Consume all other keys during loading
    } else if (mode === 'error') {
      // Any key closes the error popup
      debugLogger.log('Error mode: Any key pressed, closing popup');
      this.close();
      return true;
    } else if (mode === 'context-list') {
      const result = this.handleContextListMode(key);
      debugLogger.log('KubernetesContextPopup.handleKey context-list mode result', { result });
      return result;
    }
    
    debugLogger.log('KubernetesContextPopup.handleKey no mode matched, returning false');
    return false;
  }

  handleContextListMode(key) {
    const { selectedContextIndex, query, searchMode } = this.state;
    const debugLogger = require('../../core/debug-logger');
    
    debugLogger.log('handleContextListMode called', {
      key: KeyDetector.normalize(key),
      currentQuery: query,
      selectedContextIndex: selectedContextIndex,
      searchMode: searchMode
    });
    
    // Create key handler set for context list mode
    const keyHandlers = new KeyHandlerSet()
      .onEscape(() => {
        if (searchMode) {
          // Exit search mode
          debugLogger.log('Context list mode: Exiting search mode');
          this.setState({ searchMode: false });
          return true;
        } else {
          // Close popup
          debugLogger.log('Context list mode: Escape key pressed, closing popup');
          this.close();
          return true;
        }
      })
      .onKey('\u0003', () => { // Ctrl+C
        debugLogger.log('Context list mode: Ctrl+C pressed, closing popup');
        this.close();
        return true;
      })
      .onEnter(() => {
        if (searchMode) {
          // Exit search mode when Enter is pressed during filtering
          debugLogger.log('Context list mode: Enter key pressed in search mode, exiting search mode');
          this.setState({ searchMode: false });
          return true;
        } else {
          // Select context when not in search mode
          const selectedContext = this.getFilteredContexts()[selectedContextIndex];
          debugLogger.log('Context list mode: Enter key pressed', { selectedContext });
          if (selectedContext) {
            this.applyConfiguration(selectedContext);
            this.close();
          }
          return true;
        }
      })
      .onDownArrow(() => {
        const filteredContexts = this.getFilteredContexts();
        const newDownIndex = Math.min(selectedContextIndex + 1, filteredContexts.length - 1);
        debugLogger.log('Context list mode: Down navigation triggered', { 
          from: selectedContextIndex, 
          to: newDownIndex,
          filteredCount: filteredContexts.length 
        });
        this.setState({ 
          selectedContextIndex: newDownIndex
        });
        return true;
      })
      .onUpArrow(() => {
        const newUpIndex = Math.max(selectedContextIndex - 1, 0);
        debugLogger.log('Context list mode: Up navigation triggered', { 
          from: selectedContextIndex, 
          to: newUpIndex 
        });
        this.setState({ 
          selectedContextIndex: newUpIndex
        });
        return true;
      })
      .onSearchTrigger(() => {
        debugLogger.log('Context list mode: Search trigger pressed, entering search mode');
        this.setState({ searchMode: true });
        return true;
      })
      .onKey('j', () => {
        if (!searchMode) {
          // j acts as down navigation when not in search mode
          const filteredContexts = this.getFilteredContexts();
          const newDownIndex = Math.min(selectedContextIndex + 1, filteredContexts.length - 1);
          debugLogger.log('Context list mode: j key navigation (down)', { 
            from: selectedContextIndex, 
            to: newDownIndex,
            filteredCount: filteredContexts.length 
          });
          this.setState({ selectedContextIndex: newDownIndex });
          return true;
        }
        return false; // Let printable handler process it
      })
      .onKey('k', () => {
        if (!searchMode) {
          // k acts as up navigation when not in search mode
          const newUpIndex = Math.max(selectedContextIndex - 1, 0);
          debugLogger.log('Context list mode: k key navigation (up)', { 
            from: selectedContextIndex, 
            to: newUpIndex 
          });
          this.setState({ selectedContextIndex: newUpIndex });
          return true;
        }
        return false; // Let printable handler process it
      })
      .onBackspace(() => {
        if (searchMode && query.length > 0) {
          const newQuery = query.slice(0, -1);
          debugLogger.log('Context list mode: Removing character from query', {
            oldQuery: query,
            newQuery: newQuery,
            removedChar: query.slice(-1)
          });
          this.setState({ 
            query: newQuery,
            selectedContextIndex: 0 
          });
          return true;
        } else {
          debugLogger.log('Context list mode: Backspace ignored - not in search mode or query empty');
          return false;
        }
      })
      .onPrintable((key) => {
        if (searchMode) {
          const char = KeyDetector.normalize(key);
          const newQuery = query + char;
          debugLogger.log('Context list mode: Adding character to query', {
            oldQuery: query,
            newQuery: newQuery,
            addedChar: char
          });
          this.setState({ 
            query: newQuery,
            selectedContextIndex: 0 
          });
          return true;
        } else {
          debugLogger.log('Context list mode: Printable key ignored - not in search mode');
          return false;
        }
      });

    // Process the key through the handler set
    const handled = keyHandlers.process(key, { 
      state: this.state, 
      setState: this.setState.bind(this) 
    });
    
    if (!handled) {
      debugLogger.log('Context list mode: Key not handled', { 
        key: KeyDetector.normalize(key) 
      });
    }
    
    return handled;
  }

  getFilteredContexts() {
    const { query, availableContexts } = this.state;
    if (!query) return availableContexts;
    
    const lowerQuery = query.toLowerCase();
    return availableContexts.filter(context => 
      context.toLowerCase().includes(lowerQuery)
    );
  }

  setState(newState) {
    this.state = { ...this.state, ...newState };
  }

  async applyConfiguration(contextName) {
    const debugLogger = require('../../core/debug-logger');
    
    debugLogger.log('applyConfiguration called', { contextName });
    
    try {
      // Switch to the new context
      await switchContext(contextName);
      
      // Update our cached values
      this.state.currentContext = contextName;
      
      debugLogger.log('Applied Kubernetes configuration', { 
        context: contextName 
      });
      
      // Refresh the global header to reflect new Kubernetes configuration
      const { TerminalManager } = require('../terminal-manager');
      const terminalManager = TerminalManager.getInstance();
      terminalManager.refreshHeaderInfo();
      
      // Notify parent of configuration change
      this.onConfigChange({ context: contextName });
      
    } catch (error) {
      debugLogger.log('Error applying Kubernetes configuration', {
        error: error.message,
        context: contextName
      });
      
      // Show error state
      this.state = {
        ...this.state,
        mode: 'error',
        error: `Failed to switch to context '${contextName}': ${error.message}`
      };
      
      // Don't close on error, let user see the error and manually close
      const { getPopupManager } = require('../popup-manager');
      const popupManager = getPopupManager();
      if (popupManager.hasActivePopup()) {
        popupManager.render();
      }
    }
  }

  render() {
    const { mode } = this.state;
    
    if (mode === 'loading') {
      return this.renderLoadingMode();
    } else if (mode === 'error') {
      return this.renderErrorMode();
    } else if (mode === 'context-list') {
      return this.renderContextListMode();
    }
  }

  renderLoadingMode() {
    const output = [];
    const boxWidth = 40;
    const contentWidth = boxWidth - 2;
    
    // Top border
    output.push(this.wrapWithReset('┌' + '─'.repeat(contentWidth) + '┐'));
    
    // Title
    const title = colorize('Kubernetes Configuration', 'bold');
    const titleStripped = title.replace(/\x1B\[[0-9;]*m/g, '');
    const titlePadding = Math.max(0, contentWidth - titleStripped.length - 2);
    output.push(this.wrapWithReset(`│ ${title}${' '.repeat(titlePadding)} │`));
    output.push(this.wrapWithReset('├' + '─'.repeat(contentWidth) + '┤'));
    
    // Loading message
    const loadingMsg = colorize('Loading contexts...', 'yellow');
    const loadingStripped = loadingMsg.replace(/\x1B\[[0-9;]*m/g, '');
    const loadingPadding = Math.max(0, contentWidth - loadingStripped.length - 2);
    output.push(this.wrapWithReset(`│ ${loadingMsg}${' '.repeat(loadingPadding)} │`));
    
    output.push(this.wrapWithReset('├' + '─'.repeat(contentWidth) + '┤'));
    
    // Instructions
    const instructions = colorize('Esc: Cancel', 'gray');
    const instrStripped = instructions.replace(/\x1B\[[0-9;]*m/g, '');
    const instrPadding = Math.max(0, contentWidth - instrStripped.length - 2);
    output.push(this.wrapWithReset(`│ ${instructions}${' '.repeat(instrPadding)} │`));
    
    // Bottom border
    output.push(this.wrapWithReset('└' + '─'.repeat(contentWidth) + '┘'));
    
    return output.join('\n');
  }

  renderErrorMode() {
    const { error } = this.state;
    const output = [];
    const boxWidth = Math.min(60, Math.max(40, error.length + 10));
    const contentWidth = boxWidth - 2;
    
    // Top border
    output.push(this.wrapWithReset('┌' + '─'.repeat(contentWidth) + '┐'));
    
    // Title
    const title = colorize('Kubernetes Error', 'red');
    const titleStripped = title.replace(/\x1B\[[0-9;]*m/g, '');
    const titlePadding = Math.max(0, contentWidth - titleStripped.length - 2);
    output.push(this.wrapWithReset(`│ ${title}${' '.repeat(titlePadding)} │`));
    output.push(this.wrapWithReset('├' + '─'.repeat(contentWidth) + '┤'));
    
    // Error message (word wrap if needed)
    const words = error.split(' ');
    let currentLine = '';
    const maxLineLength = contentWidth - 4; // Leave some margin
    
    for (const word of words) {
      if (currentLine.length + word.length + 1 <= maxLineLength) {
        currentLine += (currentLine ? ' ' : '') + word;
      } else {
        if (currentLine) {
          const errorMsg = colorize(currentLine, 'red');
          const errorStripped = errorMsg.replace(/\x1B\[[0-9;]*m/g, '');
          const errorPadding = Math.max(0, contentWidth - errorStripped.length - 2);
          output.push(this.wrapWithReset(`│ ${errorMsg}${' '.repeat(errorPadding)} │`));
        }
        currentLine = word;
      }
    }
    
    if (currentLine) {
      const errorMsg = colorize(currentLine, 'red');
      const errorStripped = errorMsg.replace(/\x1B\[[0-9;]*m/g, '');
      const errorPadding = Math.max(0, contentWidth - errorStripped.length - 2);
      output.push(this.wrapWithReset(`│ ${errorMsg}${' '.repeat(errorPadding)} │`));
    }
    
    output.push(this.wrapWithReset('├' + '─'.repeat(contentWidth) + '┤'));
    
    // Instructions
    const instructions = colorize('Press any key to close', 'gray');
    const instrStripped = instructions.replace(/\x1B\[[0-9;]*m/g, '');
    const instrPadding = Math.max(0, contentWidth - instrStripped.length - 2);
    output.push(this.wrapWithReset(`│ ${instructions}${' '.repeat(instrPadding)} │`));
    
    // Bottom border
    output.push(this.wrapWithReset('└' + '─'.repeat(contentWidth) + '┘'));
    
    return output.join('\n');
  }

  renderContextListMode() {
    const { selectedContextIndex, query, searchMode, currentContext } = this.state;
    const filteredContexts = this.getFilteredContexts();
    const output = [];
    
    // Calculate width based on ALL contexts (not just filtered) and instruction text
    const instructionText = '/ to search | Enter: Select | Esc: Cancel';
    const maxContextLength = Math.max(...this.state.availableContexts.map(c => c.length));
    const minWidth = Math.max(instructionText.length + 4, 30);
    const boxWidth = Math.max(minWidth, Math.min(60, maxContextLength + 12));
    const contentWidth = boxWidth - 2;
    
    // Top border
    output.push(this.wrapWithReset('┌' + '─'.repeat(contentWidth) + '┐'));
    
    // Title
    const title = `Select Kubernetes Context`;
    const titlePadding = Math.max(0, contentWidth - title.length - 2);
    output.push(this.wrapWithReset(`│ ${colorize(title, 'bold')}${' '.repeat(titlePadding)} │`));
    
    // Search box if there's a query or in search mode
    if (query || searchMode) {
      output.push(this.wrapWithReset('├' + '─'.repeat(contentWidth) + '┤'));
      const cursor = searchMode ? colorize('█', 'white') : '';
      const searchLine = `🔍 ${query}${cursor}`;
      const searchStripped = searchLine.replace(/\x1B\[[0-9;]*m/g, '');
      const searchPadding = Math.max(0, contentWidth - searchStripped.length - 2);
      output.push(this.wrapWithReset(`│ ${searchLine}${' '.repeat(searchPadding)} │`));
    }
    
    output.push(this.wrapWithReset('├' + '─'.repeat(contentWidth) + '┤'));
    
    // Context list (limit to 8 items)
    const visibleContexts = filteredContexts.slice(0, 8);
    visibleContexts.forEach((context, index) => {
      const isSelected = index === selectedContextIndex;
      const isCurrent = context === currentContext;
      const prefix = isSelected ? '▶ ' : '  ';
      const marker = isCurrent ? ' (current)' : '';
      const contextText = `${prefix}${context}${marker}`;
      const finalText = isSelected ? colorize(contextText, 'cyan') : contextText;
      
      const strippedText = finalText.replace(/\x1B\[[0-9;]*m/g, '');
      const padding = Math.max(0, contentWidth - strippedText.length - 2);
      output.push(this.wrapWithReset(`│ ${finalText}${' '.repeat(padding)} │`));
    });
    
    // Show more indicator if needed
    if (filteredContexts.length > 8) {
      const moreText = colorize(`  ... ${filteredContexts.length - 8} more`, 'gray');
      const moreStripped = moreText.replace(/\x1B\[[0-9;]*m/g, '');
      const morePadding = Math.max(0, contentWidth - moreStripped.length - 2);
      output.push(this.wrapWithReset(`│ ${moreText}${' '.repeat(morePadding)} │`));
    }
    
    output.push(this.wrapWithReset('├' + '─'.repeat(contentWidth) + '┤'));
    
    // Instructions
    const instructions = colorize(instructionText, 'gray');
    const instrStripped = instructionText;
    const instrPadding = Math.max(0, contentWidth - instrStripped.length - 2);
    output.push(this.wrapWithReset(`│ ${instructions}${' '.repeat(instrPadding)} │`));
    
    // Bottom border
    output.push(this.wrapWithReset('└' + '─'.repeat(contentWidth) + '┘'));
    
    return output.join('\n');
  }
}

module.exports = KubernetesContextPopup;