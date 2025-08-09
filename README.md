# @moonbeam-nyc/lowkey

Sync secrets from various secret stores to different output formats with ease.

## Installation

```bash
npm install -g @moonbeam-nyc/lowkey
```

## Usage

```bash
lowkey --source-name <name|arn> [options]
```

### Options

- `--source-type <type>` - Secret store type (default: `aws-secrets-manager`)
- `--source-name <name>` - Secret name or ARN (required)
- `--region <region>` - AWS region (required for aws-secrets-manager)
- `--output-type <type>` - Output format: `env`, `json` (default: `env`)
- `--output-name <file>` - Output file path (default: `.env`)
- `--append` - Append to existing file instead of overwriting
- `--stage <stage>` - Secret version stage (default: `AWSCURRENT`)
- `--help, -h` - Show help message

### Supported Source Types

- `aws-secrets-manager` - AWS Secrets Manager

### Supported Output Types

- `env` - Environment file (.env format)
- `json` - JSON file

### Examples

```bash
# Basic usage - AWS Secrets Manager to .env file
lowkey --source-name my-app-secrets --region us-east-1

# Using ARN and custom output file
lowkey --source-name arn:aws:secretsmanager:us-east-1:123456789012:secret:my-secret-AbCdEf --region us-east-1 --output-name .env.local

# Output to JSON format
lowkey --source-name my-secrets --region us-west-2 --output-type json --output-name secrets.json

# Append to existing file using pending version
lowkey --source-name my-secrets --region us-east-1 --append --stage AWSPENDING

# Explicit source type specification
lowkey --source-type aws-secrets-manager --source-name my-secrets --region us-east-1
```

## Requirements

- Node.js >= 16
- AWS credentials configured (compatible with aws-vault) for AWS Secrets Manager
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