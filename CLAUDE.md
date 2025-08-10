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
- `interactive.js` - Interactive UI components and fuzzy search

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

### Fuzzy Search (`fuzzyPrompt`)
- Returns `{selection, query}` object to preserve search state
- Supports initial query parameter for restoring searches
- Debounced rendering for performance during typing
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
- **Smart exclusions**: Filters out standard config files (package.json, tsconfig.json, etc.)

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

### Consistent Code Style
- CommonJS modules (`require`/`module.exports`)
- Async/await for promise handling
- Destructuring for clean parameter handling
- Error-first callback patterns where needed

### Testing Strategy
- Syntax validation with `node -c`
- Manual testing workflows documented
- Docker builds for environment validation

### Color System
- `colors.js` provides consistent terminal coloring
- Semantic color usage (red for errors, green for success, cyan for info)
- Maintains readability across different terminal themes

## Key Files to Understand

1. **`lib/interactive.js`** - Core interactive functionality, fuzzy search, editing
2. **`commands/interactive.js`** - Interactive command orchestration and flow
3. **`lib/secrets.js`** - Secret format handling and validation
4. **`lib/aws.js`** - AWS Secrets Manager operations
5. **`lib/files.js`** - Local file parsing and generation

## Common Debugging Areas

1. **Search state not preserved** - Check searchState flow through navigation
2. **Editor not launching** - Verify EDITOR env var and terminal mode handling  
3. **AWS operations failing** - Check region parameter passing and credentials
4. **Regex search issues** - Verify pattern escaping in fuzzySearch function
5. **Terminal rendering** - Check alternate screen buffer management

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
├── lib/                # Core libraries
│   ├── aws.js
│   ├── colors.js
│   ├── files.js
│   ├── interactive.js  # Interactive UI components
│   └── secrets.js
├── static/             # Assets
│   └── lowkey.png
└── package.json        # NPM configuration
```

This architecture supports easy extension for new storage types, output formats, and interactive features.