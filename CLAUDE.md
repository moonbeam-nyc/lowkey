# Lowkey - Technical Documentation for Claude

## Project Overview

**Lowkey** is a Node.js CLI tool for managing secrets across different storage systems (AWS Secrets Manager, .env files, JSON files). It provides copying, listing, inspection, and interactive browsing with editing capabilities.

## Architecture

### Entry Point
- `cli.js` - Main CLI entry point with command routing and global error handling

### Commands Structure
All commands are in the `commands/` directory:
- `copy.js` - Copy secrets between storage types
- `list.js` - List available secrets for each storage type  
- `inspect.js` - Show help for secret inspection
- `interactive.js` - Interactive secret browser with editing

### Core Libraries (Refactored 2025)
The `lib/` directory is now organized into focused modules:

#### CLI Layer (`lib/cli/`)
- `command-parser.js` - Unified command parsing and configuration
- `command-handlers.js` - Shared command logic between interactive and CLI modes
- `arg-parser.js` - Common argument parsing utilities

#### Core Systems (`lib/core/`)
- `config.js` - Centralized configuration management with environment validation
- `constants.js` - Configuration constants and magic numbers
- `colors.js` - Terminal color utilities
- `debug-logger.js` - Debug logging system with timestamped file output
- `error-handler.js` - Standardized error handling and formatting

#### Storage Providers (`lib/providers/`)
- `aws.js` - AWS Secrets Manager integration
- `kubernetes.js` - Kubernetes secrets integration with namespace support
- `files.js` - Local file operations (env/JSON)
- `secret-operations.js` - Unified secret operations interface

#### Interactive System (`lib/interactive/`)
- `terminal-manager.js` - Terminal state management (raw mode, alternate screen)
- `key-handlers.js` - Key event processing and reusable handlers
- `renderer.js` - Screen rendering with throttling and pagination utilities
- `interactive.js` - Interactive UI orchestration and editor integration
- `terminal-utils.js` - Terminal utility functions
- `ui-components.js` - Reusable UI components

#### Screen Components (`lib/interactive/screens/`)
- `base-screen.js` - Foundation screen class with lifecycle management
- `type-selection-screen.js` - Storage type selection
- `secret-selection-screen.js` - Secret browsing & selection
- `key-browser-screen.js` - Key viewing/editing with copy
- `copy-wizard-screen.js` - Multi-step copy wizard with inline text input
- `text-input-screen.js` - Bordered text input with validation
- `fuzzy-search-screen.js` - Reusable search interface
- `kubernetes-namespace-screen.js` - Kubernetes namespace selection
- `index.js` - Screen exports

#### Utilities (`lib/utils/`)
- `secrets.js` - Secret parsing/generation logic

## Key Features

### Interactive Mode (`lowkey interactive` or `lowkey x`)
- **Fuzzy search interface** with regex support
- **Multi-step navigation**: Type selection → Secret selection → Key browser
- **Live editing** with temporary editor sessions
- **Search preservation** when navigating between views
- **Visual feedback** with cursor indicators in search mode

#### Interactive Navigation Flow
1. **Type Selection** - Choose between aws-secrets-manager, env, json, kubernetes
2. **Secret Selection** - Browse available secrets with fuzzy search
3. **Namespace Selection** (Kubernetes only) - Choose Kubernetes namespace
4. **Key Browser** - View/edit individual key-value pairs

#### Interactive Key Bindings
- `↑↓` or `j/k` - Navigate items
- `/` - Enter search mode (shows `█` cursor)
- `Space` - **Multi-select keys** (toggle individual key selection)
- `e` - Edit mode (only for env/json/AWS secrets)
- `Ctrl+S` - **Copy secrets** (selected keys or all if none selected)
- `Ctrl+D` - **Delete keys** (selected keys or current key)
- `Ctrl+V` - Toggle value visibility
- `Enter` - Select/confirm
- `Esc` - Clear multi-selection, exit search, or go back
- `Ctrl+C` - Exit application

### Multi-Select Key Management (`Space` from Key Browser)
- **Individual key selection** - Select specific keys with spacebar toggle
- **Visual indicators** - Checkmark prefix shows selected keys
- **Unified operations** - Both copy (Ctrl+S) and delete (Ctrl+D) respect selections
- **Smart escape behavior** - Esc clears selections → exits search → goes back
- **Selection state display** - Header shows "Selected: X keys" when active
- **Copy behavior**: Selected keys OR all keys if none selected
- **Delete behavior**: Selected keys OR current focused key if none selected

### Copy Wizard (`Ctrl+S` from Key Browser)
- **Multi-select aware** - Copies selected keys or all keys if none selected
- **Multi-step wizard** - Preview → Format Selection → File/Namespace Selection → Confirmation
- **Merge behavior** - Adds new keys to existing files instead of overwriting
- **Context preservation** - Shows exactly which keys will be copied
- **Format support** - Export to .env, .json, or Kubernetes secrets
- **Kubernetes integration** - Full namespace selection, secret listing, and inline secret creation
- **File management** - Choose existing files or create new ones with guided naming
- **Visual feedback** - Clear explanation of merge behavior in confirmation
- **Automatic backup** - Creates .bak files before modifying existing files
- **Auto-navigation** - Automatically navigates to newly created secrets/files after successful copy

### Editing Features
- **Environment files (.env)** - Edit in env format, save to local file
- **JSON files** - Edit in JSON format, save to local file  
- **AWS Secrets** - Edit in JSON format, upload to AWS Secrets Manager
- **Kubernetes Secrets** - Edit in JSON format, upload to Kubernetes cluster
- **Filtered editing** - When search is active, only matching keys are editable
- **Automatic validation** - JSON parsing, flat object structure, env key format
- **Error handling** - Clear error messages for invalid formats or AWS/Kubernetes failures

### Search Functionality
- **Regex support** - Search patterns like `log.*Error`
- **Search preservation** - Queries maintained when navigating back from child views
- **Visual feedback** - White block cursor `█` shows active search input
- **Explicit activation** - Must press `/` to enter search mode (no auto-activation)

## Technical Implementation Details

### Screen-Based Architecture (Enhanced 2025)
The interactive system now uses a **screen-based architecture** with individual screen components and a centralized terminal manager:

#### Screen System (`lib/screens/`)
- **BaseScreen**: Foundation class for all interactive screens
- **TypeSelectionScreen**: Choose storage type (AWS/env/json)
- **SecretSelectionScreen**: Browse and select secrets with fuzzy search
- **KeyBrowserScreen**: View/edit individual key-value pairs with copy functionality
- **CopyWizardScreen**: Multi-step guided secret copying interface
- **TextInputScreen**: Bordered text input with cursor navigation and validation
- **FuzzySearchScreen**: Reusable search interface component

#### Terminal Management (`terminal-manager.js`)
- Screen stack management with push/pop navigation
- Raw mode activation/deactivation
- Alternate screen buffer management  
- Process signal handling (SIGINT, SIGTERM)
- Stdin/stdout coordination

#### Key Event System (`key-handlers.js`)
- **KeyEventManager**: Routes key events to registered handlers
- **KeyHandlerUtils**: Common key handling patterns and utilities
- **Factory functions**: `createFuzzySearchKeyHandler()`, `createInteractiveBrowserKeyHandler()`
- **Reusable patterns**: Navigation, search, pagination, editing

#### Rendering System (`renderer.js`)
- **ScreenRenderer**: Throttled rendering with performance optimization
- **RenderUtils**: Pagination calculations, breadcrumb formatting, value truncation
- **16ms render throttling** for smooth 60fps-like experience

#### Configuration Management (`constants.js`)
- **INTERACTIVE**: Rendering timeouts, terminal dimensions, pagination settings
- **FILES**: JSON exclusion lists, backup extensions, regex patterns
- **AWS**: Default stages and configuration
- **STORAGE_TYPES**: Centralized supported types array

#### Shared Utilities (`arg-parser.js`)
- **parseCommonArgs()**: Standard argument parsing (--region, --path, --help)
- **Validation functions**: validateRequiredArgs(), validateTypes(), validateAwsRegion()
- **Custom argument handlers**: Flexible per-command argument processing

### Fuzzy Search (`fuzzyPrompt`)
- Returns `{selection, query}` object to preserve search state
- Supports initial query parameter for restoring searches
- Uses **factory-generated key handlers** from `KeyHandlerUtils`
- Regex-based matching with fallback to simple text search

### Search State Management
- `searchState` object passed between navigation levels
- `secretQuery` property stores current search for secret selection
- State flows: options → runInteractiveInspect → handleInteractiveCommand

### Editor Integration
- Uses `$EDITOR` environment variable or defaults to vim
- Creates temporary files in `os.tmpdir()`
- Handles process spawning with proper stdio inheritance
- Terminal mode switching (raw mode for UI, normal for editor)

### AWS Integration
- Uses AWS SDK v3 with automatic credential chain
- Region from `--region` CLI arg or `AWS_REGION` environment variable
- Supports secret creation, updating, and listing
- Alphabetical sorting of secrets for consistent UX

### File Operations
- **Env files**: Regex parsing with quote handling and escape sequences
- **JSON files**: Validation for flat object structure (no nested objects/arrays)
- **Merge functionality**: New keys added to existing files, existing keys overwritten
- **Backup functionality**: Creates `.bak` files before modifying existing files
- **Smart exclusions**: Filters out standard config files (configurable via constants)

## Error Handling Strategy

### User-Friendly Messages
- AWS API errors mapped to clear descriptions
- JSON parsing errors with context
- File operation errors with helpful suggestions
- Validation errors with specific requirements

### Graceful Degradation
- Missing credentials show helpful setup instructions
- Invalid files are skipped with warnings
- Network errors provide retry guidance

## Development Patterns

### Architecture Principles (Updated 2025)
- **Separation of concerns**: Each module has a single responsibility
- **Composition over inheritance**: Uses composition for complex interactive features
- **Factory patterns**: Key handlers and rendering utilities use factory functions
- **Configuration centralization**: All constants and magic numbers in `constants.js`
- **Shared utilities**: Common patterns extracted to reusable modules

### Consistent Code Style
- CommonJS modules (`require`/`module.exports`)
- Async/await for promise handling
- Destructuring for clean parameter handling
- Error-first callback patterns where needed
- **Factory functions** for configurable behavior
- **Options objects** for complex parameter passing

### Testing Strategy
- Syntax validation with `node -c`
- Manual testing workflows documented
- Docker builds for environment validation
- **Modular testing**: Individual components can be tested in isolation

### Color System
- `colors.js` provides consistent terminal coloring
- Semantic color usage (red for errors, green for success, cyan for info)
- Maintains readability across different terminal themes

### Refactoring Benefits (2025)
- **Reduced duplication**: ~200+ lines of duplicate code eliminated
- **Better maintainability**: Changes isolated to specific modules
- **Enhanced testability**: Components can be unit tested independently  
- **Improved extensibility**: New interactive features easier to add
- **Performance optimization**: Rendering and key handling optimized

## Key Files to Understand

### Interactive System (Core Architecture)
1. **`lib/screens/base-screen.js`** - Foundation screen class with lifecycle management
2. **`lib/terminal-manager.js`** - Terminal state management and screen stack
3. **`lib/key-handlers.js`** - Key event processing and reusable handler factories  
4. **`lib/renderer.js`** - Screen rendering, throttling, and pagination utilities
5. **`lib/screens/copy-wizard-screen.js`** - Advanced copy wizard with text input integration
6. **`lib/screens/text-input-screen.js`** - Bordered text input with cursor and validation
7. **`commands/interactive.js`** - Interactive command flow and navigation

### Business Logic & Utilities  
8. **`lib/secrets.js`** - Secret format handling and validation
9. **`lib/aws.js`** - AWS Secrets Manager operations
10. **`lib/files.js`** - Local file parsing and generation
11. **`lib/arg-parser.js`** - Shared argument parsing utilities
12. **`lib/constants.js`** - Configuration constants and magic numbers

## Debug Logging

When debugging issues, use the debug logging system:

```bash
# Run with debug logging enabled
make debug-interactive       # Interactive mode with debug
make debug-run ARGS="list"   # Any command with debug
LOWKEY_DEBUG=true node cli.js interactive  # Direct debug

# View logs
make log                     # Tail the latest log (live)
make log-latest             # Cat the entire latest log
make log-list               # List all debug logs
make log-clean              # Clean up all logs
```

Debug logs are saved to `./lowkey-logs/` in the current directory with timestamps. The logging system:
- Captures all errors with stack traces
- Logs key operations and state changes
- Sanitizes sensitive data (passwords, tokens, secrets)
- Creates a symlink to the latest log for easy access

**Important**: When debugging crashes, always run `make log-latest` after the crash to see the full error details.

## Common Debugging Areas

### Interactive System Issues
1. **Key handlers not responding** - Check KeyEventManager registration and factory configuration; verify handler functions are synchronous (not async) to prevent Promise-based key consumption
2. **Screen navigation problems** - Verify TerminalManager screen stack and proper use of pushScreen/popScreen
3. **Rendering glitches** - Check ScreenRenderer throttling and state synchronization
4. **Search state not preserved** - Check searchState flow through navigation
5. **Copy wizard issues** - Verify TextInputScreen integration and file validation logic

### Common Issues  
6. **Editor not launching** - Verify EDITOR env var and terminal mode handling  
7. **AWS operations failing** - Check region parameter passing and credentials
8. **Regex search issues** - Verify pattern escaping in fuzzySearch function
9. **Argument parsing errors** - Check arg-parser validation and custom handlers
10. **Text input cursor issues** - Check cursor positioning logic and box width calculations

## Version and Dependencies

- **Node.js**: >=18 required
- **AWS SDK**: `@aws-sdk/client-secrets-manager` v3
- **No other external dependencies** - keeps it lightweight
- **Current version**: 1.6.0 (check package.json)

## Package Structure

```
lowkey/
├── cli.js              # Entry point
├── commands/           # Command implementations
│   ├── copy.js
│   ├── inspect.js
│   ├── interactive.js
│   └── list.js
├── lib/                # Core libraries (refactored 2025)
│   ├── cli/            # CLI layer
│   │   ├── arg-parser.js       # Common argument parsing utilities
│   │   ├── command-handlers.js # Shared command logic
│   │   └── command-parser.js   # Unified command parsing
│   ├── core/           # Core systems
│   │   ├── colors.js           # Terminal color utilities
│   │   ├── config.js           # Centralized configuration management
│   │   ├── constants.js        # Configuration constants
│   │   ├── debug-logger.js     # Debug logging system
│   │   └── error-handler.js    # Standardized error handling
│   ├── interactive/    # Interactive system
│   │   ├── interactive.js      # UI orchestration
│   │   ├── key-handlers.js     # Key event processing
│   │   ├── renderer.js         # Screen rendering & pagination
│   │   ├── terminal-manager.js # Terminal state management
│   │   ├── terminal-utils.js   # Terminal utility functions
│   │   ├── ui-components.js    # Reusable UI components
│   │   └── screens/            # Screen-based UI components
│   │       ├── index.js        # Screen exports
│   │       ├── base-screen.js          # Foundation screen class
│   │       ├── type-selection-screen.js    # Storage type selection
│   │       ├── secret-selection-screen.js  # Secret browsing & selection
│   │       ├── key-browser-screen.js       # Key viewing/editing with copy
│   │       ├── copy-wizard-screen.js       # Multi-step copy wizard
│   │       ├── text-input-screen.js        # Bordered text input with validation
│   │       ├── fuzzy-search-screen.js      # Reusable search interface
│   │       └── kubernetes-namespace-screen.js # Kubernetes namespace selection
│   ├── providers/      # Storage providers
│   │   ├── aws.js              # AWS Secrets Manager operations
│   │   ├── files.js            # Local file operations
│   │   ├── kubernetes.js       # Kubernetes secrets operations
│   │   └── secret-operations.js # Unified secret operations interface
│   └── utils/          # Utilities
│       └── secrets.js          # Secret format handling and validation
├── static/             # Assets
│   └── lowkey.png
└── package.json        # NPM configuration
```

This **layered architecture** provides:
- **Clear separation of concerns**: CLI, core systems, providers, interactive, and utilities are isolated
- **Modular UI components**: Each screen is self-contained with its own logic and rendering
- **Centralized navigation**: TerminalManager handles screen stack and transitions  
- **Reusable patterns**: Common UI patterns (text input, fuzzy search) are componentized
- **Enhanced UX**: Rich interfaces like bordered text inputs and multi-step wizards
- **Easy extension**: New screens and providers can be added with minimal coupling
- **Unified command handling**: Shared logic between interactive and CLI modes
- **Standardized configuration**: Environment variables and settings managed centrally

## Recent Major Features (2025)

### Multi-Select Key Management System
- **Spacebar selection**: Toggle individual keys in Key Browser screen
- **Visual indicators**: Checkmark prefix (✓) shows selected keys
- **Unified operations**: Both copy (Ctrl+S) and delete (Ctrl+D) use same selection system
- **Smart escape**: Esc clears selections → exits search → goes back
- **Header feedback**: Shows "Selected: X keys" when in multi-select mode
- **Atomic operations**: All operations (copy/delete) work on exact selection
- **Merge behavior**: Copy operations add/overwrite keys instead of replacing files

### Enhanced Copy System  
- **Selection-aware**: Copies selected keys OR all keys if none selected
- **File merging**: New keys added to existing files, preserving other content
- **Visual confirmation**: Shows merge behavior explanation in confirmation screen
- **Backup safety**: Creates .bak files before modifying existing files
- **Success feedback**: Shows "merged X keys (Y total)" vs "wrote X keys"

### Delete Operations System
- **Multi-select support**: Delete selected keys or current focused key
- **Ctrl+D hotkey**: Delete keys from Key Browser or secrets from selection screens
- **Type-to-confirm safety**: Must type confirmation text exactly
- **Popup modal**: Overlay preserves context while confirming
- **All secret types**: Supports env, json, AWS Secrets Manager, Kubernetes
- **Clipboard support**: Ctrl+V (or Cmd+V on macOS) to paste confirmation text
- **Visual feedback**: Progressive states (input → deleting → success)
- **Error handling**: Clear messages for failed deletions
- **Auto-refresh**: Lists update after successful operations

### Popup System Architecture
- **PopupManager**: Singleton manager for modal overlays
- **BasePopup**: Foundation class for popup components
- **Overlay rendering**: Intelligent content positioning with ANSI preservation
- **Key routing**: Popup receives key events while preserving base screen
- **Current popups**:
  - Delete confirmation (Ctrl+D)
  - AWS profile selector (Ctrl+A)

### Declarative Component System
- **40+ UI Components**: Text, Title, List, Box, Modal, Table, ProgressBar, etc.
- **Factory functions**: Consistent API across all components
- **Zone-based rendering**: Header, body, footer zones
- **ComponentScreen**: Base class for declarative screens
- **Automatic features**: Pagination, scrolling, truncation
- **Component examples**:
  ```javascript
  Title('Select a secret'),
  List(items, selectedIndex, { paginate: true }),
  InstructionsFromOptions({ hasSearch: true, hasDelete: true })
  ```

### AWS Profile Management (Ctrl+A)
- **Global popup**: Available from any screen
- **Three modes**: Compact → profile-list → region-list
- **Real-time switching**: Updates AWS configuration immediately
- **Visual indicators**: Shows current profile/region in header
- **Search functionality**: Filter profiles and regions
- **Environment persistence**: Updates AWS_PROFILE and AWS_REGION

### Copy Wizard System
- **Ctrl+S hotkey**: Accessible from Key Browser screen
- **Context-aware copying**: Respects current search filters
- **Guided workflow**: Multi-step wizard with visual feedback
- **Smart file management**: Choose existing files or create new ones with validation
- **Inline text input**: Shared inline text input system for both file creation and Kubernetes secret naming
- **No separate screens**: File naming now uses inline input instead of separate TextInputScreen to avoid activation issues

### Enhanced Text Input
- **Shared utility**: `renderInlineTextInput()` method used by both filename input and Kubernetes secret creation
- **Visual design**: Bordered input boxes with Unicode box-drawing characters  
- **Cursor navigation**: White block cursor with real-time character input
- **Keyboard shortcuts**: Backspace, Ctrl+U (clear), arrow keys, standard editing
- **Immediate response**: No screen switching - input happens directly in the wizard
- **Auto-validation**: Filename validation and extension auto-addition

# Testing

This project includes a comprehensive test suite using Node.js built-in test runner with **67 tests** across **28 test suites**.

## Quick Commands

```bash
# Using npm (direct)
npm test                    # Run all tests
npm run test:watch          # Watch mode  
npm run test:coverage       # Coverage report
npm run test:unit           # Unit tests only
npm run test:integration    # Integration tests only

# Using make (recommended)
make test                   # Run all tests
make test-watch             # Watch mode
make test-coverage          # Coverage report  
make test-coverage-threshold  # Coverage with 80% threshold
make test-unit              # Unit tests only
make test-integration       # Integration tests only
make test-ci                # CI pipeline (tests + coverage threshold)
```

## Current Test Coverage (2025)

**Overall Coverage: 56.66% lines | 84.40% branches | 55.56% functions**

### Core Business Logic (Well Tested)
- **`secrets.js`**: 94.87% - Secret parsing, validation, format generation
- **`files.js`**: 88.24% - File operations, env parsing, validation  
- **`constants.js`**: 100% - Configuration constants
- **`aws.js`**: 77.78% - AWS Secrets Manager integration

### Interactive System (Needs Testing)
- **`key-handlers.js`**: 24.75% - Key event processing **[PRIORITY]**
- **`renderer.js`**: 35.97% - Screen rendering utilities **[PRIORITY]** 
- **`terminal-manager.js`**: 14.63% - Terminal state management **[PRIORITY]**
- **Screen Components**: 9-28% coverage **[NEW FEATURES]**
  - `base-screen.js`: 28.49%
  - `key-browser-screen.js`: 9.84% 
  - `copy-wizard-screen.js`: Not covered **[PRIORITY]**
  - `text-input-screen.js`: Not covered **[PRIORITY]**

## Test Structure & Categories

### Integration Tests (40+ tests)
✅ **Copy Command** (`copy.test.js`)
- env ↔ json conversion with all value types
- Backup file creation and overwrite protection
- Error handling for missing files and invalid formats
- Help text and usage validation

✅ **List Command** (`list.test.js`)  
- Directory listing for env/json files
- Standard exclusions (package.json, etc.)
- Argument validation and error scenarios
- Empty directory handling

✅ **Error Handling** (`error-handling.test.js`)
- Global CLI errors (unknown commands, help, version)  
- File system errors (permissions, missing files)
- Malformed file handling (invalid JSON, bad env formats)
- AWS credential validation and region handling
- Comprehensive argument validation

### Unit Tests (25+ tests)
✅ **Secrets Logic** (`secrets.test.js`) - 100% coverage
- JSON parsing with flat object validation
- Environment file generation with escaping
- Value type preservation and formatting

✅ **File Operations** (`files.test.js`) - 100% coverage  
- Environment variable key validation
- Value escaping for special characters
- Env file parsing with quotes and escape sequences

✅ **Argument Parsing** (`arg-parser.test.js`) - 37% coverage
- Common argument parsing patterns
- Required argument validation  
- Type validation for supported storage types

## Test Gaps & Priorities

### 🚨 High Priority (New Features)
1. **Copy Wizard System** - No test coverage
   - Multi-step workflow testing
   - File name validation
   - Format conversion validation
   - Error handling in wizard steps

2. **Text Input Component** - No test coverage
   - Cursor navigation logic
   - Input validation
   - Keyboard shortcut handling

3. **Key Event System** - 24.75% coverage
   - Key handler registration
   - Event routing logic
   - Search mode transitions

### 🎯 Medium Priority (Core Interactive)
4. **Screen Navigation** - Low coverage
   - Screen stack management
   - State preservation
   - Breadcrumb navigation

5. **Terminal Management** - 14.63% coverage
   - Raw mode handling
   - Alternate screen buffer
   - Process signal handling

### 🔧 Low Priority (Polish)
6. **Renderer System** - 35.97% coverage
   - Throttled rendering
   - Pagination calculations
   - Color formatting

## Testing Strategy for Interactive Components

### Testable Units
```javascript
// Example: Test key handler logic in isolation
const { KeyHandlerUtils } = require('../lib/key-handlers');

test('fuzzy search handler processes navigation keys', () => {
  const handler = KeyHandlerUtils.createFuzzySearchKeyHandler({
    filteredItemsKey: 'items',
    terminal: mockTerminal
  });
  
  const result = handler('j', { items: ['a', 'b'], selectedIndex: 0 });
  assert.strictEqual(mockTerminal.setState.calledWith({ selectedIndex: 1 }), true);
});
```

### Integration Testing Approach
```javascript
// Example: Test copy wizard end-to-end with mock terminal
test('copy wizard workflow completes successfully', async () => {
  const wizard = new CopyWizardScreen({
    secretData: { KEY1: 'value1' },
    filteredKeys: ['KEY1']
  });
  
  // Simulate user input sequence
  await simulateKeySequence(wizard, ['\r', '\r', 'test.json\r', 'y']);
  
  assert(fs.existsSync('test.json'));
});
```

## Coverage Tools & Scripts

```bash
# Generate detailed coverage report
node --test --experimental-test-coverage \
  --test-coverage-exclude="**/node_modules/**" \
  --test-coverage-exclude="**/tests/**" \
  tests/**/*.test.js

# Coverage with specific thresholds
node --test --experimental-test-coverage \
  --test-coverage-lines=80 \
  --test-coverage-functions=80 \
  tests/**/*.test.js
```

## Best Practices & Patterns

### Popup Development Pattern
When creating a new popup:
1. Extend `BasePopup` class
2. Implement `render()` to return string content
3. Implement `handleKey()` for input handling
4. Use `PopupManager.showPopup()` to display
5. Consider multi-character paste handling for text input

### Component Screen Pattern
For new declarative screens:
1. Extend `ComponentScreen` class
2. Override `getComponents()` to return component array
3. Use factory functions from `component-system.js`
4. Let the renderer handle layout and pagination
5. Keep business logic separate from rendering

### File Exclusion Pattern
When listing files:
1. Use `listJsonFiles()` and `listEnvFiles()` from `files.js`
2. These automatically exclude system files (package.json, etc.)
3. Exclusion list is configurable in `constants.js`

### Cross-Platform Considerations
- **Clipboard**: Use pbpaste (macOS) / xclip (Linux)
- **Key bindings**: Show Cmd+V on macOS, Ctrl+V elsewhere
- **Terminal detection**: Handle both iTerm2 and standard terminals
- **Paste handling**: Multi-character input comes as single event on macOS

## Testing Guidelines

### When to Add Tests
- **Always**: After implementing new features
- **Before**: Major refactoring
- **Priority**: Business logic and data transformations
- **Consider**: Interactive components (with mocking)

### Test Quality Standards
- **Integration first**: Test complete user workflows
- **Strategic unit tests**: Complex business logic only
- **Error scenarios**: All failure modes covered
- **Real data**: Use actual file formats and edge cases

See [tests/README.md](tests/README.md) for detailed testing documentation and helpers.

# Debug Logging

Comprehensive debug logging system for troubleshooting interactive components and copy operations.

## Enable Debug Logging

```bash
# Enable debug logging
LOWKEY_DEBUG=true node cli.js interactive

# Using make commands
make debug-interactive    # Run interactive mode with debug logging
make debug-run           # Run any command with debug logging

# View logs
make log                 # Follow latest log in real-time
make log-latest          # View latest log content  
make log-list            # List all debug log files
make log-clean           # Clean old debug logs
```

## Debug Log Features

- **Timestamped files**: Each session creates `lowkey-debug-YYYY-MM-DDTHH-MM-SS.log`
- **Symlinked latest**: `lowkey-logs/latest.log` always points to newest log
- **Sensitive data sanitization**: Automatically redacts passwords, tokens, secrets, keys
- **Structured logging**: Component-based logging with JSON data objects
- **Global error capture**: Uncaught exceptions and unhandled rejections logged
- **Real-time writing**: Logs written immediately (not buffered until exit)

## Log Location

Debug logs are written to `./lowkey-logs/` in the current working directory.

# Development

## k3d Local Kubernetes

For local Kubernetes development and testing:

```bash
# Cluster management
make k3d-setup           # Install k3d if not present
make k3d-create          # Create 'lowkey-test' cluster
make k3d-start           # Start existing cluster
make k3d-stop            # Stop cluster
make k3d-delete          # Delete cluster
make k3d-restart         # Stop and start cluster
make k3d-context         # Switch kubectl context to cluster
make k3d-status          # Show cluster status
make k3d-clean           # Delete cluster and clean up

# Combined operations
make k3d-setup k3d-create k3d-context  # Full setup for new development
```

The k3d cluster runs on port 6443 and is pre-configured for lowkey development and testing.

# Refactoring Roadmap

## Planned Refactoring Initiatives (2025)

### 1. **Command Handler Unification** ✅ *COMPLETED*
**Priority**: High  
**Problem**: Interactive and non-interactive commands duplicate core logic
- `commands/copy.js` and `lib/screens/copy-wizard-screen.js` both handle secret copying
- `commands/list.js` and interactive screens both list secrets  
- `commands/inspect.js` and interactive screens both inspect secrets

**Solution**: ✅ **COMPLETED** - Created shared command handlers in `lib/cli/command-handlers.js` with unified logic for copy, list, and inspect operations used by both CLI and interactive modes.

### 2. **Argument Parsing Consolidation** ✅ *COMPLETED*
**Priority**: High  
**Problem**: Each command has similar argument parsing patterns with repeated validation logic

**Solution**: ✅ **COMPLETED** - Created unified command parser in `lib/cli/command-parser.js` with standardized configuration objects and validation.

### 3. **Secret Operations Abstraction** ✅ *COMPLETED*
**Priority**: Medium  
**Problem**: Secret fetching/uploading logic scattered across `secrets.js`, `aws.js`, `kubernetes.js`

**Solution**: ✅ **COMPLETED** - Created unified secret operations interface in `lib/providers/secret-operations.js` with clean provider abstraction. All providers moved to `lib/providers/` directory.

### 4. **Error Handling Standardization** ✅ *COMPLETED*
**Priority**: Medium  
**Problem**: Inconsistent error handling - some throw, others return error objects, different formatting

**Solution**: ✅ **COMPLETED** - Created centralized error handling system in `lib/core/error-handler.js` with standardized formatting and user-friendly messages.

### 5. **Configuration Management** ✅ *COMPLETED*
**Priority**: Low  
**Problem**: Configuration scattered across config files, env vars, and hard-coded constants

**Solution**: ✅ **COMPLETED** - Created comprehensive configuration management in `lib/core/config.js` with environment variable validation, type checking, and unified loading.

### 6. **Terminal UI Component Reuse** ✅ *COMPLETED*
**Priority**: Low  
**Problem**: Interactive screens have duplicated UI logic and rendering patterns

**Solution**: ✅ **COMPLETED** - Created reusable UI components in `lib/interactive/ui-components.js` with common patterns like bordered inputs, pagination, and rendering utilities.

## Benefits of Refactoring ✅ **ACHIEVED**
- **Reduced Duplication**: ✅ Shared logic between interactive and non-interactive modes
- **Easier Maintenance**: ✅ Core logic changes only need to be made in one place
- **Better Testing**: ✅ Shared functions can be tested once and reused
- **Easier Extension**: ✅ Adding new commands or storage types becomes simpler
- **Improved Reliability**: ✅ Standardized error handling and validation
- **Clear Architecture**: ✅ Layered structure with separation of concerns
- **Centralized Configuration**: ✅ All settings managed in one place

## Commit Message Style Guide

Follow this consistent commit message pattern based on project history:

### Format
- **Imperative mood**: Start with action verbs like "Add", "Fix", "Refactor", "Update", "Remove"
- **Concise**: Short descriptions without periods or punctuation
- **Present tense**: Describe what the commit does, not what was done
- **Focus on what, not why**: The change itself, not the reasoning

### Examples from Project History
```
Add interactive copy
Fix env copy filename input  
Refactor screens into their own files
Add k8s copying
Remove checkboxes from existing files
Update claude.md
Increase test coverage
Add more tests
```

### Common Patterns
- **Add**: New features, files, functionality
- **Fix**: Bug fixes, error corrections
- **Refactor**: Code restructuring without changing functionality
- **Update**: Modifications to existing features
- **Remove**: Deletion of code, features, or files

- whenever i send a prompt that says "archive" and that alone, that means i want you to update the claude.md memory with any updates we've made to keep it current
- whenever i say "add and commit", i want you to add the updated files and commit using my standard commit messaging
- remember that you can't run lowkey in interactive mode because it nees TTY
- "test add commit" should use make test to make sure it tests localstack and k3d too
- use a simpler oneliner for git commit messages
- we shouldn't use console.logs as debug logging, we have a debuglogger setup for that writes to a file as we go, you should use that when adding logs for debugging
- you put console logs, they should write to the debug logger