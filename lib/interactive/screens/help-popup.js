/**
 * Help Popup
 * 
 * Context-aware help popup that shows relevant keyboard shortcuts
 * and commands based on the current screen.
 */

const { BasePopup } = require('../popup-manager');
const { colorize } = require('../../core/colors');

class HelpPopup extends BasePopup {
  constructor(options) {
    super(options);
    
    this.context = options.context || 'general';
    this.screenName = this.getSimpleScreenName(options.context);
    this.customHelp = options.customHelp || [];
  }

  /**
   * Get simple screen name based on context
   */
  getSimpleScreenName(context) {
    switch (context) {
      case 'type-selection':
        return 'Type Selection';
      case 'secret-selection':
        return 'Secret Selection';
      case 'key-browser':
        return 'Key Browser';
      case 'copy-wizard':
        return 'Copy Secrets';
      case 'search-mode':
        return 'Search';
      case 'editor':
        return 'Editor';
      default:
        return 'Help';
    }
  }

  /**
   * Get help content based on context
   */
  getHelpContent() {
    const sections = [];
    
    // Add context-specific help based on screen type
    switch (this.context) {
      case 'type-selection':
        // No unique shortcuts for type selection - all are covered in Navigation and Global Shortcuts
        break;
        
      case 'secret-selection':
        sections.push({
          title: 'Secret Management',
          items: [
            { key: '/', desc: 'Search/filter secrets' },
            { key: 'Ctrl+D', desc: 'Delete selected secret' }
          ]
        });
        break;
        
      case 'key-browser':
        sections.push({
          title: 'Key Browser',
          items: [
            { key: '/', desc: 'Search/filter keys' },
            { key: 'Space', desc: 'Multi-select keys' },
            { key: 'e', desc: 'Edit secret' },
            { key: 'Ctrl+F', desc: 'Edit base64 file content (single key)' },
            { key: 'Ctrl+S', desc: 'Copy keys (selected or all)' },
            { key: 'Ctrl+D', desc: 'Delete keys (selected or current)' },
            { key: 'Ctrl+V', desc: 'Toggle value visibility' }
          ]
        });
        break;
        
      case 'copy-wizard':
        // No unique shortcuts for copy wizard - all are covered in Navigation and Global Shortcuts
        break;
        
      case 'search-mode':
        sections.push({
          title: 'Search Mode',
          items: [
            { key: 'Type', desc: 'Enter search query' },
            { key: 'Backspace', desc: 'Delete character' },
            { key: 'Ctrl+U', desc: 'Clear search' },
            { key: 'Enter', desc: 'Exit search mode' },
            { key: 'Esc', desc: 'Cancel search' }
          ]
        });
        break;
        
      case 'editor':
        sections.push({
          title: 'Editor Mode',
          items: [
            { key: 'Ctrl+S', desc: 'Save and exit' },
            { key: 'Esc :q!', desc: 'Exit without saving (vim)' },
            { key: 'Ctrl+X', desc: 'Exit (nano)' }
          ]
        });
        break;
    }
    
    // Add pagination help if applicable
    if (this.context !== 'type-selection') {
      sections.push({
        title: 'Pagination',
        items: [
          { key: 'Ctrl+B', desc: 'Page up' },
          { key: 'g', desc: 'Go to top' },
          { key: 'G', desc: 'Go to bottom' }
        ]
      });
    }
    
    // Add any custom help items
    if (this.customHelp.length > 0) {
      sections.push({
        title: 'Additional Commands',
        items: this.customHelp
      });
    }
    
    // Add global shortcuts last
    sections.push({
      title: 'Global Shortcuts',
      items: [
        { key: 'Ctrl+A', desc: 'AWS profile/region selector' },
        { key: 'Ctrl+K', desc: 'Kubernetes context selector' },
        { key: 'Ctrl+C', desc: 'Exit application' }
      ]
    });
    
    return sections;
  }

  /**
   * Render the help popup content
   */
  render() {
    const sections = this.getHelpContent();
    const lines = [];
    
    // Get terminal dimensions
    const terminalHeight = process.stdout.rows || 24;
    const terminalWidth = process.stdout.columns || 80;
    
    // Calculate dimensions
    let maxWidth = Math.min(50, terminalWidth - 10); // Minimum width but respect terminal width
    let totalHeight = 2; // Top and bottom borders
    
    // Calculate required width and height
    sections.forEach(section => {
      totalHeight += 2 + section.items.length; // Title + blank line + items
      section.items.forEach(item => {
        // Key is padded to 20 chars, plus 2 spaces prefix, plus desc, plus 1 space separator
        const itemWidth = 2 + 20 + 1 + item.desc.length;
        maxWidth = Math.max(maxWidth, Math.min(itemWidth, terminalWidth - 10));
      });
    });
    
    // Add title and ensure minimum width for title
    const title = `Help - ${this.screenName}`;
    maxWidth = Math.max(maxWidth, Math.min(title.length + 2, terminalWidth - 10));
    
    // Add a bit of padding to ensure comfortable fit
    maxWidth += 4;
    
    // Limit height to fit in terminal (leave space for screen content)
    // Need to account for: header (~4 lines), bottom instructions (~3 lines), popup borders (~2 lines), centering buffer (~5 lines)
    // Being very conservative to prevent covering header
    const maxAllowedHeight = Math.max(6, Math.floor(terminalHeight * 0.6));
    let sectionsToShow = sections;
    
    // If help would be too tall, prioritize sections
    if (totalHeight > maxAllowedHeight) {
      sectionsToShow = this.prioritizeSections(sections, maxAllowedHeight);
    }
    
    // Build the popup content
    lines.push(this.buildBorder('top', maxWidth));
    lines.push(this.buildLine(colorize(title, 'cyan'), maxWidth, 'center'));
    lines.push(this.buildLine('', maxWidth));
    
    // Add each section
    sectionsToShow.forEach((section, sectionIndex) => {
      if (sectionIndex > 0) {
        lines.push(this.buildLine('', maxWidth)); // Blank line between sections
      }
      
      // Section title
      lines.push(this.buildLine(` ${colorize(section.title, 'yellow')}`, maxWidth));
      lines.push(this.buildLine(` ${colorize('─'.repeat(section.title.length), 'gray')}`, maxWidth));
      
      // Section items
      section.items.forEach(item => {
        const keyPart = colorize(item.key.padEnd(20), 'white');
        const descPart = colorize(item.desc, 'gray');
        const content = `  ${keyPart} ${descPart}`;
        lines.push(this.buildLine(content, maxWidth));
      });
    });
    
    lines.push(this.buildLine('', maxWidth));
    lines.push(this.buildLine(colorize('Press any key to close', 'gray'), maxWidth, 'center'));
    lines.push(this.buildBorder('bottom', maxWidth));
    
    return lines.join('\n');
  }

  /**
   * Prioritize sections when help content is too tall for terminal
   */
  prioritizeSections(sections, maxHeight) {
    // Always include context-specific sections, Pagination, and Global Shortcuts
    const prioritized = [];
    let currentHeight = 6; // Title + borders + bottom text + some padding (more conservative)
    
    // Priority order: context-specific, Pagination, Global Shortcuts
    const contextSection = sections.find(s => s.title !== 'Pagination' && s.title !== 'Global Shortcuts');
    const paginationSection = sections.find(s => s.title === 'Pagination');
    const globalSection = sections.find(s => s.title === 'Global Shortcuts');
    
    // Add context-specific section first if available
    if (contextSection && currentHeight + 3 + contextSection.items.length <= maxHeight) {
      prioritized.push(contextSection);
      currentHeight += 3 + contextSection.items.length; // Section title + underline + items + spacing
    }
    
    // Add Pagination if space allows
    if (paginationSection && currentHeight + 3 + paginationSection.items.length <= maxHeight) {
      prioritized.push(paginationSection);
      currentHeight += 3 + paginationSection.items.length;
    }
    
    // Add Global Shortcuts if space allows
    if (globalSection && currentHeight + 3 + globalSection.items.length <= maxHeight) {
      prioritized.push(globalSection);
      currentHeight += 3 + globalSection.items.length;
    }
    
    return prioritized.length > 0 ? prioritized : [sections[0]]; // Fallback to first section
  }

  /**
   * Build a border line
   */
  buildBorder(type, width) {
    if (type === 'top') {
      return colorize('╔' + '═'.repeat(width - 2) + '╗', 'blue');
    } else {
      return colorize('╚' + '═'.repeat(width - 2) + '╝', 'blue');
    }
  }

  /**
   * Build a content line with proper padding
   */
  buildLine(content, width, align = 'left') {
    // Helper to strip ANSI codes for length calculation
    const stripAnsi = (str) => str.replace(/\x1B\[[0-9;]*m/g, '');
    
    // Calculate true content length without ANSI codes
    const contentLength = stripAnsi(content).length;
    const innerWidth = width - 2; // Account for borders
    
    let paddedContent;
    
    if (align === 'center') {
      const totalPadding = innerWidth - contentLength;
      const leftPadding = Math.floor(totalPadding / 2);
      const rightPadding = totalPadding - leftPadding;
      paddedContent = ' '.repeat(Math.max(0, leftPadding)) + content + ' '.repeat(Math.max(0, rightPadding));
    } else {
      const rightPadding = innerWidth - contentLength;
      paddedContent = content + ' '.repeat(Math.max(0, rightPadding));
    }
    
    return colorize('║', 'blue') + paddedContent + colorize('║', 'blue');
  }

  /**
   * Handle key press - any key closes the help
   */
  handleKey(key, state, context) {
    // Any key closes the help popup
    this.close();
    return true;
  }
}

/**
 * Helper function to show help popup for current screen
 */
function showHelp(screen, context, customHelp = []) {
  const { getPopupManager } = require('../popup-manager');
  const popupManager = getPopupManager();
  
  const helpPopup = new HelpPopup({
    context: context,
    customHelp: customHelp
  });
  
  popupManager.showPopup(helpPopup, screen);
}

module.exports = { HelpPopup, showHelp };