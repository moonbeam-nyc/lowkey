/**
 * Component Renderer
 * 
 * Converts declarative components into terminal output.
 * Handles layout calculations, pagination, and rendering logic.
 */

const { colorize } = require('../core/colors');
const { terminal } = require('./terminal-utils');
const { INTERACTIVE } = require('../core/constants');

class ComponentRenderer {
  constructor() {
    // Cache terminal dimensions
    this.dimensions = { rows: 24, cols: 80 };
    this.updateDimensions();
    
    // Track current rendering context
    this.context = {
      availableHeight: 0,
      availableWidth: 0,
      currentLine: 0,
      headerHeight: 0,
      footerHeight: 0
    };
  }

  updateDimensions() {
    const dims = terminal.getDimensions();
    this.dimensions = dims;
    return dims;
  }

  /**
   * Main render method - converts components to terminal output
   */
  render(components, options = {}) {
    this.updateDimensions();
    
    // Flatten array of components
    const flatComponents = this.flattenComponents(components);
    
    // Separate components by zone (header, body, footer)
    const zones = this.organizeIntoZones(flatComponents);
    
    // Calculate layout for each zone
    const layout = this.calculateLayout(zones);
    
    // Render each zone to lines
    const lines = this.renderLayout(layout);
    
    // Join and return as string
    return lines.join('\n');
  }

  /**
   * Flatten nested component arrays
   */
  flattenComponents(components) {
    const flat = [];
    
    const flatten = (items) => {
      if (!items) return;
      
      if (Array.isArray(items)) {
        items.forEach(item => flatten(item));
      } else if (items && items.type) {
        flat.push(items);
      }
    };
    
    flatten(components);
    return flat;
  }

  /**
   * Organize components into header, body, and footer zones
   */
  organizeIntoZones(components) {
    const zones = {
      header: [],
      body: [],
      footer: []
    };
    
    components.forEach(component => {
      switch (component.type) {
        case 'header':
          zones.header.push(component);
          break;
        case 'footer':
        case 'instructions':
          zones.footer.push(component);
          break;
        default:
          zones.body.push(component);
      }
    });
    
    return zones;
  }

  /**
   * Calculate layout dimensions for each zone
   */
  calculateLayout(zones) {
    const layout = {
      header: { lines: [], height: 0 },
      body: { lines: [], height: 0 },
      footer: { lines: [], height: 0 }
    };
    
    // Render header (fixed height)
    if (zones.header.length > 0) {
      layout.header.lines = this.renderComponents(zones.header);
      layout.header.height = layout.header.lines.length;
    }
    
    // Render footer (fixed height)
    if (zones.footer.length > 0) {
      layout.footer.lines = this.renderComponents(zones.footer);
      layout.footer.height = layout.footer.lines.length;
    }
    
    // Calculate available height for body
    const reservedLines = INTERACTIVE.RESERVED_LINES_FOR_UI || 2;
    const availableHeight = Math.max(
      INTERACTIVE.MIN_AVAILABLE_HEIGHT || 5,
      this.dimensions.rows - layout.header.height - layout.footer.height - reservedLines
    );
    
    // Set context for body rendering
    this.context = {
      availableHeight,
      availableWidth: this.dimensions.cols,
      headerHeight: layout.header.height,
      footerHeight: layout.footer.height
    };
    
    // Render body with pagination context
    layout.body.lines = this.renderComponents(zones.body);
    layout.body.height = layout.body.lines.length;
    
    return layout;
  }

  /**
   * Render layout to final lines
   */
  renderLayout(layout) {
    const lines = [];
    
    // Add header
    lines.push(...layout.header.lines);
    
    // Add body
    lines.push(...layout.body.lines);
    
    // Add footer
    lines.push(...layout.footer.lines);
    
    return lines;
  }

  /**
   * Render an array of components to lines
   */
  renderComponents(components) {
    const lines = [];
    
    components.forEach(component => {
      const componentLines = this.renderComponent(component);
      if (componentLines) {
        if (Array.isArray(componentLines)) {
          lines.push(...componentLines);
        } else {
          lines.push(componentLines);
        }
      }
    });
    
    return lines;
  }

  /**
   * Render a single component
   */
  renderComponent(component) {
    if (!component || !component.type) return null;
    
    switch (component.type) {
      case 'header':
        return this.renderHeader(component);
      case 'breadcrumbs':
        return this.renderBreadcrumbs(component);
      case 'text':
        return this.renderText(component);
      case 'title':
        return this.renderTitle(component);
      case 'spacer':
        return this.renderSpacer(component);
      case 'divider':
        return this.renderDivider(component);
      case 'searchInput':
        return this.renderSearchInput(component);
      case 'textInput':
        return this.renderTextInput(component);
      case 'list':
        return this.renderList(component);
      case 'compactList':
        return this.renderCompactList(component);
      case 'instructions':
        return this.renderInstructions(component);
      case 'container':
        return this.renderContainer(component);
      case 'row':
        return this.renderRow(component);
      case 'box':
        return this.renderBox(component);
      case 'modal':
        return this.renderModal(component);
      case 'error':
        return this.renderError(component);
      case 'success':
        return this.renderSuccess(component);
      case 'warning':
        return this.renderWarning(component);
      case 'label':
        return this.renderLabel(component);
      case 'progressBar':
        return this.renderProgressBar(component);
      case 'table':
        return this.renderTable(component);
      default:
        return null;
    }
  }

  // Component Renderers

  renderHeader(component) {
    // Get header from Terminal Manager
    const { TerminalManager } = require('./terminal-manager');
    const terminalManager = TerminalManager.getInstance();
    const { breadcrumbs = [] } = component.props;
    return terminalManager.getHeaderLines(breadcrumbs);
  }

  renderBreadcrumbs(component) {
    const { items = [], separator = ' > ' } = component.props;
    if (items.length === 0) return null;
    
    // Style breadcrumbs with hierarchy: parent items in gray, current item in white
    const styledItems = items.map((item, index) => {
      const isCurrentScreen = index === items.length - 1;
      return colorize(item, isCurrentScreen ? 'white' : 'gray');
    });
    
    const graySeparator = colorize(separator, 'gray');
    return styledItems.join(graySeparator);
  }

  renderText(component) {
    const { content, color, style } = component.props;
    if (!content) return null;
    
    let text = content;
    if (color) {
      text = colorize(text, color);
    }
    return text;
  }

  renderTitle(component) {
    const { content, color = 'cyan' } = component.props;
    if (!content) return null;
    return colorize(content, color);
  }

  renderSpacer(component) {
    const { lines = 1 } = component.props;
    return Array(lines).fill('');
  }

  renderDivider(component) {
    const { char = '─', color = 'gray' } = component.props;
    const width = this.context.availableWidth || this.dimensions.cols;
    const line = char.repeat(width);
    return color ? colorize(line, color) : line;
  }

  renderSearchInput(component) {
    const { query = '', isActive = false, placeholder = 'Type to search...' } = component.props;
    
    // Only show placeholder when actively searching but no query yet
    if (isActive && !query) {
      return colorize(placeholder, 'gray');
    }
    
    // Show nothing when not in search mode and no filter
    if (!isActive && !query) {
      return '';
    }
    
    const cursor = isActive ? colorize('█', 'white') : '';
    return `Search: ${query}${cursor}`;
  }

  renderTextInput(component) {
    const { 
      value = '', 
      cursorPosition = 0,
      placeholder = '',
      showCursor = true,
      boxed = true,
      width = 40,
      error = null
    } = component.props;
    
    const lines = [];
    
    // Calculate display content
    let displayContent;
    let actualLength;
    
    if (value) {
      // Show actual value with cursor
      const beforeCursor = value.slice(0, cursorPosition);
      const afterCursor = value.slice(cursorPosition);
      const cursor = showCursor ? colorize('█', 'white') : '';
      displayContent = beforeCursor + cursor + afterCursor;
      actualLength = value.length + (showCursor ? 1 : 0);
    } else {
      // Show placeholder or cursor for empty input
      if (placeholder && !showCursor) {
        displayContent = colorize(placeholder, 'gray');
        actualLength = placeholder.length;
      } else {
        // Empty input with cursor at start
        const cursor = showCursor ? colorize('█', 'white') : '';
        displayContent = cursor;
        actualLength = showCursor ? 1 : 0;
      }
    }
    
    // Add box if requested
    if (boxed) {
      const padding = Math.max(0, width - actualLength);
      const spaces = ' '.repeat(padding);
      
      lines.push('┌' + '─'.repeat(width) + '┐');
      lines.push('│' + displayContent + spaces + '│');
      lines.push('└' + '─'.repeat(width) + '┘');
    } else {
      lines.push(displayContent);
    }
    
    // Add error if present
    if (error) {
      lines.push(colorize(`Error: ${error}`, 'red'));
    }
    
    return lines;
  }

  renderList(component) {
    const {
      items = [],
      selectedIndex = 0,
      paginate = true,
      maxVisible = 'auto',
      displayFunction = (item) => String(item),
      highlightColor = 'cyan',
      selectionIndicator = '> ',
      searchQuery = null,
      emptyMessage = 'No items'
    } = component.props;
    
    if (items.length === 0) {
      return colorize(emptyMessage, 'yellow');
    }
    
    const lines = [];
    let startIndex = 0;
    let endIndex = items.length;
    
    // Handle pagination
    if (paginate && maxVisible !== 'all') {
      const visibleCount = maxVisible === 'auto' 
        ? this.context.availableHeight - 2 // Leave room for indicators
        : maxVisible;
      
      // Calculate window
      const halfHeight = Math.floor(visibleCount / 2);
      startIndex = Math.max(0, selectedIndex - halfHeight);
      endIndex = Math.min(items.length, startIndex + visibleCount);
      
      // Add "more above" indicator
      if (startIndex > 0) {
        lines.push(colorize(`⋮ ${startIndex} more above`, 'gray'));
      }
    }
    
    // Render visible items
    for (let i = startIndex; i < endIndex; i++) {
      const item = items[i];
      const isSelected = i === selectedIndex;
      
      // Get display text
      let displayText = displayFunction(item);
      
      // Highlight search matches
      if (searchQuery && typeof displayText === 'string') {
        try {
          const regex = new RegExp(`(${searchQuery})`, 'gi');
          displayText = displayText.replace(regex, colorize('$1', 'yellow'));
        } catch (e) {
          // Invalid regex, skip highlighting
        }
      }
      
      // Add selection indicator
      const prefix = isSelected ? colorize(selectionIndicator, 'green') : ' '.repeat(selectionIndicator.length);
      
      // Apply selection highlighting
      if (isSelected) {
        displayText = colorize(displayText, highlightColor);
      }
      
      lines.push(prefix + displayText);
    }
    
    // Add "more below" indicator
    if (paginate && endIndex < items.length) {
      const remaining = items.length - endIndex;
      lines.push(colorize(`⋮ ${remaining} more below`, 'gray'));
    }
    
    return lines;
  }

  renderCompactList(component) {
    const {
      items = [],
      columns = 3,
      columnWidth = 20,
      displayFunction = (item) => String(item)
    } = component.props;
    
    const lines = [];
    
    for (let i = 0; i < items.length; i += columns) {
      const rowItems = items.slice(i, i + columns);
      const row = rowItems.map(item => {
        const text = displayFunction(item);
        if (text.length > columnWidth) {
          return text.slice(0, columnWidth - 3) + '...';
        }
        return text.padEnd(columnWidth);
      }).join(' ');
      lines.push(row);
    }
    
    return lines;
  }

  renderInstructions(component) {
    const {
      bindings = [],
      separator = ', ',
      color = 'gray'
    } = component.props;
    
    if (bindings.length === 0) return null;
    
    const parts = bindings.map(binding => {
      const key = colorize(binding.key, binding.keyColor || 'white');
      return `${key} ${binding.description}`;
    });
    
    return colorize(parts.join(separator), color);
  }

  renderContainer(component) {
    const lines = [];
    
    if (component.children && component.children.length > 0) {
      component.children.forEach(child => {
        const childLines = this.renderComponent(child);
        if (childLines) {
          if (Array.isArray(childLines)) {
            lines.push(...childLines);
          } else {
            lines.push(childLines);
          }
        }
      });
    }
    
    return lines;
  }

  renderRow(component) {
    // For now, just render children vertically
    // TODO: Implement horizontal layout
    return this.renderContainer(component);
  }

  renderBox(component) {
    const {
      title = null,
      borderStyle = 'single',
      borderColor = 'gray',
      padding = 1,
      width = 'auto'
    } = component.props;
    
    const lines = [];
    
    // Get box characters based on style
    const chars = borderStyle === 'double' 
      ? { tl: '╔', tr: '╗', bl: '╚', br: '╝', h: '═', v: '║' }
      : { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│' };
    
    // Render content
    const contentLines = this.renderContainer(component);
    
    // Calculate width
    const contentWidth = width === 'auto' 
      ? Math.max(...contentLines.map(line => this.stripAnsi(line).length))
      : width;
    const boxWidth = contentWidth + (padding * 2);
    
    // Top border
    let topBorder = chars.tl + chars.h.repeat(boxWidth) + chars.tr;
    if (title) {
      const titleText = ` ${title} `;
      const titleStart = Math.floor((boxWidth - titleText.length) / 2);
      topBorder = chars.tl + chars.h.repeat(titleStart) + titleText + 
                  chars.h.repeat(boxWidth - titleStart - titleText.length) + chars.tr;
    }
    lines.push(colorize(topBorder, borderColor));
    
    // Add top padding
    for (let i = 0; i < padding; i++) {
      lines.push(colorize(chars.v + ' '.repeat(boxWidth) + chars.v, borderColor));
    }
    
    // Content with side borders
    contentLines.forEach(line => {
      const stripped = this.stripAnsi(line);
      const paddingNeeded = boxWidth - stripped.length;
      const leftPad = ' '.repeat(padding);
      const rightPad = ' '.repeat(Math.max(0, paddingNeeded - padding));
      lines.push(
        colorize(chars.v, borderColor) + 
        leftPad + line + rightPad + 
        colorize(chars.v, borderColor)
      );
    });
    
    // Add bottom padding
    for (let i = 0; i < padding; i++) {
      lines.push(colorize(chars.v + ' '.repeat(boxWidth) + chars.v, borderColor));
    }
    
    // Bottom border
    lines.push(colorize(chars.bl + chars.h.repeat(boxWidth) + chars.br, borderColor));
    
    return lines;
  }

  renderModal(component) {
    // Modal is like a box but centered
    // For now, just render as a box
    return this.renderBox({
      ...component,
      props: {
        ...component.props,
        borderStyle: component.props.borderStyle || 'double'
      }
    });
  }

  renderError(component) {
    const { message } = component.props;
    return colorize(`⚠️  ${message}`, 'red');
  }

  renderSuccess(component) {
    const { message } = component.props;
    return colorize(`✅ ${message}`, 'green');
  }

  renderWarning(component) {
    const { message } = component.props;
    return colorize(`⚠️  ${message}`, 'yellow');
  }

  renderLabel(component) {
    const { label, value, labelColor = 'gray', valueColor = 'white' } = component.props;
    return colorize(label, labelColor) + ': ' + colorize(value, valueColor);
  }

  renderProgressBar(component) {
    const { current, total, width = 40, showPercentage = true } = component.props;
    
    const percentage = Math.round((current / total) * 100);
    const filled = Math.round((current / total) * width);
    const empty = width - filled;
    
    let bar = '[' + '█'.repeat(filled) + '░'.repeat(empty) + ']';
    
    if (showPercentage) {
      bar += ` ${percentage}%`;
    }
    
    return bar;
  }

  renderTable(component) {
    const {
      headers = [],
      rows = [],
      headerColor = 'cyan',
      borderStyle = 'single'
    } = component.props;
    
    if (headers.length === 0 && rows.length === 0) {
      return null;
    }
    
    const lines = [];
    
    // Calculate column widths
    const columnWidths = headers.map((header, i) => {
      const headerWidth = header.length;
      const maxRowWidth = Math.max(...rows.map(row => (row[i] || '').toString().length));
      return Math.max(headerWidth, maxRowWidth) + 2; // Add padding
    });
    
    // Render headers
    if (headers.length > 0) {
      const headerRow = headers.map((header, i) => 
        header.padEnd(columnWidths[i])
      ).join('│');
      lines.push(colorize(headerRow, headerColor));
      
      // Add separator
      const separator = columnWidths.map(width => '─'.repeat(width)).join('┼');
      lines.push(separator);
    }
    
    // Render rows
    rows.forEach(row => {
      const rowText = row.map((cell, i) => 
        (cell || '').toString().padEnd(columnWidths[i] || 10)
      ).join('│');
      lines.push(rowText);
    });
    
    return lines;
  }

  // Utility methods

  stripAnsi(str) {
    // Remove ANSI escape codes for length calculations
    return str.replace(/\x1b\[[0-9;]*m/g, '');
  }
}

module.exports = { ComponentRenderer };