/**
 * Declarative Component System for Terminal UI
 * 
 * This system allows screens to declare WHAT they want to display
 * without knowing HOW it will be rendered or WHERE it will appear.
 * 
 * Components are pure data structures that describe UI elements.
 * The Terminal Manager handles all layout and rendering logic.
 */

/**
 * Base Component class
 * Represents a UI element with a type, properties, and optional children
 */
class Component {
  constructor(type, props = {}, children = []) {
    this.type = type;
    this.props = props;
    this.children = Array.isArray(children) ? children : [children];
  }

  // Helper to add children after creation
  addChild(child) {
    this.children.push(child);
    return this;
  }

  // Helper to update props after creation
  setProp(key, value) {
    this.props[key] = value;
    return this;
  }

  // Clone component with optional prop overrides
  clone(propOverrides = {}) {
    return new Component(
      this.type,
      { ...this.props, ...propOverrides },
      this.children.map(child => child instanceof Component ? child.clone() : child)
    );
  }
}

/**
 * Component Factory Functions
 * These create specific component types with typed props
 */

// Layout Components
const Container = (children = [], props = {}) => 
  new Component('container', props, children);

const Row = (children = [], props = {}) => 
  new Component('row', { ...props, direction: 'horizontal' }, children);

const Column = (children = [], props = {}) => 
  new Component('column', { ...props, direction: 'vertical' }, children);

const Spacer = (lines = 1) => 
  new Component('spacer', { lines });

const Divider = (char = '─', color = 'gray') => 
  new Component('divider', { char, color });

// Navigation Components
const Header = (props = {}) => 
  new Component('header', props);

const Breadcrumbs = (items = [], separator = ' > ') => 
  new Component('breadcrumbs', { items, separator });

const Footer = (content = '', color = 'gray') => 
  new Component('footer', { content, color });

// Text Components
const Text = (content = '', color = null, style = null) => 
  new Component('text', { content, color, style });

const Title = (content = '', color = 'cyan') => 
  new Component('title', { content, color, style: 'bold' });

const Label = (label = '', value = '', labelColor = 'gray', valueColor = 'white') => 
  new Component('label', { label, value, labelColor, valueColor });

const ErrorText = (message = '') => 
  new Component('error', { message, color: 'red' });

const SuccessText = (message = '') => 
  new Component('success', { message, color: 'green' });

const WarningText = (message = '') => 
  new Component('warning', { message, color: 'yellow' });

// Input Components
const SearchInput = (query = '', isActive = false, placeholder = 'Type to search...') => 
  new Component('searchInput', { query, isActive, placeholder });

const TextInput = (value = '', props = {}) => 
  new Component('textInput', {
    value,
    cursorPosition: props.cursorPosition || value.length,
    placeholder: props.placeholder || '',
    showCursor: props.showCursor !== false,
    boxed: props.boxed !== false,
    width: props.width || 40,
    validation: props.validation || null,
    error: props.error || null
  });

// List Components
const List = (items = [], selectedIndex = 0, options = {}) => 
  new Component('list', {
    items,
    selectedIndex,
    paginate: options.paginate !== false,
    maxVisible: options.maxVisible || 'auto',
    showNumbers: options.showNumbers || false,
    showCheckboxes: options.showCheckboxes || false,
    checkedItems: options.checkedItems || [],
    displayFunction: options.displayFunction || ((item) => String(item)),
    highlightColor: options.highlightColor || 'cyan',
    selectionIndicator: options.selectionIndicator || '> ',
    searchQuery: options.searchQuery || null,
    emptyMessage: options.emptyMessage || 'No items',
    showSelectionIndicator: options.showSelectionIndicator !== false
  });

const CompactList = (items = [], options = {}) =>
  new Component('compactList', {
    items,
    columns: options.columns || 3,
    columnWidth: options.columnWidth || 20,
    displayFunction: options.displayFunction || ((item) => String(item))
  });

// Status Components
const ProgressBar = (current, total, width = 40, showPercentage = true) =>
  new Component('progressBar', { current, total, width, showPercentage });

const Spinner = (message = 'Loading...', frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']) =>
  new Component('spinner', { message, frames, frameIndex: 0 });

const StatusMessage = (message = '', type = 'info') =>
  new Component('statusMessage', { message, type });

// Interactive Components
const Menu = (items = [], selectedIndex = 0, options = {}) =>
  new Component('menu', {
    items,
    selectedIndex,
    title: options.title || null,
    showKeys: options.showKeys !== false,
    keyColor: options.keyColor || 'white',
    orientation: options.orientation || 'vertical'
  });

const Tabs = (tabs = [], activeTab = 0, options = {}) =>
  new Component('tabs', {
    tabs,
    activeTab,
    borderStyle: options.borderStyle || 'single',
    activeColor: options.activeColor || 'cyan',
    inactiveColor: options.inactiveColor || 'gray'
  });

const Modal = (content = [], options = {}) =>
  new Component('modal', {
    title: options.title || null,
    width: options.width || 60,
    height: options.height || 'auto',
    borderStyle: options.borderStyle || 'double',
    borderColor: options.borderColor || 'white',
    children: content
  });

const Box = (content = [], options = {}) =>
  new Component('box', {
    title: options.title || null,
    width: options.width || 'auto',
    height: options.height || 'auto',
    borderStyle: options.borderStyle || 'single',
    borderColor: options.borderColor || 'gray',
    padding: options.padding || 1,
    children: content
  });

// Instruction Components
const KeyBinding = (key = '', description = '', keyColor = 'white') =>
  new Component('keyBinding', { key, description, keyColor });

const Instructions = (bindings = [], options = {}) =>
  new Component('instructions', {
    bindings,
    separator: options.separator || ', ',
    compact: options.compact !== false,
    color: options.color || 'gray'
  });

// Helper to create instructions from options
const InstructionsFromOptions = (options = {}) => {
  const bindings = [];
  
  // Core navigation - always show these
  bindings.push({ key: '↑↓/jk', description: 'navigate' });
  
  if (options.hasSearch) {
    bindings.push({ key: '/', description: 'search' });
  }
  
  bindings.push({ key: 'Enter', description: 'select' });
  
  if (options.hasBackNavigation) {
    bindings.push({ key: 'Esc', description: 'go back' });
  }
  
  // Always show help - this is essential
  bindings.push({ key: '?', description: 'help' });
  
  // Always show exit - this is essential
  bindings.push({ key: 'Ctrl+C', description: 'exit' });
  
  return Instructions(bindings, options);
};

// Table Component
const Table = (headers = [], rows = [], options = {}) =>
  new Component('table', {
    headers,
    rows,
    columnWidths: options.columnWidths || 'auto',
    borderStyle: options.borderStyle || 'single',
    headerColor: options.headerColor || 'cyan',
    showRowNumbers: options.showRowNumbers || false,
    maxColumnWidth: options.maxColumnWidth || 30,
    alignment: options.alignment || 'left'
  });

// Debug Component (only shows in debug mode)
const Debug = (data = {}, label = 'Debug') =>
  new Component('debug', { data, label });

/**
 * Component Group Helpers
 * These create common component combinations
 */

const TitledList = (title, items, selectedIndex, options = {}) =>
  Container([
    Title(title),
    Spacer(),
    List(items, selectedIndex, options)
  ]);

const SearchableList = (title, query, isSearchActive, items, selectedIndex, options = {}) =>
  Container([
    Title(title),
    Spacer(),
    SearchInput(query, isSearchActive),
    Spacer(),
    List(items, selectedIndex, { ...options, searchQuery: query })
  ]);

const LabeledValue = (label, value, labelColor = 'gray', valueColor = 'white') =>
  Row([
    Text(label + ': ', labelColor),
    Text(value, valueColor)
  ]);

const ErrorBox = (message, title = 'Error') =>
  Box([
    ErrorText(message)
  ], {
    title,
    borderColor: 'red'
  });

const ConfirmDialog = (message, options = {}) =>
  Modal([
    Text(message),
    Spacer(),
    Text('Press Y to confirm, N to cancel', 'gray')
  ], {
    title: options.title || 'Confirm',
    width: options.width || 50
  });

/**
 * Layout Helpers
 * These help with complex layouts
 */

const Split = (left = [], right = [], ratio = 0.5) =>
  new Component('split', {
    left,
    right,
    ratio,
    direction: 'horizontal'
  });

const Stack = (items = [], spacing = 1) => {
  const result = [];
  items.forEach((item, index) => {
    result.push(item);
    if (index < items.length - 1 && spacing > 0) {
      result.push(Spacer(spacing));
    }
  });
  return Container(result);
};

const Center = (content = [], width = 'auto') =>
  new Component('center', { content, width });

/**
 * Export all component factories and the base Component class
 */
module.exports = {
  // Base class
  Component,
  
  // Layout
  Container,
  Row,
  Column,
  Spacer,
  Divider,
  Split,
  Stack,
  Center,
  
  // Navigation
  Header,
  Breadcrumbs,
  Footer,
  
  // Text
  Text,
  Title,
  Label,
  ErrorText,
  SuccessText,
  WarningText,
  LabeledValue,
  
  // Input
  SearchInput,
  TextInput,
  
  // Lists
  List,
  CompactList,
  
  // Status
  ProgressBar,
  Spinner,
  StatusMessage,
  
  // Interactive
  Menu,
  Tabs,
  Modal,
  Box,
  
  // Instructions
  KeyBinding,
  Instructions,
  InstructionsFromOptions,
  
  // Table
  Table,
  
  // Debug
  Debug,
  
  // Groups
  TitledList,
  SearchableList,
  ErrorBox,
  ConfirmDialog
};