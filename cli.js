#!/usr/bin/env node

const { colorize } = require('./lib/colors');
const { parseCopyArgs, handleCopyCommand } = require('./commands/copy');
const { parseListArgs, handleListCommand } = require('./commands/list');
const { parseInspectArgs, handleInspectCommand } = require('./commands/inspect');
const { parseInteractiveArgs, handleInteractiveCommand } = require('./commands/interactive');

// Global error handlers for debugging
process.on('uncaughtException', (error) => {
  console.error('\x1b[31mUNCAUGHT EXCEPTION:\x1b[0m', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('\x1b[31mUNHANDLED REJECTION:\x1b[0m', reason);
  console.error('Promise:', promise);
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
Usage: lowkey <command> [options]

Commands:
  copy                     Copy secrets between storage types
  list                     List available secrets for each storage type
  inspect                  Show help for inspecting secrets
  interactive, x           Interactive secret browser and inspector

Global Options:
  --version, -v            Show version number
  --help, -h               Show this help message

Use 'lowkey <command> --help' for more information about a command.

Examples:
  lowkey copy --input-type env --input-name .env --output-type json
  lowkey list --type aws-secrets-manager --region us-east-1
  lowkey list --type env --path ./config
  lowkey interactive                   # Interactive secret browser
  lowkey x                            # Same as interactive (alias)
  lowkey inspect --help               # Show inspect help
`);
}

async function main() {
  try {
    const options = parseArgs();
    
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