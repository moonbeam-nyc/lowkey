// Centralized terminal utilities for ANSI codes, TTY operations, and terminal control

const { config } = require('./config');

// ANSI escape sequences
const ANSI = {
  // Cursor control
  CURSOR_HOME: '\x1b[H',
  CURSOR_HIDE: '\x1b[?25l',
  CURSOR_SHOW: '\x1b[?25h',
  CURSOR_SAVE: '\x1b[s',
  CURSOR_RESTORE: '\x1b[u',
  
  // Screen control
  CLEAR_SCREEN: '\x1b[2J',
  CLEAR_LINE: '\x1b[2K',
  CLEAR_TO_END: '\x1b[0J',
  CLEAR_TO_LINE_END: '\x1b[0K',
  
  // Alternate screen buffer
  ALT_SCREEN_ENTER: '\x1b[?1049h',
  ALT_SCREEN_EXIT: '\x1b[?1049l',
  
  // Colors and styling
  RESET: '\x1b[0m',
  BOLD: '\x1b[1m',
  DIM: '\x1b[2m',
  UNDERLINE: '\x1b[4m',
  REVERSE: '\x1b[7m',
  
  // Foreground colors
  FG_BLACK: '\x1b[30m',
  FG_RED: '\x1b[31m',
  FG_GREEN: '\x1b[32m',
  FG_YELLOW: '\x1b[33m',
  FG_BLUE: '\x1b[34m',
  FG_MAGENTA: '\x1b[35m',
  FG_CYAN: '\x1b[36m',
  FG_WHITE: '\x1b[37m',
  FG_GRAY: '\x1b[90m',
  FG_BRIGHT_WHITE: '\x1b[97m',
  
  // Background colors
  BG_BLACK: '\x1b[40m',
  BG_RED: '\x1b[41m',
  BG_GREEN: '\x1b[42m',
  BG_YELLOW: '\x1b[43m',
  BG_BLUE: '\x1b[44m',
  BG_MAGENTA: '\x1b[45m',
  BG_CYAN: '\x1b[46m',
  BG_WHITE: '\x1b[47m'
};

// Terminal state management
class Terminal {
  constructor() {
    this.isRaw = false;
    this.isAlternateScreen = false;
    this.originalStdinListeners = null;
  }

  // Check if running in TTY environment
  isTTY() {
    // Never consider TTY in test environment
    if (config.isTestEnvironment()) {
      return false;
    }
    return process.stdin.isTTY && process.stdout.isTTY;
  }

  // Get terminal dimensions
  getDimensions() {
    return {
      rows: process.stdout.rows || 24,
      columns: process.stdout.columns || 80
    };
  }

  // Enable raw mode
  enableRawMode() {
    if (!this.isTTY() || this.isRaw) return false;
    
    if (process.stdin.setRawMode) {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      this.isRaw = true;
      return true;
    }
    return false;
  }

  // Disable raw mode
  disableRawMode() {
    if (!this.isTTY() || !this.isRaw) return false;
    
    if (process.stdin.setRawMode) {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      this.isRaw = false;
      return true;
    }
    return false;
  }

  // Enter alternate screen buffer
  enterAlternateScreen() {
    if (!this.isTTY() || this.isAlternateScreen) return false;
    
    this.write(ANSI.ALT_SCREEN_ENTER);
    this.isAlternateScreen = true;
    return true;
  }

  // Exit alternate screen buffer
  exitAlternateScreen() {
    if (!this.isTTY() || !this.isAlternateScreen) return false;
    
    // Clear and reset before exiting
    this.write(ANSI.CLEAR_SCREEN + ANSI.CURSOR_HOME);
    this.write(ANSI.ALT_SCREEN_EXIT);
    this.isAlternateScreen = false;
    return true;
  }

  // Write to stdout (respects alternate screen state)
  write(text) {
    // In test environment, don't write directly to stdout
    if (config.isTestEnvironment()) {
      return;
    }
    if (process.stdout.isTTY) {
      process.stdout.write(text);
    }
  }

  // Clear screen
  clearScreen() {
    this.write(ANSI.CLEAR_SCREEN + ANSI.CURSOR_HOME);
  }

  // Clear current line
  clearLine() {
    this.write('\r' + ANSI.CLEAR_LINE);
  }

  // Move cursor to position
  moveCursor(row, col) {
    this.write(`\x1b[${row};${col}H`);
  }

  // Hide cursor
  hideCursor() {
    this.write(ANSI.CURSOR_HIDE);
  }

  // Show cursor
  showCursor() {
    this.write(ANSI.CURSOR_SHOW);
  }

  // Save all stdin listeners (for temporary removal)
  saveStdinListeners() {
    if (process.stdin.listeners) {
      this.originalStdinListeners = process.stdin.listeners('data').slice();
    }
  }

  // Restore stdin listeners
  restoreStdinListeners() {
    if (this.originalStdinListeners) {
      process.stdin.removeAllListeners('data');
      this.originalStdinListeners.forEach(listener => {
        process.stdin.on('data', listener);
      });
      this.originalStdinListeners = null;
    }
  }

  // Remove all stdin listeners
  clearStdinListeners() {
    process.stdin.removeAllListeners('data');
  }

  // Full cleanup
  cleanup() {
    this.showCursor();
    this.disableRawMode();
    this.exitAlternateScreen();
    this.clearStdinListeners();
  }
}

// Output utilities that respect terminal state
class Output {
  constructor(terminal) {
    this.terminal = terminal || new Terminal();
  }

  // Write to appropriate output based on terminal state
  log(message, options = {}) {
    const { color, stderr = false } = options;
    
    let output = message;
    if (color && ANSI[`FG_${color.toUpperCase()}`]) {
      output = ANSI[`FG_${color.toUpperCase()}`] + message + ANSI.RESET;
    }

    // In alternate screen, write directly to stdout
    if (this.terminal.isAlternateScreen) {
      this.terminal.write(output + '\n');
    } else {
      // Normal mode - use console
      if (stderr) {
        console.error(output);
      } else {
        console.log(output);
      }
    }
  }

  // Error output (always to stderr unless in alternate screen)
  error(message, options = {}) {
    this.log(message, { ...options, stderr: true, color: options.color || 'red' });
  }

  // Warning output
  warn(message, options = {}) {
    this.log(message, { ...options, stderr: true, color: options.color || 'yellow' });
  }

  // Info output
  info(message, options = {}) {
    this.log(message, { ...options, color: options.color || 'cyan' });
  }

  // Success output
  success(message, options = {}) {
    this.log(message, { ...options, color: options.color || 'green' });
  }

  // Debug output (only if DEBUG env var is set)
  debug(message, options = {}) {
    if (config.isDebugEnabled()) {
      this.log(`[DEBUG] ${message}`, { ...options, stderr: true, color: options.color || 'gray' });
    }
  }
}

// Create singleton instances
const terminal = new Terminal();
const output = new Output(terminal);

// Color mapping for backward compatibility
const colorMap = {
  reset: ANSI.RESET,
  bright: ANSI.BOLD,
  bold: ANSI.BOLD + ANSI.FG_WHITE,
  red: ANSI.FG_RED,
  green: ANSI.FG_GREEN,
  yellow: ANSI.FG_YELLOW,
  blue: ANSI.FG_BLUE,
  cyan: ANSI.FG_CYAN,
  gray: ANSI.FG_GRAY
};

// Backward compatible colorize function
function colorize(text, color) {
  if (!color || !colorMap[color]) return text;
  return colorMap[color] + text + ANSI.RESET;
}

module.exports = {
  ANSI,
  Terminal,
  Output,
  terminal,
  output,
  colorize
};