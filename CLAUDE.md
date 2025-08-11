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

### Core Libraries
All core functionality is in the `lib/` directory:
- `aws.js` - AWS Secrets Manager integration
- `files.js` - Local file operations (env/JSON)
- `secrets.js` - Secret parsing/generation logic
- `colors.js` - Terminal color utilities
- `constants.js` - Configuration constants and magic numbers
- `arg-parser.js` - Shared argument parsing utilities
- `terminal-manager.js` - Terminal state management (raw mode, alternate screen)
- `key-handlers.js` - Key event processing and reusable handlers
- `renderer.js` - Screen rendering with throttling and pagination utilities
- `interactive.js` - Interactive UI orchestration and editor integration

## Key Features

### Interactive Mode (`lowkey interactive` or `lowkey x`)
- **Fuzzy search interface** with regex support
- **Multi-step navigation**: Type selection → Secret selection → Key browser
- **Live editing** with temporary editor sessions
- **Search preservation** when navigating between views
- **Visual feedback** with cursor indicators in search mode

#### Interactive Navigation Flow
1. **Type Selection** - Choose between aws-secrets-manager, env, json
2. **Secret Selection** - Browse available secrets with fuzzy search
3. **Key Browser** - View/edit individual key-value pairs

#### Interactive Key Bindings
- `↑↓` or `j/k` - Navigate items
- `/` - Enter search mode (shows `█` cursor)
- `e` - Edit mode (only for env/json/AWS secrets)
- `Ctrl+V` - Toggle value visibility
- `Enter` - Select/confirm
- `Esc` - Go back or exit search
- `Ctrl+C` - Exit application

### Editing Features
- **Environment files (.env)** - Edit in env format, save to local file
- **JSON files** - Edit in JSON format, save to local file  
- **AWS Secrets** - Edit in JSON format, upload to AWS Secrets Manager
- **Filtered editing** - When search is active, only matching keys are editable
- **Automatic validation** - JSON parsing, flat object structure, env key format
- **Error handling** - Clear error messages for invalid formats or AWS failures

### Search Functionality
- **Regex support** - Search patterns like `log.*Error`
- **Search preservation** - Queries maintained when navigating back from child views
- **Visual feedback** - White block cursor `█` shows active search input
- **Explicit activation** - Must press `/` to enter search mode (no auto-activation)

## Technical Implementation Details

### Modular Architecture (Refactored 2025)
The interactive system now uses **composition over inheritance** with separated concerns:

#### Terminal Management (`terminal-manager.js`)
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
- **Backup functionality**: Creates `.bak` files before overwriting
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
1. **`lib/terminal-manager.js`** - Terminal state management and cleanup
2. **`lib/key-handlers.js`** - Key event processing and reusable handler factories  
3. **`lib/renderer.js`** - Screen rendering, throttling, and pagination utilities
4. **`lib/interactive.js`** - Interactive UI orchestration, editor integration
5. **`commands/interactive.js`** - Interactive command flow and navigation

### Business Logic & Utilities  
6. **`lib/secrets.js`** - Secret format handling and validation
7. **`lib/aws.js`** - AWS Secrets Manager operations
8. **`lib/files.js`** - Local file parsing and generation
9. **`lib/arg-parser.js`** - Shared argument parsing utilities
10. **`lib/constants.js`** - Configuration constants and magic numbers

## Common Debugging Areas

### Interactive System Issues
1. **Key handlers not responding** - Check KeyEventManager registration and factory configuration
2. **Terminal mode problems** - Verify TerminalManager initialization and cleanup
3. **Rendering glitches** - Check ScreenRenderer throttling and state synchronization
4. **Search state not preserved** - Check searchState flow through navigation

### Legacy Issues  
5. **Editor not launching** - Verify EDITOR env var and terminal mode handling  
6. **AWS operations failing** - Check region parameter passing and credentials
7. **Regex search issues** - Verify pattern escaping in fuzzySearch function
8. **Argument parsing errors** - Check arg-parser validation and custom handlers

## Version and Dependencies

- **Node.js**: >=16 required
- **AWS SDK**: `@aws-sdk/client-secrets-manager` v3
- **No other external dependencies** - keeps it lightweight
- **Current version**: 1.5.0 (check package.json)

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
│   └── lowkey.png
└── package.json        # NPM configuration
```

This **modular architecture** supports easy extension for new storage types, output formats, and interactive features with **better separation of concerns** and **improved maintainability**.