// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  bold: '\x1b[1m\x1b[37m', // Bold white
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

function colorize(text, color) {
  // Only colorize if outputting to a terminal
  if (process.stderr.isTTY) {
    return `${colors[color]}${text}${colors.reset}`;
  }
  return text;
}

module.exports = { colors, colorize };