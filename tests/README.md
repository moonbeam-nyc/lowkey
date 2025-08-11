# Lowkey Test Suite

## Overview

This test suite provides comprehensive coverage for the Lowkey CLI tool, focusing on both holistic integration tests and strategic unit tests for critical business logic.

## Test Structure

```
tests/
├── fixtures/                 # Test data files
│   ├── valid.env            # Sample environment file
│   ├── valid.json           # Sample JSON file  
│   ├── invalid.json         # JSON with nested objects (for error testing)
│   └── malformed.env        # Malformed env file (for error testing)
├── integration/             # End-to-end CLI tests
│   ├── copy.test.js         # Copy command workflow tests
│   ├── list.test.js         # List command workflow tests  
│   └── error-handling.test.js # Comprehensive error scenarios
├── unit/                    # Component-specific tests
│   ├── secrets.test.js      # Business logic for secret parsing/generation
│   ├── files.test.js        # File operations and validation
│   └── arg-parser.test.js   # Argument parsing and validation
└── helpers/                 # Test utilities
    ├── cli-runner.js        # CLI command execution helper
    └── temp-files.js        # Temporary file management
```

## Test Categories

### Integration Tests (Primary Focus)

**Copy Command Tests (`copy.test.js`)**
- ✅ env → json conversion with all value types
- ✅ json → env conversion with proper quoting  
- ✅ Backup file creation during overwrite operations
- ✅ Error handling for missing files and invalid formats
- ✅ Help text and usage validation

**List Command Tests (`list.test.js`)**  
- ✅ Listing env files in directories
- ✅ Listing json files with standard exclusions (package.json, etc.)
- ✅ Argument validation and error messages
- ✅ Support for different storage types
- ✅ Graceful handling of empty directories

**Error Handling Tests (`error-handling.test.js`)**
- ✅ Global CLI error handling (unknown commands, help, version)  
- ✅ File system errors (permissions, missing files)
- ✅ Malformed file handling (invalid JSON, bad env formats)
- ✅ AWS credential simulation and region validation
- ✅ Comprehensive argument validation
- ✅ Data validation errors (nested objects, empty files)

### Unit Tests (Strategic Focus)

**Secrets Logic (`secrets.test.js`)**
- ✅ JSON parsing with flat object validation
- ✅ Environment file generation with proper escaping
- ✅ JSON formatting and value type preservation
- ✅ Comprehensive error scenarios

**File Operations (`files.test.js`)**  
- ✅ Environment variable key validation
- ✅ Value escaping for special characters
- ✅ Env file parsing with quotes and escape sequences
- ✅ Comment and empty line handling

**Argument Parsing (`arg-parser.test.js`)**
- ✅ Common argument parsing (help, region, path)
- ✅ Required argument validation
- ✅ Type validation for supported storage types  
- ✅ AWS region validation
- ✅ Custom argument handler functionality

## Test Helpers

**CLI Runner (`cli-runner.js`)**
- Executes lowkey commands with proper process spawning
- Captures stdout/stderr and exit codes
- Supports timeout handling for long-running operations

**Temp File Manager (`temp-files.js`)**
- Creates temporary files and directories for testing
- Automatic cleanup after each test
- Fixture copying and content verification utilities

## Running Tests

```bash
# Run all tests
npm test

# Run with watch mode
npm run test:watch

# Run specific test file
node --test tests/integration/copy.test.js
```

## Test Coverage

- **67 tests** across **28 test suites** 
- **Integration tests**: 40+ tests covering end-to-end workflows
- **Unit tests**: 25+ tests covering critical business logic
- **Error scenarios**: Comprehensive coverage of failure modes
- **All major commands**: copy, list, inspect, interactive (basic)

## Design Philosophy

### Holistic Integration Testing
The test suite emphasizes end-to-end workflows that test the complete CLI experience:
- Real file operations with temporary files
- Complete argument parsing and validation
- Error message verification for user experience
- Cross-storage type operations (env ↔ json ↔ aws)

### Strategic Unit Testing  
Unit tests focus on complex business logic that benefits from isolated testing:
- Secret parsing and validation (nested object detection)
- File format generation with escaping
- Argument validation patterns
- Edge cases and error conditions

### Real-World Scenarios
Tests simulate actual user workflows:
- Creating and copying between different secret formats
- Handling various file permissions and missing directories  
- Testing with realistic data including special characters
- Comprehensive error handling that matches CLI best practices

## Framework Choice

Uses **Node.js built-in test runner** for:
- ✅ Zero external dependencies
- ✅ Excellent process spawning support for CLI testing
- ✅ Fast execution and simple setup
- ✅ Perfect match for terminal application testing

This approach provides confidence in core functionality while maintaining the lightweight nature of the lowkey tool.