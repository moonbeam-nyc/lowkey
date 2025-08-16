# Development Guide

This guide covers development workflows, testing, and contribution guidelines for lowkey.

## Development Setup

### Prerequisites

- Node.js >= 18
- npm or yarn
- Docker (for containerized testing)
- AWS credentials (for AWS integration testing)
- kubectl (for Kubernetes integration testing)

### Local Development

```bash
# Clone the repository
git clone https://github.com/moonbeam-nyc/lowkey.git
cd lowkey

# Install dependencies
make dev-install
# or: npm install

# Link for global CLI usage during development
make dev-link
# or: npm link

# Verify installation
lowkey --version
```

## Testing

We use Node.js built-in test runner for comprehensive testing with both integration and unit tests.

### Running Tests

```bash
# Run all tests
make test
# or: npm test

# Run tests in watch mode
make test-watch
# or: npm run test:watch

# Run only unit tests
make test-unit

# Run only integration tests  
make test-integration

# Test for CI environments
make test-ci
```

### Test Structure

```
tests/
├── fixtures/                 # Test data files
├── integration/             # End-to-end CLI tests
│   ├── copy.test.js         # Copy command workflows
│   ├── list.test.js         # List command workflows
│   └── error-handling.test.js # Error scenarios
├── unit/                    # Component-specific tests
│   ├── secrets.test.js      # Business logic testing
│   ├── files.test.js        # File operations
│   └── arg-parser.test.js   # Argument validation
└── helpers/                 # Test utilities
    ├── cli-runner.js        # CLI execution helper
    └── temp-files.js        # Temp file management
```

### Test Philosophy

**Holistic Integration Testing (Primary)**
- End-to-end CLI command execution
- Real file operations with temporary files
- Complete argument parsing and validation
- Cross-storage type operations (env ↔ json ↔ aws)

**Strategic Unit Testing (Supporting)**
- Complex business logic (secret parsing, validation)
- File format generation with edge cases
- Argument validation patterns
- Error conditions and edge cases

See [tests/README.md](tests/README.md) for detailed testing documentation.

## Docker Development

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

### Docker Commands Reference

**Build Commands**
- `make build` - Build Docker image locally
- `make build-full` - Build with full registry path

**Run Commands**
- `make run` - Run with help command
- `make run-version` - Show version
- `make run-help` - Show help
- `make run-shell` - Debug shell access
- `make run-aws` - Run with AWS credentials mounted

**Example Commands**
- `make example-copy-env` - Copy to env format
- `make example-copy-json` - Copy to JSON format
- `make example-list-aws` - List AWS secrets
- `make example-list-env` - List local .env files
- `make example-list-json` - List local JSON files

## Version Management

### Version Bumping

```bash
make version-patch   # 1.1.0 -> 1.1.1
make version-minor   # 1.1.0 -> 1.2.0
make version-major   # 1.1.0 -> 2.0.0
```

### Publishing

```bash
make publish-patch   # Bump patch + publish to npm
make publish-minor   # Bump minor + publish to npm  
make publish-major   # Bump major + publish to npm
```

## Code Architecture

### Project Structure

```
lowkey/
├── cli.js              # Entry point
├── commands/           # Command implementations
│   ├── copy.js
│   ├── inspect.js
│   ├── interactive.js
│   └── list.js
├── lib/                # Core libraries (layered architecture 2025)
│   ├── cli/            # CLI layer
│   │   ├── arg-parser.js       # Common argument parsing
│   │   ├── command-handlers.js # Shared command logic
│   │   └── command-parser.js   # Unified command parsing
│   ├── core/           # Core systems
│   │   ├── colors.js           # Terminal color utilities
│   │   ├── config.js           # Configuration management
│   │   ├── constants.js        # Configuration constants
│   │   ├── debug-logger.js     # Debug logging system
│   │   └── error-handler.js    # Standardized error handling
│   ├── interactive/    # Interactive system
│   │   ├── interactive.js      # UI orchestration
│   │   ├── key-handlers.js     # Key event processing
│   │   ├── renderer.js         # Screen rendering
│   │   ├── terminal-manager.js # Terminal state management
│   │   ├── terminal-utils.js   # Terminal utilities
│   │   ├── ui-components.js    # Reusable UI components
│   │   └── screens/            # Screen components
│   ├── providers/      # Storage providers
│   │   ├── aws.js              # AWS Secrets Manager
│   │   ├── files.js            # Local file operations
│   │   ├── kubernetes.js       # Kubernetes secrets
│   │   └── secret-operations.js # Unified operations
│   └── utils/          # Utilities
│       └── secrets.js          # Secret format handling
├── static/             # Assets
├── DOCKER.md           # Docker usage documentation
└── tests/              # Comprehensive test suite
```

### Architecture Principles (Refactored 2025)

- **Layered Architecture**: Clear separation between CLI, core, providers, interactive, and utilities
- **Modular Architecture**: Composition over inheritance with separated concerns
- **Unified Command Handling**: Shared logic between interactive and CLI modes via command handlers
- **Provider Abstraction**: Consistent interface for all storage providers (AWS, files, Kubernetes)
- **Configuration Centralization**: All settings managed in `lib/core/config.js`
- **Standardized Error Handling**: Consistent error formatting via `lib/core/error-handler.js`
- **Reusable UI Components**: Common interactive patterns in `lib/interactive/ui-components.js`

### Adding New Storage Types (Updated Process)

1. **Update Constants**: Add to `STORAGE_TYPES` in `lib/core/constants.js`
2. **Implement Provider**: Create new provider in `lib/providers/` following the interface pattern
3. **Update Secret Operations**: Add case to `lib/providers/secret-operations.js`
4. **Update Command Handlers**: Add support in `lib/cli/command-handlers.js`
5. **Add Validation**: Update argument validation in `lib/cli/command-parser.js`
6. **Add Tests**: Create integration and unit tests
7. **Update Help**: Add to command help text and examples

### Adding New Commands (Updated Process)

1. **Create Command File**: `commands/new-command.js`
2. **Add Command Config**: Define configuration in `lib/cli/command-parser.js`
3. **Implement Handler**: Add handler logic in `lib/cli/command-handlers.js`
4. **Update CLI Router**: Add to `cli.js` parseArgs and main functions
5. **Add Help**: Update global help in `showHelp()`
6. **Add Tests**: Integration and unit tests
7. **Add Makefile**: Add relevant make targets if needed
8. **Update Documentation**: Add examples to README.md and DOCKER.md if applicable

## Contributing Guidelines

### Code Style

- **CommonJS Modules**: Use `require`/`module.exports`
- **Async/Await**: For promise handling
- **Destructuring**: For clean parameter handling
- **Factory Functions**: For configurable behavior
- **Options Objects**: For complex parameters

### Commit Guidelines

- Use conventional commit format
- Include tests for new features
- Update documentation for user-facing changes
- Ensure all tests pass before committing

### Pull Request Process

1. Fork the repository
2. Create feature branch from `main`
3. Make changes with tests
4. Run full test suite (`make test`)
5. Update documentation if needed
6. Submit PR with clear description

### Testing Guidelines

- **Integration tests** for new commands or workflows
- **Unit tests** for complex business logic
- **Error handling tests** for failure scenarios
- **Real file operations** using temp file helpers
- **AWS simulation** using natural credential failures

## Debugging

### Common Development Tasks

**Test a specific command:**
```bash
node cli.js copy --input-type env --input-name .env --output-type json
```

**Debug with verbose output:**
```bash
DEBUG=1 node cli.js [command]
```

**Test AWS integration:**
```bash
# Ensure AWS credentials are configured
aws sts get-caller-identity

# Test AWS commands
node cli.js list --type aws-secrets-manager --region us-east-1
```

**Interactive mode debugging:**
```bash
# Note: Interactive mode requires TTY, so use debug logs for troubleshooting
LOWKEY_DEBUG=true node cli.js x --path ./

# Test with AWS (with debug logging)
LOWKEY_DEBUG=true node cli.js interactive --region us-east-1

# View debug logs after running
make log-latest
```

### Common Issues

**Permission Errors**: Ensure proper file permissions for local operations
**AWS Errors**: Verify credentials and region configuration
**Terminal Issues**: Interactive mode requires proper TTY support and cannot run in CI environments
**Node Version**: Ensure Node.js >= 18 for built-in test runner support
**Kubernetes Errors**: Verify kubectl configuration and cluster access
**Debug Logging**: Use `LOWKEY_DEBUG=true` and check `./lowkey-logs/latest.log` for detailed troubleshooting

## Local Kubernetes Development

### k3d Setup

For testing Kubernetes features locally, use k3d:

```bash
# Full setup for new development
make k3d-setup k3d-create k3d-context

# Individual commands
make k3d-setup           # Install k3d if not present
make k3d-create          # Create 'lowkey-test' cluster
make k3d-start           # Start existing cluster
make k3d-stop            # Stop cluster
make k3d-delete          # Delete cluster
make k3d-context         # Switch kubectl context to cluster
make k3d-status          # Show cluster status

# Test Kubernetes functionality
node cli.js list --type kubernetes --namespace default
LOWKEY_DEBUG=true node cli.js x  # Interactive mode with k8s support
```

The k3d cluster runs on port 6443 and is pre-configured for lowkey development.

### LocalStack (AWS Testing)

For testing AWS functionality locally without real AWS resources:

```bash
# Start LocalStack
docker-compose -f docker-compose.localstack.yml up -d

# Run tests against LocalStack
LOCALSTACK_ENDPOINT=http://localhost:4566 \
AWS_ACCESS_KEY_ID=test \
AWS_SECRET_ACCESS_KEY=test \
AWS_DEFAULT_REGION=us-east-1 \
npm test tests/integration/copy-matrix.test.js
```

## Performance Considerations

- **Rendering Throttling**: Interactive mode uses 16ms throttling for smooth 60fps
- **Memory Management**: Automatic cleanup of temporary files in tests
- **AWS Rate Limits**: Respect AWS API rate limits in batch operations
- **Search Performance**: Fuzzy search optimized for large secret lists
- **Configuration Caching**: Centralized config system minimizes repeated environment variable reads

## Security Guidelines

- **Never log secrets**: Redact sensitive values in debug output
- **Secure temporary files**: Use proper permissions and cleanup
- **AWS credentials**: Follow AWS security best practices
- **Input validation**: Validate all user input and file formats
- **Error messages**: Avoid exposing sensitive information in errors

This development guide should help you contribute effectively to lowkey. For questions or clarifications, please open an issue on GitHub.