<div align="center">
  <img src="static/lowkey.png" alt="lowkey logo" width="200">
</div>

# lowkey · [![Docker: Build & Push](https://github.com/moonbeam-nyc/lowkey/actions/workflows/docker.yml/badge.svg)](https://github.com/moonbeam-nyc/lowkey/actions/workflows/docker.yml)

Sync secrets between any supported storage types with ease, and list available secrets across different storage systems.

Currently supports AWS Secrets Manager, Kubernetes secrets, env, and json.

## Use Cases

**Team environment sharing:** Sync shared secrets from AWS Secrets Manager to local `.env` files.

```bash
lowkey copy \
  --input-type aws-secrets-manager \
  --input-name team-dev-secrets \
  --output-type env \
  --output-name .env.dev
```

**Discovery and inventory:** List available secrets across different storage types.

```bash
# List all AWS secrets visible to your account
lowkey list --type aws-secrets-manager --region us-east-1

# List Kubernetes secrets in current namespace
lowkey list --type kubernetes

# List local .env files and JSON configuration files
lowkey list --type env --path ./config
lowkey list --type json --path ./secrets
```

**Frequent environment updates:** Browse and edit environment variables with fuzzy search and live editing.

```bash
# Launch interactive mode with fuzzy search for quick browsing and editing
# Press '/' to search, 'e' to edit, Ctrl+V to toggle value visibility
lowkey interactive
lowkey x
```

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

- `copy` - Copy secrets between different storage types
- `list` - List available secrets for each storage type
- `inspect` - Show help for inspecting secrets
- `interactive, x` - Interactive secret browser and inspector with editing capabilities

<details>
<summary><strong>Copy Command</strong></summary>

Copy secrets between different storage types:

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
<summary><strong>List Command</strong></summary>

List available secrets for each storage type:

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
<summary><strong>Inspect Command</strong></summary>

Show help and guidance for inspecting secrets:

```bash
lowkey inspect --help
```

The inspect command provides detailed information about how to examine secret contents and structure.

</details>

<details>
<summary><strong>Interactive Command</strong></summary>

Launch an interactive secret browser and inspector with fuzzy search and editing capabilities:

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

<details>
<summary><strong>Docker Copy Examples</strong></summary>

```bash
# AWS Secrets Manager to stdout
docker run --rm \
  -e AWS_ACCESS_KEY_ID \
  -e AWS_SECRET_ACCESS_KEY \
  -e AWS_REGION=us-east-1 \
  ghcr.io/moonbeam-nyc/lowkey:latest \
  copy --input-type aws-secrets-manager --input-name my-app-secrets --output-type env

# Using AWS profile with volume mount
docker run --rm \
  -v ~/.aws:/home/lowkey/.aws:ro \
  -e AWS_PROFILE=production \
  ghcr.io/moonbeam-nyc/lowkey:latest \
  copy --input-type aws-secrets-manager --input-name my-secrets --output-type env

# Convert local files with volume mount
docker run --rm \
  -v $(pwd):/workspace \
  ghcr.io/moonbeam-nyc/lowkey:latest \
  copy --input-type json --input-name /workspace/config.json \
  --output-type env --output-name /workspace/.env
```

</details>

<details>
<summary><strong>Docker List Examples</strong></summary>

```bash
# List AWS secrets
docker run --rm \
  -e AWS_ACCESS_KEY_ID \
  -e AWS_SECRET_ACCESS_KEY \
  -e AWS_REGION=us-east-1 \
  ghcr.io/moonbeam-nyc/lowkey:latest \
  list --type aws-secrets-manager --region us-east-1

# List local files with volume mount
docker run --rm \
  -v $(pwd):/workspace \
  ghcr.io/moonbeam-nyc/lowkey:latest \
  list --type env --path /workspace
```

</details>

<details>
<summary><strong>Docker Interactive Examples</strong></summary>

```bash
# Interactive AWS secrets browser
docker run --rm -it \
  -e AWS_ACCESS_KEY_ID \
  -e AWS_SECRET_ACCESS_KEY \
  -e AWS_REGION=us-east-1 \
  ghcr.io/moonbeam-nyc/lowkey:latest \
  interactive

# Interactive local files browser with volume mount
docker run --rm -it \
  -v $(pwd):/workspace \
  ghcr.io/moonbeam-nyc/lowkey:latest \
  x --path /workspace
```

</details>

## Requirements

- Node.js >= 18
- AWS credentials configured for AWS Secrets Manager (optional)
- kubectl configured for Kubernetes access (optional)
- Secret stored as JSON object in the secret store

## How it works

1. Fetches the specified secret from the configured source
2. Parses the secret value as JSON
3. Validates that it's a flat object (no nested objects/arrays)
4. For `env` output: Validates environment variable key names (`[A-Za-z_][A-Za-z0-9_]*`)
5. For `env` output: Safely quotes and escapes values (handles newlines, quotes, backslashes)
6. Backs up existing files to `<file>.bak` before overwriting
7. Writes output in the specified format to the target file

## Authentication

### AWS Authentication

This tool uses the AWS SDK's default credential chain for AWS Secrets Manager. It's compatible with:

- Environment variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`)
- AWS profiles (`~/.aws/credentials`)
- IAM roles
- aws-vault

Ensure your AWS credentials have the following permissions:

For copying secrets (copy command):
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue",
        "secretsmanager:PutSecretValue",
        "secretsmanager:CreateSecret"
      ],
      "Resource": "arn:aws:secretsmanager:*:*:secret:*"
    }
  ]
}
```

For listing secrets (list command):
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:ListSecrets"
      ],
      "Resource": "*"
    }
  ]
}
```

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