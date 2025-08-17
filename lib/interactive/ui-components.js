/**
 * Reusable UI components for interactive screens
 * 
 * Extracts common patterns used across multiple screens to reduce duplication
 * and provide consistent user experience.
 */

const { colorize } = require('../core/colors');
const { RenderUtils } = require('./renderer');

/**
 * Navigation and Breadcrumb Components
 */
class NavigationComponents {
  /**
   * Render breadcrumb navigation with consistent formatting
   */
  static renderBreadcrumbs(breadcrumbs, currentStep = null) {
    if (!breadcrumbs || breadcrumbs.length === 0) {
      return '';
    }
    
    let displayBreadcrumbs = [...breadcrumbs];
    if (currentStep) {
      displayBreadcrumbs.push(currentStep);
    }
    
    return RenderUtils.formatBreadcrumbs(displayBreadcrumbs);
  }

  /**
   * Generate common navigation instructions
   */
  static getNavigationInstructions(options = {}) {
    const {
      hasBackNavigation = false,
      hasSearch = false,
      hasEdit = false,
      hasToggle = false,
      hasCopy = false,
      customInstructions = []
    } = options;

    const instructions = [];
    
    // Basic navigation
    instructions.push('Use ↑↓/jk to navigate');
    
    // Search functionality
    if (hasSearch) {
      instructions.push('/ to search');
    }
    
    // Edit functionality
    if (hasEdit) {
      instructions.push('e to edit');
    }
    
    // Toggle functionality (like show/hide values)
    if (hasToggle) {
      instructions.push('Ctrl+V to toggle values');
    }
    
    // Copy functionality
    if (hasCopy) {
      instructions.push('Ctrl+S to copy secrets');
    }
    
    // Back navigation
    if (hasBackNavigation) {
      instructions.push('Esc to go back');
    } else {
      instructions.push('Ctrl+C to exit');
    }
    
    // Add custom instructions
    instructions.push(...customInstructions);
    
    return RenderUtils.formatInstructions(instructions, {
      hasBackNavigation,
      hasSearch,
      hasEdit,
      hasToggle,
      hasCopy
    });
  }
}

/**
 * Error and Status Message Components
 */
class StatusComponents {
  /**
   * Render error message with consistent formatting
   */
  static renderErrorMessage(errorMessage, insertAfterPattern = null) {
    if (!errorMessage) {
      return '';
    }
    
    const errorLine = colorize(`⚠️  ${errorMessage}`, 'red');
    
    // If no insertion pattern provided, return just the error
    if (!insertAfterPattern) {
      return `\n\n${errorLine}\n`;
    }
    
    // Return error ready for insertion into existing output
    return {
      errorLine,
      insertAfterPattern
    };
  }

  /**
   * Render success message with consistent formatting
   */
  static renderSuccessMessage(message) {
    return colorize(`✅ ${message}`, 'green');
  }

  /**
   * Render warning message with consistent formatting
   */
  static renderWarningMessage(message) {
    return colorize(`⚠️  ${message}`, 'yellow');
  }

  /**
   * Render info message with consistent formatting
   */
  static renderInfoMessage(message) {
    return colorize(`ℹ️  ${message}`, 'cyan');
  }

  /**
   * Render loading/progress indicator
   */
  static renderLoadingIndicator(message = 'Loading...', showSpinner = false) {
    const spinner = showSpinner ? '⏳ ' : '';
    return colorize(`${spinner}${message}`, 'yellow');
  }
}

/**
 * List and Selection Components
 */
class ListComponents {
  /**
   * Render a selectable list with consistent formatting
   */
  static renderSelectableList(items, selectedIndex, options = {}) {
    const {
      displayFunction = (item) => item.toString(),
      showNumbers = false,
      highlightColor = 'cyan',
      maxVisible = 10
    } = options;

    if (!items || items.length === 0) {
      return colorize('No items available', 'gray');
    }

    const output = [];
    const startIndex = Math.max(0, selectedIndex - Math.floor(maxVisible / 2));
    const endIndex = Math.min(items.length, startIndex + maxVisible);
    
    for (let i = startIndex; i < endIndex; i++) {
      const item = items[i];
      const isSelected = i === selectedIndex;
      const prefix = isSelected ? '▶ ' : '  ';
      const number = showNumbers ? `${i + 1}. ` : '';
      const text = `${prefix}${number}${displayFunction(item)}`;
      
      if (isSelected) {
        output.push(colorize(text, highlightColor));
      } else {
        output.push(text);
      }
    }

    // Add pagination indicators if needed
    if (items.length > maxVisible) {
      const hasMore = {
        above: startIndex > 0,
        below: endIndex < items.length
      };
      
      if (hasMore.above) {
        output.unshift(colorize('  ⋮ (more above)', 'gray'));
      }
      
      if (hasMore.below) {
        output.push(colorize('  ⋮ (more below)', 'gray'));
      }
    }

    return output.join('\n');
  }

  /**
   * Render filtered search results with query highlighting
   */
  static renderSearchResults(items, query, selectedIndex, displayFunction) {
    if (!query) {
      return this.renderSelectableList(items, selectedIndex, { displayFunction });
    }

    // Highlight query matches in display function
    const highlightedDisplayFunction = (item) => {
      const text = displayFunction(item);
      if (!query) return text;
      
      const regex = new RegExp(`(${query})`, 'gi');
      return text.replace(regex, colorize('$1', 'yellow'));
    };

    return this.renderSelectableList(items, selectedIndex, {
      displayFunction: highlightedDisplayFunction
    });
  }
}

/**
 * Input and Form Components
 */
class InputComponents {
  /**
   * Render a bordered text input box with cursor
   */
  static renderTextInputBox(inputText, cursorPosition, options = {}) {
    const {
      prompt = 'Enter text:',
      placeholder = '',
      maxWidth = 40,
      showCursor = true,
      validationError = null
    } = options;

    const output = [];
    
    // Prompt
    if (prompt) {
      output.push(colorize(prompt, 'cyan'));
      output.push('');
    }

    // Calculate box dimensions
    const displayText = inputText || placeholder;
    const boxWidth = Math.max(maxWidth, displayText.length + 4);
    
    // Top border
    output.push('┌' + '─'.repeat(boxWidth - 2) + '┐');
    
    // Content with cursor
    let contentLine = '│ ';
    if (inputText) {
      const beforeCursor = inputText.substring(0, cursorPosition);
      const afterCursor = inputText.substring(cursorPosition);
      const cursor = showCursor ? colorize('█', 'white') : '';
      contentLine += beforeCursor + cursor + afterCursor;
    } else if (placeholder) {
      contentLine += colorize(placeholder, 'gray');
    }
    
    // Pad to box width
    const contentLength = inputText ? inputText.length + (showCursor ? 1 : 0) : placeholder.length;
    const padding = Math.max(0, boxWidth - contentLength - 4);
    contentLine += ' '.repeat(padding) + ' │';
    
    output.push(contentLine);
    
    // Bottom border
    output.push('└' + '─'.repeat(boxWidth - 2) + '┘');
    
    // Validation error
    if (validationError) {
      output.push('');
      output.push(colorize(`⚠️  ${validationError}`, 'red'));
    }

    return output.join('\n');
  }

  /**
   * Render step indicator for wizards
   */
  static renderStepIndicator(currentStep, totalSteps, stepNames = []) {
    if (!totalSteps || totalSteps <= 1) {
      return '';
    }

    const indicators = [];
    for (let i = 1; i <= totalSteps; i++) {
      const isCurrent = i === currentStep;
      const isComplete = i < currentStep;
      
      let indicator;
      if (isComplete) {
        indicator = colorize('●', 'green');
      } else if (isCurrent) {
        indicator = colorize('●', 'cyan');
      } else {
        indicator = colorize('○', 'gray');
      }
      
      indicators.push(indicator);
    }
    
    const stepLine = indicators.join('─');
    
    // Add step name if available
    if (stepNames[currentStep - 1]) {
      const stepName = colorize(stepNames[currentStep - 1], 'bold');
      return `${stepLine}\n${stepName} (${currentStep}/${totalSteps})`;
    }
    
    return `${stepLine}\nStep ${currentStep} of ${totalSteps}`;
  }
}

/**
 * Search and Filter Components
 */
class SearchComponents {
  /**
   * Render search input with query highlighting
   */
  static renderSearchInput(query, searchMode, placeholder = 'Type to search...') {
    // Always show search input if there's a query OR if in search mode
    if (!searchMode && !query) {
      return '';
    }

    const cursor = searchMode ? colorize('█', 'white') : '';
    const displayText = query || '';
    
    if (!query && placeholder && searchMode) {
      return `🔍 ${colorize(placeholder, 'gray')}${cursor}`;
    }
    
    const searchLine = `🔍 ${displayText}${cursor}`;
    return searchLine;
  }

  /**
   * Apply fuzzy filtering to items
   */
  static filterItems(items, query, searchFunction = null) {
    if (!query) {
      return items;
    }

    if (searchFunction) {
      return items.filter(item => searchFunction(item, query));
    }

    // Default string-based search
    const lowerQuery = query.toLowerCase();
    return items.filter(item => {
      const searchText = typeof item === 'string' ? item : item.name || item.toString();
      return searchText.toLowerCase().includes(lowerQuery);
    });
  }
}

/**
 * Modal and Popup Components
 */
class ModalComponents {
  /**
   * Render a centered modal dialog
   */
  static renderModal(content, options = {}) {
    const {
      title = '',
      width = 50,
      height = 20,
      terminalWidth = process.stdout.columns || 80,
      terminalHeight = process.stdout.rows || 24
    } = options;

    // Calculate position to center the modal
    const modalWidth = Math.min(width, terminalWidth - 4);
    const modalHeight = Math.min(height, terminalHeight - 4);
    const leftPadding = Math.floor((terminalWidth - modalWidth) / 2);
    const topPadding = Math.floor((terminalHeight - modalHeight) / 2);

    const output = [];
    
    // Add top padding (empty lines)
    for (let i = 0; i < topPadding; i++) {
      output.push('');
    }
    
    // Top border
    const topBorder = '┌' + '─'.repeat(modalWidth - 2) + '┐';
    output.push(' '.repeat(leftPadding) + topBorder);
    
    // Title if provided
    if (title) {
      const titlePadding = Math.max(0, modalWidth - title.length - 4);
      const titleLine = `│ ${colorize(title, 'bold')}${' '.repeat(titlePadding)} │`;
      output.push(' '.repeat(leftPadding) + titleLine);
      
      // Separator after title
      const separator = '├' + '─'.repeat(modalWidth - 2) + '┤';
      output.push(' '.repeat(leftPadding) + separator);
    }
    
    // Content lines
    const contentLines = Array.isArray(content) ? content : content.split('\n');
    const availableContentHeight = modalHeight - (title ? 4 : 2); // Account for borders and title
    
    for (let i = 0; i < availableContentHeight; i++) {
      const line = contentLines[i] || '';
      // Strip ANSI codes for length calculation
      const strippedLine = line.replace(/\x1B\[[0-9;]*m/g, '');
      const linePadding = Math.max(0, modalWidth - strippedLine.length - 4);
      const modalLine = `│ ${line}${' '.repeat(linePadding)} │`;
      output.push(' '.repeat(leftPadding) + modalLine);
    }
    
    // Bottom border
    const bottomBorder = '└' + '─'.repeat(modalWidth - 2) + '┘';
    output.push(' '.repeat(leftPadding) + bottomBorder);
    
    return output.join('\n');
  }

  /**
   * Render a popup overlay that covers the screen
   */
  static renderPopupOverlay(content, options = {}) {
    const { backgroundColor = null } = options;
    
    if (backgroundColor) {
      // Clear screen and set background
      return `\x1B[2J\x1B[H${content}`;
    }
    
    // Just clear and show content
    return `\x1B[2J\x1B[H${content}`;
  }
}

/**
 * Layout and Container Components
 */
class LayoutComponents {
  /**
   * Create a consistent screen layout with header, content, and footer
   */
  static renderScreenLayout(options = {}) {
    const {
      breadcrumbs = [],
      title = '',
      content = [],
      instructions = '',
      errorMessage = null,
      statusMessage = null
    } = options;

    const output = [];
    
    // Header with breadcrumbs
    if (breadcrumbs.length > 0) {
      output.push(NavigationComponents.renderBreadcrumbs(breadcrumbs));
      output.push('');
    }
    
    // Title
    if (title) {
      output.push(colorize(title, 'bold'));
      output.push('');
    }
    
    // Main content
    if (Array.isArray(content)) {
      output.push(...content);
    } else if (content) {
      output.push(content);
    }
    
    // Status message
    if (statusMessage) {
      output.push('');
      output.push(statusMessage);
    }
    
    // Error message
    if (errorMessage) {
      output.push('');
      output.push(StatusComponents.renderErrorMessage(errorMessage));
    }
    
    // Instructions footer
    if (instructions) {
      output.push('');
      output.push(instructions);
    }
    
    return output.join('\n');
  }

  /**
   * Create a two-column layout
   */
  static renderTwoColumnLayout(leftContent, rightContent, separator = ' │ ') {
    const leftLines = Array.isArray(leftContent) ? leftContent : leftContent.split('\n');
    const rightLines = Array.isArray(rightContent) ? rightContent : rightContent.split('\n');
    
    const maxLines = Math.max(leftLines.length, rightLines.length);
    const output = [];
    
    for (let i = 0; i < maxLines; i++) {
      const left = leftLines[i] || '';
      const right = rightLines[i] || '';
      output.push(`${left}${separator}${right}`);
    }
    
    return output.join('\n');
  }
}

module.exports = {
  NavigationComponents,
  StatusComponents,
  ListComponents,
  InputComponents,
  SearchComponents,
  ModalComponents,
  LayoutComponents
};