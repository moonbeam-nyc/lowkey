<div align="center">
  <img src="static/lowkey.png" alt="lowkey logo" width="200">
</div>

# lowkey · [![Unit & Integration Tests](https://github.com/moonbeam-nyc/lowkey/actions/workflows/test.yml/badge.svg)](https://github.com/moonbeam-nyc/lowkey/actions/workflows/test.yml) [![Docker: Build & Push](https://github.com/moonbeam-nyc/lowkey/actions/workflows/docker.yml/badge.svg)](https://github.com/moonbeam-nyc/lowkey/actions/workflows/docker.yml)

Sync secrets between any supported storage types with ease, and list available secrets across different storage systems.

Currently supports **AWS Secrets Manager**, **Kubernetes secrets**, **env**, and **json**.

## Use Cases

**Team environment sharing:** Sync shared secrets from AWS Secrets Manager to local `.env` files.

```bash
lowkey copy \
  --input-type aws-secrets-manager \
  --input-name team-dev-secrets \
  --output-type env \
  --output-name .env.dev
```

**Discovery and inspection:** List & inspect available secrets across different storage types.

```bash
lowkey list --type aws-secrets-manager --region us-east-1
lowkey list --type kubernetes --namespace default
lowkey list --type env
lowkey list --type json --path ./config

lowkey inspect --type aws-secrets-manager --name dev-secrets
lowkey inspect --type kubernetes --name dev-secrets --namespace acme-corp 
lowkey inspect --type env --name .env.dev
lowkey inspect --type json --name dev.json
```

**Frequent environment updates:** Browse and edit environment variables with fuzzy search and live editing.
```bash
# Launch interactive secret browser to browse, edit, add, delete, and copy
# secrets across storage types
lowkey interactive
lowkey x
```

## Requirements

- Node.js >= 18

## Installation

### npm
```bash
npm install -g @moonbeam-nyc/lowkey
```

### Docker
```bash
# Pull from GitHub Container Registry
docker pull ghcr.io/moonbeam-nyc/lowkey:latest

# Or use a specific version
docker pull ghcr.io/moonbeam-nyc/lowkey:v1.1.0
```

## Usage

```bash
lowkey <command> [options]
```

### Commands

<details>
<summary><strong>copy</strong> - Copy secrets between different storage types</summary>
<br>

```bash
lowkey copy --input-type <type> --input-name <name|path> --output-type <type> [options]
```

#### Copy Options

- `--input-type <type>` - Input source type (required)
- `--input-name <name>` - Input source name/path (required)
- `--region <region>` - AWS region (or use AWS_REGION environment variable)
- `--namespace <namespace>` - Kubernetes namespace (defaults to current context namespace)
- `--output-type <type>` - Output format (required)
- `--output-name <file>` - Output file path (default: stdout)
- `--stage <stage>` - Secret version stage (default: `AWSCURRENT`)
- `-y, --yes` - Auto-confirm prompts (e.g., secret creation)
- `--help, -h` - Show help message

#### Copy Examples

```bash
# AWS Secrets Manager to env file
lowkey copy \
  --input-type aws-secrets-manager \
  --input-name my-secrets \
  --output-type env \
  --output-name .env

# Convert JSON to env format
lowkey copy \
  --input-type json \
  --input-name config.json \
  --output-type env \
  --output-name .env

# Upload to AWS Secrets Manager (auto-create if needed)
lowkey copy \
  --input-type env \
  --input-name .env \
  --output-type aws-secrets-manager \
  --output-name new-secret \
  --yes

# Copy from Kubernetes secret to env file
lowkey copy \
  --input-type kubernetes \
  --input-name my-k8s-secret \
  --namespace production \
  --output-type env \
  --output-name .env
```

</details>

<details>
<summary><strong>list</strong> - List available secrets for each storage type</summary>
<br>

```bash
lowkey list --type <type> [options]
```

#### List Options

- `--type <type>` - Storage type to list (required)
- `--region <region>` - AWS region (or use AWS_REGION environment variable)
- `--namespace <namespace>` - Kubernetes namespace (defaults to current context namespace)
- `--path <path>` - Directory path to search for files (default: current directory)
- `--help, -h` - Show help message

#### List Examples

```bash
# List all AWS secrets in your account
lowkey list --type aws-secrets-manager --region us-east-1

# List .env files in current directory
lowkey list --type env

# List JSON configuration files in a specific directory
lowkey list --type json --path ./config

# List env files in a specific directory
lowkey list --type env --path ./environments

# List Kubernetes secrets in specific namespace
lowkey list --type kubernetes --namespace production
```

</details>

<details>
<summary><strong>inspect</strong> - Inspect secrets to see keys and values</summary>
<br>

```bash
lowkey inspect --type <type> --name <name> [options]
```

#### Inspect Options

- `--type <type>` - Storage type (required)
- `--name <name>` - Secret name or file path (required)
- `--show-values` - Show actual secret values (default: false, shows only keys)
- `--region <region>` - AWS region (or use AWS_REGION environment variable)
- `--path <path>` - Directory path to search for files (default: current directory)
- `--help, -h` - Show help message

#### Inspect Examples

```bash
# Inspect AWS secret keys only
lowkey inspect --type aws-secrets-manager --name myapp-secrets

# Inspect AWS secret with values
lowkey inspect --type aws-secrets-manager --name myapp-secrets --show-values

# Inspect JSON file
lowkey inspect --type json --name config.json

# Inspect env file with values
lowkey inspect --type env --name .env.production --show-values
```

</details>

<details>
<summary><strong>interactive, x</strong> - Interactive secret browser with editing capabilities</summary>
<br>

```bash
lowkey interactive [options]
lowkey x [options]  # Short alias
```

#### Interactive Features

- **Fuzzy searchable interface** - Navigate with arrow keys, press `/` to search
- **Multi-format support** - Browse AWS Secrets Manager, Kubernetes secrets, .env files, and JSON files
- **Live editing** - Press `e` to edit secrets in your preferred editor ($EDITOR or vim)
- **Real-time updates** - Changes are immediately saved to AWS or local files
- **Search preservation** - Search queries are preserved when navigating between views
- **Breadcrumb navigation** - Use ESC to go back, with preserved context

#### Interactive Options

- `--region <region>` - AWS region (or use AWS_REGION environment variable)
- `--namespace <namespace>` - Kubernetes namespace (defaults to current context namespace)
- `--path <path>` - Directory path to search for files (default: current directory)
- `--help, -h` - Show help message

#### Interactive Navigation

- `↑↓` or `j/k` - Navigate items
- `Ctrl+U/D` or `Ctrl+B/F` - Page up/down
- `/` - Enter search mode (shows cursor in search field)
- `e` - Edit selected secret (env/json/AWS/Kubernetes)
- `Ctrl+S` - Copy secrets (from key browser)
- `Ctrl+V` - Toggle showing values vs keys only
- `Enter` - Select item
- `Esc` - Go back or exit search mode
- `Ctrl+C` - Exit

#### Interactive Examples

```bash
# Launch interactive mode
lowkey interactive

# Use short alias
lowkey x

# Specify AWS region for browsing AWS secrets
lowkey interactive --region us-west-2

# Browse files in specific directory
lowkey x --path ./config
```

</details>

## Docker Usage

For detailed Docker usage examples and volume mounting instructions, see [DOCKER.md](DOCKER.md).

## Authentication

### AWS Authentication

This tool uses the AWS SDK's default credential chain for AWS Secrets Manager. It's compatible with:

- Environment variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`)
- AWS profiles (`~/.aws/credentials`)
- IAM roles
- aws-vault

Ensure your AWS credentials have the appropriate permissions for the commands you want to use.

### Kubernetes Authentication

This tool uses kubectl and your current Kubernetes context for accessing Kubernetes secrets. Ensure you have:

- kubectl installed and configured
- Valid kubeconfig with access to your cluster
- Appropriate RBAC permissions for secrets (get, list, create, update, patch)

The tool will use your current kubectl context and namespace unless overridden with the `--namespace` option.

## Development

For development setup, testing, and contribution guidelines, see [DEVELOPMENT.md](DEVELOPMENT.md).

### Quick Start

```bash
# Install dependencies and link globally
make dev-install
make dev-link

# Run tests
make test

# Build and test Docker image
make build
make test-build
```

## Future Support

The architecture is designed to support additional source types (e.g., Google Secret Manager, HashiCorp Vault) and output formats in future versions.

## License

MIT