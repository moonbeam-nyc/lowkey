# LocalStack Integration for Lowkey

LocalStack provides a fully functional AWS cloud stack that runs locally, allowing you to develop and test AWS integrations without connecting to real AWS services or incurring costs.

## Quick Start

### 1. Start LocalStack

```bash
# Start LocalStack with Docker Compose
make localstack-start

# Check if LocalStack is ready (wait ~30 seconds after starting)
make localstack-status
```

### 2. Run Tests with LocalStack

```bash
# Run all tests against LocalStack
make test-localstack

# Or run tests with LocalStack environment manually
LOCALSTACK_ENDPOINT=http://localhost:4566 npm test
```

### 3. Create Test Data

```bash
# Set up LocalStack with test secrets
make localstack-test-setup

# List secrets in LocalStack
make localstack-test-list
```

## Available Commands

### LocalStack Management
- `make localstack-start` - Start LocalStack container
- `make localstack-stop` - Stop LocalStack container  
- `make localstack-restart` - Restart LocalStack
- `make localstack-status` - Check LocalStack health
- `make localstack-logs` - View LocalStack logs
- `make localstack-clean` - Stop and remove all LocalStack data

### Testing
- `make localstack-test-setup` - Start LocalStack and create test secrets
- `make localstack-test-list` - List secrets in LocalStack
- `make test-localstack` - Run tests against LocalStack

### Development Commands (LocalStack Pre-configured)
- `make localstack-interactive` - Run `lowkey interactive` with LocalStack
- `make localstack-list` - List secrets in LocalStack
- `make localstack-copy ARGS="..."` - Run copy command with LocalStack
- `make localstack-inspect ARGS="..."` - Run inspect command with LocalStack  
- `make localstack-run ARGS="..."` - Run any lowkey command with LocalStack

#### Example Usage:
```bash
# Start LocalStack and run interactive mode
make localstack-start
make localstack-interactive

# Copy from env file to LocalStack
make localstack-copy ARGS="--input-type env --input-name .env --output-type aws-secrets-manager --output-name my-secret --region us-east-1 --yes"

# Copy from LocalStack to JSON
make localstack-copy ARGS="--input-type aws-secrets-manager --input-name my-secret --output-type json --output-name output.json --region us-east-1"

# List all secrets
make localstack-list

# Run any command with LocalStack
make localstack-run ARGS="--help"
```

## LocalStack Configuration

LocalStack runs with the following configuration:

### Services Enabled
- **Secrets Manager** (port 4566) - For secret storage and retrieval
- **S3** (port 4566) - For potential future file storage features
- **IAM** (port 4566) - For access management simulation

### Test Credentials
- **Access Key ID**: `test`
- **Secret Access Key**: `test`
- **Region**: `us-east-1`
- **Endpoint**: `http://localhost:4566`

## Test Secrets Created

When you run `make localstack-test-setup`, these secrets are created:

### `test-secret`
```json
{
  "username": "testuser",
  "password": "testpass", 
  "api_key": "test123"
}
```

### `test-env-secret`
```json
{
  "DATABASE_URL": "postgresql://localhost:5432/testdb",
  "API_KEY": "sk-test123",
  "DEBUG": "true"
}
```

### `test-simple-secret`
```json
{
  "value": "simple-string-value"
}
```

## Usage with Lowkey CLI

Once LocalStack is running, you can use lowkey commands normally by setting the LocalStack endpoint:

```bash
# Set environment variable
export LOCALSTACK_ENDPOINT=http://localhost:4566

# List secrets
lowkey list --type aws-secrets-manager --region us-east-1

# Copy from LocalStack to file
lowkey copy --input-type aws-secrets-manager --input-name test-secret --output-type env --region us-east-1

# Copy from file to LocalStack  
lowkey copy --input-type env --input-name .env --output-type aws-secrets-manager --output-name my-secret --region us-east-1

# Interactive mode
lowkey interactive
```

## Integration with Tests

The test suite automatically detects LocalStack:

1. **Environment Detection**: Tests check for `LOCALSTACK_ENDPOINT` environment variable
2. **Automatic Configuration**: AWS SDK clients automatically use LocalStack endpoint when detected  
3. **Test Data Management**: Helper functions set up and clean up test secrets
4. **Graceful Fallback**: Tests are skipped if LocalStack is not available

### Running Specific LocalStack Tests

```bash
# Run only LocalStack integration tests
LOCALSTACK_ENDPOINT=http://localhost:4566 node --test tests/integration/localstack-aws.test.js

# Run all tests with LocalStack
LOCALSTACK_ENDPOINT=http://localhost:4566 npm test
```

## Troubleshooting

### LocalStack Not Starting
```bash
# Check Docker is running
docker ps

# Check for port conflicts
lsof -i :4566

# View detailed logs
make localstack-logs
```

### Connection Issues
```bash
# Check LocalStack health
curl http://localhost:4566/_localstack/health

# Verify Secrets Manager is running
curl http://localhost:4566/_localstack/health | jq .services.secretsmanager
```

### Test Failures
```bash
# Restart LocalStack
make localstack-restart

# Clean up and recreate test environment
make localstack-clean
make localstack-test-setup
```

### Reset Everything
```bash
# Complete cleanup and restart
make localstack-clean
make localstack-start
make localstack-test-setup
```

## Development Benefits

### Cost Savings
- No AWS charges during development
- Test with unlimited API calls
- No need for AWS account setup

### Speed & Reliability
- Faster than real AWS (local network)
- No internet dependency
- Consistent test environment
- Instant setup/teardown

### Security
- No real credentials needed
- Test data stays local
- No accidental production changes

## CI/CD Integration

LocalStack works great in CI environments:

```yaml
# Example GitHub Actions workflow
- name: Start LocalStack
  run: make localstack-start

- name: Wait for LocalStack
  run: sleep 30

- name: Run tests
  run: make test-localstack
  env:
    LOCALSTACK_ENDPOINT: http://localhost:4566
```

## Advanced Configuration

### Custom LocalStack Settings

Edit `docker-compose.localstack.yml` to customize:

```yaml
environment:
  - SERVICES=secretsmanager,s3,iam,lambda  # Add more services
  - PERSISTENCE=1                          # Enable data persistence
  - DEBUG=1                               # Enable debug logging
  - LOCALSTACK_API_KEY=your-pro-key      # For Pro features
```

### Testing Multiple Regions

```bash
# Test different regions
LOCALSTACK_ENDPOINT=http://localhost:4566 AWS_DEFAULT_REGION=eu-west-1 npm test
```

LocalStack provides an excellent development experience for AWS-integrated applications like lowkey, enabling rapid iteration without the complexity and cost of real AWS services.