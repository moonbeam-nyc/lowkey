const { Screen } = require('./base-screen');
const { colorize } = require('../../core/colors');
const { RenderUtils } = require('../renderer');
const { NavigationComponents, InputComponents } = require('../ui-components');

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
    
    const handler = (keyStr, state) => {
      const { inputText = '', cursorPosition = 0 } = state;
      
      if (keyStr === '\u001b') { // Escape - cancel
        this.resolve({ cancelled: true, value: null });
        return true;
      } else if (keyStr === '\r') { // Enter - submit
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
      } else if (keyStr === '\u007f' || keyStr === '\b') { // Backspace
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
      } else if (keyStr === '\u0015') { // Ctrl+U - clear line
        this.setState({ 
          inputText: '', 
          cursorPosition: 0 
        });
        this.validationError = null;
        return true;
      } else if (keyStr === '\u0001') { // Ctrl+A - beginning of line
        this.setState({ cursorPosition: 0 });
        return true;
      } else if (keyStr === '\u0005') { // Ctrl+E - end of line
        this.setState({ cursorPosition: inputText.length });
        return true;
      } else if (keyStr === '\u001b[D') { // Left arrow
        if (cursorPosition > 0) {
          this.setState({ cursorPosition: cursorPosition - 1 });
        }
        return true;
      } else if (keyStr === '\u001b[C') { // Right arrow
        if (cursorPosition < inputText.length) {
          this.setState({ cursorPosition: cursorPosition + 1 });
        }
        return true;
      } else if (this.isPrintableChar(keyStr) && inputText.length < this.maxLength) {
        // Insert character at cursor position
        const newText = inputText.slice(0, cursorPosition) + keyStr + inputText.slice(cursorPosition);
        const newPosition = cursorPosition + 1;
        this.setState({ 
          inputText: newText, 
          cursorPosition: newPosition 
        });
        this.validationError = null; // Clear validation error on input change
        return true;
      }
      
      return false;
    };
    
    this.keyManager.addHandler(handler);
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