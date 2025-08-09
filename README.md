<div align="center">
  <img src="static/lowkey.png" alt="lowkey logo" width="200">
</div>

# lowkey · [![Docker: Build & Push](https://github.com/moonbeam-nyc/lowkey/actions/workflows/docker.yml/badge.svg)](https://github.com/moonbeam-nyc/lowkey/actions/workflows/docker.yml)

Sync secrets from various secret stores to different output formats with ease.

## Use Cases

**Dev team environment sharing:** Quickly sync your team's shared secrets from AWS Secrets Manager to local `.env` files, ensuring everyone has the same environment variables without manually copying credentials.

```bash
lowkey \
  --input-type aws-secrets-manager \
  --input-name team-dev-secrets \
  --output-type env \
  --output-name .env.dev
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
lowkey --input-type <type> --input-name <name|path> --output-type <type> [options]
```

### Options

- `--input-type <type>` - Input source type (required)
- `--input-name <name>` - Input source name/path (required)
- `--region <region>` - AWS region (or use AWS_REGION environment variable)
- `--output-type <type>` - Output format (required)
- `--output-name <file>` - Output file path (default: stdout)
- `--stage <stage>` - Secret version stage (default: `AWSCURRENT`)
- `-y, --yes` - Auto-confirm prompts (e.g., secret creation)
- `--version, -v` - Show version number
- `--help, -h` - Show help message

### Supported Input Types

- `aws-secrets-manager` - AWS Secrets Manager
- `json` - JSON file
- `env` - Environment file (.env format)

### Supported Output Types

- `aws-secrets-manager` - AWS Secrets Manager
- `json` - JSON file
- `env` - Environment file (.env format)

### Examples

#### CLI Usage
```bash
# AWS Secrets Manager to env file
lowkey \
  --input-type aws-secrets-manager \
  --input-name my-secrets \
  --output-type env \
  --output-name .env

# Convert JSON to env format
lowkey \
  --input-type json \
  --input-name config.json \
  --output-type env \
  --output-name .env

# Upload to AWS Secrets Manager (auto-create if needed)
lowkey \
  --input-type env \
  --input-name .env \
  --output-type aws-secrets-manager \
  --output-name new-secret \
  --yes
```

#### Docker Usage
```bash
# AWS Secrets Manager to stdout
docker run --rm \
  -e AWS_ACCESS_KEY_ID \
  -e AWS_SECRET_ACCESS_KEY \
  -e AWS_REGION=us-east-1 \
  ghcr.io/moonbeam-nyc/lowkey:latest \
  --input-type aws-secrets-manager --input-name my-app-secrets --output-type env

# Using AWS profile with volume mount
docker run --rm \
  -v ~/.aws:/home/lowkey/.aws:ro \
  -e AWS_PROFILE=production \
  ghcr.io/moonbeam-nyc/lowkey:latest \
  --input-type aws-secrets-manager --input-name my-secrets --output-type env

# Convert local files with volume mount
docker run --rm \
  -v $(pwd):/workspace \
  ghcr.io/moonbeam-nyc/lowkey:latest \
  --input-type json --input-name /workspace/config.json \
  --output-type env --output-name /workspace/.env

# Output to local file via redirection
docker run --rm \
  -e AWS_ACCESS_KEY_ID \
  -e AWS_SECRET_ACCESS_KEY \
  -e AWS_REGION=us-east-1 \
  ghcr.io/moonbeam-nyc/lowkey:latest \
  --input-type aws-secrets-manager --input-name my-secrets --output-type env > .env
```

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

# Example usage with AWS credentials
make run-aws ARGS="--input-type aws-secrets-manager --input-name my-secret --output-type env"

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

Ensure your AWS credentials have the following permission:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": "arn:aws:secretsmanager:*:*:secret:*"
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