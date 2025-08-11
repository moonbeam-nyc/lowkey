# Development Guide

This guide covers development workflows, testing, and contribution guidelines for lowkey.

## Development Setup

### Prerequisites

- Node.js >= 16
- npm or yarn
- Docker (for containerized testing)
- AWS credentials (for AWS integration testing)

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
├── lib/                # Core libraries (refactored 2025)
│   ├── arg-parser.js   # Shared argument parsing utilities
│   ├── aws.js          # AWS Secrets Manager operations
│   ├── colors.js       # Terminal color utilities
│   ├── constants.js    # Configuration constants
│   ├── files.js        # Local file operations
│   ├── interactive.js  # Interactive UI orchestration
│   ├── key-handlers.js # Key event processing & factories
│   ├── renderer.js     # Screen rendering & pagination
│   ├── secrets.js      # Secret format handling
│   └── terminal-manager.js # Terminal state management
├── static/             # Assets
└── tests/              # Comprehensive test suite
```

### Architecture Principles

- **Modular Architecture**: Composition over inheritance with separated concerns
- **Factory Patterns**: Key handlers and utilities use configurable factories
- **Configuration Centralization**: All constants in `constants.js`
- **Shared Utilities**: Common patterns in reusable modules
- **Error-First Patterns**: Consistent error handling throughout

### Adding New Storage Types

1. **Update Constants**: Add to `STORAGE_TYPES` in `lib/constants.js`
2. **Implement Fetcher**: Add fetch function in appropriate lib file
3. **Update Secrets**: Add case to `fetchSecret()` and `generateOutput()`
4. **Add Validation**: Update argument validation in commands
5. **Add Tests**: Create integration and unit tests
6. **Update Help**: Add to command help text and examples

### Adding New Commands

1. **Create Command File**: `commands/new-command.js`
2. **Implement Parser**: `parseNewCommandArgs()`
3. **Implement Handler**: `handleNewCommandCommand()`
4. **Update CLI Router**: Add to `cli.js` parseArgs and main functions
5. **Add Help**: Update global help in `showHelp()`
6. **Add Tests**: Integration and unit tests
7. **Add Makefile**: Add relevant make targets if needed

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
# Test interactive without AWS
node cli.js x --path ./

# Test with AWS
node cli.js interactive --region us-east-1
```

### Common Issues

**Permission Errors**: Ensure proper file permissions for local operations
**AWS Errors**: Verify credentials and region configuration
**Terminal Issues**: Interactive mode requires proper TTY support
**Node Version**: Ensure Node.js >= 16 for built-in test runner support

## Performance Considerations

- **Rendering Throttling**: Interactive mode uses 16ms throttling for smooth 60fps
- **Memory Management**: Automatic cleanup of temporary files in tests
- **AWS Rate Limits**: Respect AWS API rate limits in batch operations
- **Search Performance**: Fuzzy search optimized for large secret lists

## Security Guidelines

- **Never log secrets**: Redact sensitive values in debug output
- **Secure temporary files**: Use proper permissions and cleanup
- **AWS credentials**: Follow AWS security best practices
- **Input validation**: Validate all user input and file formats
- **Error messages**: Avoid exposing sensitive information in errors

This development guide should help you contribute effectively to lowkey. For questions or clarifications, please open an issue on GitHub.