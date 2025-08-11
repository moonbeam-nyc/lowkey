const { colorize } = require('../lib/colors');
const { parseCommonArgs, handleRegionFallback } = require('../lib/arg-parser');

function parseInteractiveArgs(args) {
  const options = parseCommonArgs(args, {
    defaults: { command: 'interactive' },
    showHelp: showInteractiveHelp
  });

  handleRegionFallback(options);

  return options;
}

function showInteractiveHelp() {
  console.log(`
${colorize('Usage:', 'cyan')} lowkey interactive [options]
       lowkey x [options]

Launch an interactive secret browser and inspector with improved state management.

${colorize('Options:', 'cyan')}
  ${colorize('--region <region>', 'bold')}        AWS region (or use AWS_REGION environment variable)
  ${colorize('--path <path>', 'bold')}            Directory path to search for files (default: current directory)
  ${colorize('--help, -h', 'bold')}               Show this help message

${colorize('Features:', 'cyan')}
  • Improved state isolation between screens
  • Better navigation with preserved search state
  • Enhanced error handling and recovery
  • Fuzzy searchable interface for browsing secrets
  • Navigate with arrow keys and type to filter
  • Toggle between showing keys only or keys with values
  • Support for AWS Secrets Manager, environment files, and JSON files
  • Breadcrumb navigation with escape key to go back

${colorize('Examples:', 'cyan')}
  ${colorize('# Launch interactive mode', 'gray')}
  lowkey ${colorize('interactive', 'bold')}

  ${colorize('# Short alias', 'gray')}
  lowkey ${colorize('x', 'bold')}

  ${colorize('# Specify AWS region', 'gray')}
  lowkey ${colorize('x', 'bold')} --region us-west-2

  ${colorize('# Search in specific directory for files', 'gray')}
  lowkey ${colorize('x', 'bold')} --path ./config
`);
}

async function handleInteractiveCommand(options, searchState = {}) {
  const { TerminalManager } = require('../lib/terminal-manager');
  const { TypeSelectionScreen } = require('../lib/screen');
  
  try {
    const terminalManager = TerminalManager.getInstance();
    terminalManager.initialize();
    
    try {
      // Create the initial type selection screen
      const typeScreen = new TypeSelectionScreen(options);
      terminalManager.setRootScreen(typeScreen);
      
      // Wait for the user to complete or exit the interaction
      await waitForExit(terminalManager);
      
    } finally {
      terminalManager.cleanup();
    }
    
  } catch (error) {
    console.error(colorize(`Error in interactive command: ${error.message}`, 'red'));
    process.exit(1);
  }
}

// Helper function to wait for the terminal interaction to complete
async function waitForExit(terminalManager) {
  return new Promise((resolve) => {
    // Monitor for exit conditions
    const checkForExit = () => {
      if (!terminalManager.active || terminalManager.screenDepth === 0) {
        resolve();
        return;
      }
      setTimeout(checkForExit, 100); // Check every 100ms
    };
    
    // Start monitoring
    setTimeout(checkForExit, 100);
    
    // Also listen for process signals that might end the interaction
    const exitHandler = () => {
      resolve();
    };
    
    process.once('SIGINT', exitHandler);
    process.once('SIGTERM', exitHandler);
  });
}

module.exports = {
  parseInteractiveArgs,
  showInteractiveHelp,
  handleInteractiveCommand
};