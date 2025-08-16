#!/usr/bin/env node

const { colorize } = require('./lib/colors');
const { ErrorHandler } = require('./lib/error-handler');
const { config } = require('./lib/config');
const { parseCopyArgs, handleCopyCommand } = require('./commands/copy');
const { parseListArgs, handleListCommand } = require('./commands/list');
const { parseInspectArgs, handleInspectCommand } = require('./commands/inspect');
const { parseInteractiveArgs, handleInteractiveCommand } = require('./commands/interactive');
const debugLogger = require('./lib/debug-logger');

// Global error handlers for debugging
process.on('uncaughtException', (error) => {
  debugLogger.error('CLI', 'UNCAUGHT EXCEPTION', error);
  
  // Don't pollute interactive mode with debug output
  const isInteractive = debugLogger.isInteractiveMode();
  if (!isInteractive) {
    console.error('\x1b[31mUNCAUGHT EXCEPTION:\x1b[0m', error.message);
    console.error('Stack:', error.stack);
    if (process.env.LOWKEY_DEBUG === 'true') {
      console.error('Debug log saved to:', debugLogger.getLogPath());
    }
  }
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  debugLogger.error('CLI', 'UNHANDLED REJECTION', reason);
  
  // Don't pollute interactive mode with debug output
  const isInteractive = debugLogger.isInteractiveMode();
  if (!isInteractive) {
    console.error('\x1b[31mUNHANDLED REJECTION:\x1b[0m', reason);
    console.error('Promise:', promise);
    if (process.env.LOWKEY_DEBUG === 'true') {
      console.error('Debug log saved to:', debugLogger.getLogPath());
    }
  }
  process.exit(1);
});

function parseArgs() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    showHelp();
    process.exit(1);
  }
  
  const command = args[0];
  
  if (command === '--version' || command === '-v') {
    showVersion();
    process.exit(0);
  } else if (command === '--help' || command === '-h') {
    showHelp();
    process.exit(0);
  }
  
  if (!['copy', 'list', 'inspect', 'interactive', 'x'].includes(command)) {
    console.error(colorize(`Error: Unknown command '${command}'. Available commands: copy, list, inspect, interactive (x)`, 'red'));
    showHelp();
    process.exit(1);
  }
  
  if (command === 'copy') {
    return parseCopyArgs(args.slice(1));
  } else if (command === 'list') {
    return parseListArgs(args.slice(1));
  } else if (command === 'inspect') {
    return parseInspectArgs(args.slice(1));
  } else if (command === 'interactive' || command === 'x') {
    return parseInteractiveArgs(args.slice(1));
  }
}

function showVersion() {
  const packageJson = require('./package.json');
  console.log(`lowkey v${packageJson.version}`);
}

function showHelp() {
  console.log(`
${colorize('Usage:', 'cyan')} lowkey <command> [options]

${colorize('Commands:', 'cyan')}
  ${colorize('copy', 'bold')}                     Copy secrets between storage types
  ${colorize('list', 'bold')}                     List available secrets for each storage type
  ${colorize('inspect', 'bold')}                  Show help for inspecting secrets
  ${colorize('interactive, x', 'bold')}           Interactive secret browser and inspector

${colorize('Global Options:', 'cyan')}
  ${colorize('--version, -v', 'bold')}            Show version number
  ${colorize('--help, -h', 'bold')}               Show this help message

Use ${colorize("'lowkey <command> --help'", 'bold')} for more information about a command.

${colorize('Examples:', 'cyan')}
  lowkey ${colorize('copy', 'bold')} --input-type env --input-name .env --output-type json
  lowkey ${colorize('list', 'bold')} --type aws-secrets-manager --region us-east-1
  lowkey ${colorize('list', 'bold')} --type env --path ./config
  lowkey ${colorize('interactive', 'bold')}                   ${colorize('# Interactive secret browser', 'gray')}
  lowkey ${colorize('x', 'bold')}                            ${colorize('# Same as interactive (alias)', 'gray')}
  lowkey ${colorize('inspect', 'bold')} --help               ${colorize('# Show inspect help', 'gray')}
`);
}

async function main() {
  // Initialize configuration early
  config.initialize();
  
  debugLogger.log('CLI', 'Starting lowkey', { argv: process.argv });
  
  try {
    const options = parseArgs();
    debugLogger.log('CLI', 'Parsed options', options);
    
    if (options.command === 'copy') {
      await handleCopyCommand(options);
    } else if (options.command === 'list') {
      await handleListCommand(options);
    } else if (options.command === 'inspect') {
      await handleInspectCommand(options);
    } else if (options.command === 'interactive') {
      await handleInteractiveCommand(options);
    } else {
      throw new Error(`Unknown command: ${options.command}`);
    }
    
    // Ensure the process exits cleanly
    process.exit(0);
    
  } catch (error) {
    console.error(colorize(`Error: ${error.message}`, 'red'));
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}