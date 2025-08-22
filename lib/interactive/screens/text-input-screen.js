const { Screen } = require('./base-screen');
const { colorize } = require('../../core/colors');
const { RenderUtils } = require('../renderer');
const { NavigationComponents, InputComponents } = require('../ui-components');
const { KeyHandlerSet, KeyDetector } = require('../key-handler-set');

// Text input screen with bordered input box and cursor
class TextInputScreen extends Screen {
  constructor(options) {
    super({
      ...options,
      hasSearch: false,
      hasEdit: false,
      initialState: {
        inputText: options.defaultValue || '',
        cursorPosition: options.defaultValue ? options.defaultValue.length : 0,
        ...options.initialState
      }
    });
    
    this.prompt = options.prompt || 'Enter text:';
    this.placeholder = options.placeholder || '';
    this.maxLength = options.maxLength || 100;
    this.validator = options.validator || null;
    this.validationError = null;
    
    // Set up render function
    this.setRenderFunction(this.renderTextInput.bind(this));
  }

  setupKeyHandlers() {
    super.setupKeyHandlers();
    
    // Create a KeyHandlerSet for text input functionality
    const textInputHandlers = new KeyHandlerSet()
      .onEscape(() => {
        this.resolve({ cancelled: true, value: null });
        return true;
      })
      .onEnter(() => {
        const { inputText = '' } = this.state;
        
        // Validate input if validator provided
        if (this.validator) {
          const validation = this.validator(inputText);
          if (!validation.valid) {
            this.validationError = validation.error;
            this.render(true);
            return true;
          }
        }
        
        this.resolve({ cancelled: false, value: inputText });
        return true;
      })
      .onBackspace(() => {
        const { inputText = '', cursorPosition = 0 } = this.state;
        
        if (cursorPosition > 0) {
          const newText = inputText.slice(0, cursorPosition - 1) + inputText.slice(cursorPosition);
          const newPosition = cursorPosition - 1;
          this.setState({ 
            inputText: newText, 
            cursorPosition: newPosition 
          });
          this.validationError = null; // Clear validation error on input change
        }
        return true;
      })
      .onKey('\u0015', () => { // Ctrl+U - clear line
        this.setState({ 
          inputText: '', 
          cursorPosition: 0 
        });
        this.validationError = null;
        return true;
      })
      .onKey('\u0001', () => { // Ctrl+A - beginning of line
        this.setState({ cursorPosition: 0 });
        return true;
      })
      .onKey('\u0005', () => { // Ctrl+E - end of line
        const { inputText = '' } = this.state;
        this.setState({ cursorPosition: inputText.length });
        return true;
      })
      .onKey('\u001b[D', () => { // Left arrow
        const { cursorPosition = 0 } = this.state;
        if (cursorPosition > 0) {
          this.setState({ cursorPosition: cursorPosition - 1 });
        }
        return true;
      })
      .onKey('\u001b[C', () => { // Right arrow
        const { inputText = '', cursorPosition = 0 } = this.state;
        if (cursorPosition < inputText.length) {
          this.setState({ cursorPosition: cursorPosition + 1 });
        }
        return true;
      })
      .onPrintable((key) => {
        const { inputText = '', cursorPosition = 0 } = this.state;
        const char = KeyDetector.normalize(key);
        
        if (this.isPrintableChar(char) && inputText.length < this.maxLength) {
          // Insert character at cursor position
          const newText = inputText.slice(0, cursorPosition) + char + inputText.slice(cursorPosition);
          const newPosition = cursorPosition + 1;
          this.setState({ 
            inputText: newText, 
            cursorPosition: newPosition 
          });
          this.validationError = null; // Clear validation error on input change
          return true;
        }
        return false;
      });
    
    this.keyManager.addHandler((key, state, context) => {
      return textInputHandlers.process(key, { 
        state: state, 
        setState: this.setState.bind(this),
        screen: this
      });
    });
  }

  renderTextInput(state) {
    const { inputText = '', cursorPosition = 0 } = state;
    const output = [];
    
    // Breadcrumbs using NavigationComponents
    if (this.config.breadcrumbs.length > 0) {
      output.push(NavigationComponents.renderBreadcrumbs(this.config.breadcrumbs));
      output.push('');
    }
    
    // Text input box using InputComponents
    const textInputBox = InputComponents.renderTextInputBox(inputText, cursorPosition, {
      prompt: this.prompt,
      placeholder: this.placeholder,
      maxWidth: 80,
      validationError: this.validationError
    });
    
    output.push(textInputBox);
    
    // Instructions
    output.push('');
    output.push(colorize('Enter to confirm, Esc to cancel, Ctrl+U to clear', 'gray'));
    output.push(colorize('←→ to move cursor, Ctrl+A/E for start/end', 'gray'));
    
    return output.join('\n') + '\n';
  }

  isPrintableChar(keyStr) {
    return keyStr.length === 1 && keyStr >= ' ' && keyStr <= '~';
  }
}

module.exports = { TextInputScreen };