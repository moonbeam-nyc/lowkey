const { colorize } = require('../lib/colors');
const { runInteractiveInspect, interactiveKeyBrowser } = require('../lib/interactive');
const { fetchSecret, parseSecretData } = require('../lib/secrets');

function parseInteractiveArgs(args) {
  const options = {
    command: 'interactive',
    region: null,
    path: '.'
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--region' && i + 1 < args.length) {
      options.region = args[++i];
    } else if (arg === '--path' && i + 1 < args.length) {
      options.path = args[++i];
    } else if (arg === '--help' || arg === '-h') {
      showInteractiveHelp();
      process.exit(0);
    } else {
      console.error(colorize(`Error: Unknown option '${arg}'`, 'red'));
      showInteractiveHelp();
      process.exit(1);
    }
  }

  return options;
}

function showInteractiveHelp() {
  console.log(`
Usage: lowkey interactive [options]
       lowkey x [options]

Launch an interactive secret browser and inspector.

Options:
  --region <region>        AWS region (or use AWS_REGION environment variable)
  --path <path>            Directory path to search for files (default: current directory)
  --help, -h               Show this help message

Features:
  • Fuzzy searchable interface for browsing secrets
  • Navigate with arrow keys and type to filter
  • Toggle between showing keys only or keys with values
  • Support for AWS Secrets Manager, environment files, and JSON files
  • Breadcrumb navigation with escape key to go back

Examples:
  # Launch interactive mode
  lowkey interactive

  # Short alias
  lowkey x

  # Specify AWS region
  lowkey x --region us-west-2

  # Search in specific directory for files
  lowkey x --path ./config
`);
}

async function handleInteractiveCommand(options) {
  try {
    // Enter alternate screen buffer to preserve terminal history
    process.stdout.write('\x1b[?1049h');
    
    // Ensure we restore the screen on exit
    const restoreScreen = () => {
      process.stdout.write('\x1b[?1049l');
    };
    
    process.on('exit', restoreScreen);
    process.on('SIGINT', () => {
      restoreScreen();
      process.exit(0);
    });
    process.on('SIGTERM', restoreScreen);
    
    // Start the interactive flow immediately
    const interactiveOptions = await runInteractiveInspect(options);
    
    try {
      // Fetch the secret data - map inspect options to fetchSecret format
      const fetchOptions = {
        inputType: interactiveOptions.type,
        inputName: interactiveOptions.name,
        region: interactiveOptions.region,
        path: interactiveOptions.path
      };
      
      const secretString = await fetchSecret(fetchOptions);
      const secretData = parseSecretData(secretString);
    
      if (typeof secretData !== 'object' || secretData === null) {
        console.error(colorize('Error: Secret data is not in a valid key-value format', 'red'));
        process.exit(1);
      }
      
      const keys = Object.keys(secretData);
      
      if (keys.length === 0) {
        console.log(colorize('No keys found in the secret', 'yellow'));
        return;
      }
      
      console.log(colorize(`Found ${keys.length} key(s):`, 'green'));
      
      // Use interactive key browser
      const breadcrumbs = [` ${interactiveOptions.type}`, `${interactiveOptions.name}`];
      const result = await interactiveKeyBrowser(secretData, interactiveOptions.showValues, breadcrumbs);
      
      if (result === 'BACK') {
        // Go back to secret selection for this type
        const secretOptions = { 
          ...options, 
          type: interactiveOptions.type,
          startStep: 'secret' // Start from secret selection instead of type selection
        };
        return await handleInteractiveCommand(secretOptions);
      }
      
      // Normal completion - restore screen
      process.stdout.write('\x1b[?1049l');
      
    } catch (error) {
      process.stdout.write('\x1b[?1049l');
      console.error(colorize(`Error inspecting secret: ${error.message}`, 'red'));
      process.exit(1);
    }
  } catch (error) {
    process.stdout.write('\x1b[?1049l');
    console.error(colorize(`Fatal error in interactive command: ${error.message}`, 'red'));
    process.exit(1);
  }
}

module.exports = {
  parseInteractiveArgs,
  showInteractiveHelp,
  handleInteractiveCommand
};