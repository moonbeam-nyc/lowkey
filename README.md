<div align="center">
  <img src="static/lowkey.png" alt="lowkey logo" width="200">
</div>

# lowkey · [![Docker: Build & Push](https://github.com/moonbeam-nyc/lowkey/actions/workflows/docker.yml/badge.svg)](https://github.com/moonbeam-nyc/lowkey/actions/workflows/docker.yml)

Sync secrets between any supported storage types with ease, and list available secrets across different storage systems.

Currently supports AWS Secrets Manager, env, and json.

## Use Cases

**Dev team environment sharing:** Quickly sync your team's shared secrets from AWS Secrets Manager to local `.env` files, ensuring everyone has the same environment variables without manually copying credentials.

```bash
lowkey copy \
  --input-type aws-secrets-manager \
  --input-name team-dev-secrets \
  --output-type env \
  --output-name .env.dev
```

**Discovery and inventory:** List available secrets across different storage types to see what's available before copying.

```bash
# List all AWS secrets visible to your account
lowkey list --type aws-secrets-manager --region us-east-1

# List local .env files and JSON configuration files
lowkey list --type env --path ./config
lowkey list --type json --path ./secrets
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

### Global Options

- `--version, -v` - Show version number
- `--help, -h` - Show help message

Use `lowkey <command> --help` for more information about each command.

### Copy Command

Copy secrets between different storage types:

```bash
lowkey copy --input-type <type> --input-name <name|path> --output-type <type> [options]
```

#### Copy Options

- `--input-type <type>` - Input source type (required)
- `--input-name <name>` - Input source name/path (required)
- `--region <region>` - AWS region (or use AWS_REGION environment variable)
- `--output-type <type>` - Output format (required)
- `--output-name <file>` - Output file path (default: stdout)
- `--stage <stage>` - Secret version stage (default: `AWSCURRENT`)
- `-y, --yes` - Auto-confirm prompts (e.g., secret creation)
- `--help, -h` - Show help message

### List Command

List available secrets for each storage type:

```bash
lowkey list --type <type> [options]
```

#### List Options

- `--type <type>` - Storage type to list (required)
- `--region <region>` - AWS region (or use AWS_REGION environment variable)
- `--path <path>` - Directory path to search for files (default: current directory)
- `--help, -h` - Show help message

### Inspect Command

Show help and guidance for inspecting secrets:

```bash
lowkey inspect --help
```

The inspect command provides detailed information about how to examine secret contents and structure.

### Interactive Command

Launch an interactive secret browser and inspector with fuzzy search and editing capabilities:

```bash
lowkey interactive [options]
lowkey x [options]  # Short alias
```

#### Interactive Features

- **Fuzzy searchable interface** - Navigate with arrow keys, press `/` to search
- **Multi-format support** - Browse AWS Secrets Manager, .env files, and JSON files
- **Live editing** - Press `e` to edit secrets in your preferred editor ($EDITOR or vim)
- **Real-time updates** - Changes are immediately saved to AWS or local files
- **Search preservation** - Search queries are preserved when navigating between views
- **Breadcrumb navigation** - Use ESC to go back, with preserved context

#### Interactive Options

- `--region <region>` - AWS region (or use AWS_REGION environment variable)
- `--path <path>` - Directory path to search for files (default: current directory)
- `--help, -h` - Show help message

#### Interactive Navigation

- `↑↓` or `j/k` - Navigate items
- `/` - Enter search mode (shows cursor in search field)
- `e` - Edit selected secret (env/json/AWS)
- `Ctrl+V` - Toggle showing values vs keys only
- `Enter` - Select item
- `Esc` - Go back or exit search mode
- `Ctrl+C` - Exit

### Examples

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
```

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
```

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

#### Docker Usage

##### Copy Examples
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

# Output to local file via redirection
docker run --rm \
  -e AWS_ACCESS_KEY_ID \
  -e AWS_SECRET_ACCESS_KEY \
  -e AWS_REGION=us-east-1 \
  ghcr.io/moonbeam-nyc/lowkey:latest \
  copy --input-type aws-secrets-manager --input-name my-secrets --output-type env > .env
```

##### List Examples
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

# List JSON files with volume mount
docker run --rm \
  -v $(pwd):/workspace \
  ghcr.io/moonbeam-nyc/lowkey:latest \
  list --type json --path /workspace
```

##### Interactive Examples
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

**Note:** Interactive mode requires the `-it` flags for Docker to provide a proper terminal interface.

## Local Development

### Building and Testing with Make

```bash
# Show all available commands
make help

# Build Docker image locally
make build

# Test the build works
make test-build

# Run container and show help
make run-help

# Run container and show version
make run-version

# Example copy usage with AWS credentials
make run-aws ARGS="copy --input-type aws-secrets-manager --input-name my-secret --output-type env"

# Example list usage with AWS credentials
make run-aws ARGS="list --type aws-secrets-manager --region us-east-1"

# Clean up local images
make clean
```

### Development Commands

```bash
# Install dependencies locally
make dev-install

# Link for global CLI usage
make dev-link

# Version bumping
make version-patch   # 1.1.0 -> 1.1.1
make version-minor   # 1.1.0 -> 1.2.0
make version-major   # 1.1.0 -> 2.0.0
```

## Requirements

- Node.js >= 16
- AWS credentials configured for AWS Secrets Manager
- Secret stored as JSON object in the secret store

## How it works

1. Fetches the specified secret from the configured source
2. Parses the secret value as JSON
3. Validates that it's a flat object (no nested objects/arrays)
4. For `env` output: Validates environment variable key names (`[A-Za-z_][A-Za-z0-9_]*`)
5. For `env` output: Safely quotes and escapes values (handles newlines, quotes, backslashes)
6. Backs up existing files to `<file>.bak` before overwriting
7. Writes output in the specified format to the target file

## AWS Authentication

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

## Secret Format

Your secret must be stored as a JSON object:

```json
{
  "DATABASE_URL": "postgres://user:pass@host:5432/db",
  "API_KEY": "abc123",
  "DEBUG": "true",
  "PORT": "3000"
}
```

Nested objects and arrays are not supported.

## Output Formats

### Environment File (.env)

```bash
DATABASE_URL="postgres://user:pass@host:5432/db"
API_KEY="abc123"
DEBUG="true"
PORT="3000"
```

### JSON File

```json
{
  "DATABASE_URL": "postgres://user:pass@host:5432/db",
  "API_KEY": "abc123",
  "DEBUG": "true",
  "PORT": "3000"
}
```

## Error Handling

The tool will fail with clear error messages if:
- Secret is not found
- Secret is not valid JSON
- Secret is not a flat object
- Environment variable keys are invalid (for env output)
- Source type is unsupported
- Output type is unsupported
- Required parameters are missing

## Future Support

The architecture is designed to support additional source types (e.g., Google Secret Manager, HashiCorp Vault) and output formats in future versions.

## License

MIT
