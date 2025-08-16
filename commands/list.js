const { colorize } = require('../lib/core/colors');
const { CommandParser } = require('../lib/cli/command-parser');
const { CommandHandlers } = require('../lib/cli/command-handlers');

function parseListArgs(args) {
  const config = CommandParser.getListConfig(showListHelp);
  return CommandParser.parseCommand(args, config);
}

function showListHelp() {
  console.log(`
${colorize('Usage:', 'cyan')} lowkey list --type <type> [options]

List available secrets for each storage type.

${colorize('Options:', 'cyan')}
  ${colorize('--type <type>', 'bold')}            Storage type to list (required)
  ${colorize('--region <region>', 'bold')}        AWS region (or use AWS_REGION environment variable)
  ${colorize('--namespace <namespace>', 'bold')}  Kubernetes namespace (required for kubernetes type)
  ${colorize('--path <path>', 'bold')}            Directory path to search for files (default: current directory)
  ${colorize('--help, -h', 'bold')}               Show this help message

${colorize('Supported types:', 'cyan')}
  ${colorize('aws-secrets-manager', 'bold')}      List AWS Secrets Manager secrets visible to this account
  ${colorize('json', 'bold')}                     List *.json files
  ${colorize('env', 'bold')}                      List .env* files
  ${colorize('kubernetes', 'bold')}               List Kubernetes secrets in specified namespace

${colorize('Examples:', 'cyan')}
  ${colorize('# List AWS secrets', 'gray')}
  lowkey ${colorize('list', 'bold')} --type aws-secrets-manager --region us-east-1

  ${colorize('# List env files in current directory', 'gray')}
  lowkey ${colorize('list', 'bold')} --type env

  ${colorize('# List JSON files in specific directory', 'gray')}
  lowkey ${colorize('list', 'bold')} --type json --path ./config

  ${colorize('# List Kubernetes secrets', 'gray')}
  lowkey ${colorize('list', 'bold')} --type kubernetes --namespace default
`);
}

async function handleListCommand(options) {
  console.error(colorize(`Listing ${options.type} secrets...`, 'gray'));
  
  try {
    const result = await CommandHandlers.listSecrets(options);
    
    if (!result.success) {
      console.error(colorize(`Error: ${result.error}`, 'red'));
      process.exit(1);
    }
    
    const { secrets, type } = result;
    
    if (secrets.length === 0) {
      const typeNames = {
        'aws-secrets-manager': 'secrets found in AWS Secrets Manager',
        'env': `.env* files found in ${options.path}`,
        'json': `*.json files found in ${options.path}`,
        'kubernetes': `secrets found in namespace '${options.namespace}'`
      };
      console.log(colorize(`No ${typeNames[type] || type}`, 'yellow'));
    } else {
      // Format output based on secret type
      switch (type) {
        case 'aws-secrets-manager':
          console.log(colorize(`Found ${secrets.length} secret(s):`, 'green'));
          secrets.sort((a, b) => a.Name.localeCompare(b.Name)).forEach(secret => {
            const lastChanged = secret.LastChangedDate ? new Date(secret.LastChangedDate).toISOString().split('T')[0] : 'Unknown';
            console.log(`  ${colorize(secret.Name, 'bright')} ${colorize(`(last changed: ${lastChanged})`, 'gray')}`);
          });
          break;
          
        case 'kubernetes':
          console.log(colorize(`Found ${secrets.length} secret(s) in namespace '${options.namespace}'${secrets[0]?.context ? ` (context: ${secrets[0].context})` : ''}:`, 'green'));
          secrets.forEach(secret => {
            console.log(`  ${colorize(secret.name || secret, 'bright')}`);
          });
          break;
          
        case 'env':
          console.log(colorize(`Found ${secrets.length} .env file(s):`, 'green'));
          secrets.forEach(file => {
            console.log(`  ${colorize(file, 'bright')}`);
          });
          break;
          
        case 'json':
          console.log(colorize(`Found ${secrets.length} JSON file(s):`, 'green'));
          secrets.forEach(file => {
            console.log(`  ${colorize(file, 'bright')}`);
          });
          break;
          
        default:
          console.log(colorize(`Found ${secrets.length} ${type}(s):`, 'green'));
          secrets.forEach(item => {
            console.log(`  ${colorize(item.name || item, 'bright')}`);
          });
          break;
      }
    }
  } catch (error) {
    console.error(colorize(`Error listing secrets: ${error.message}`, 'red'));
    process.exit(1);
  }
}

module.exports = {
  parseListArgs,
  showListHelp,
  handleListCommand
};