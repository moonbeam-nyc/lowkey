/**
 * Delete Keys Confirmation Popup
 * 
 * A modal popup that prompts the user to confirm key deletion by typing the confirmation phrase.
 * Supports deleting single or multiple keys from a secret.
 */

const { BasePopup } = require('../popup-manager');
const { colorize } = require('../../core/colors');

class DeleteKeysConfirmationPopup extends BasePopup {
  constructor(options) {
    super(options);
    
    this.keysToDelete = options.keysToDelete || [];
    this.secretName = options.secretName || '';
    this.onConfirm = options.onConfirm || (() => {});
    this.onCancel = options.onCancel || (() => {});
    
    // Determine confirmation text based on key count
    this.confirmationText = this.keysToDelete.length === 1 ? 'delete secret' : 'delete secrets';
    
    // Internal state
    this.inputValue = '';
    this.errorMessage = null;
    this.isDeleting = false;
    this.deleteSuccess = false;
  }

  /**
   * Render the delete confirmation modal content (for PopupManager)
   */
  render() {
    try {
      return this.renderModalContent();
    } catch (error) {
      console.error('Error rendering delete keys confirmation popup:', error);
      return 'Error rendering popup';
    }
  }

  /**
   * Generate modal content as a string (for PopupManager overlay)
   */
  renderModalContent() {
    const lines = [];
    
    // Calculate modal dimensions
    const keysList = this.keysToDelete.join(', ');
    const minContentWidth = Math.max(
      keysList.length + 10,  // Keys list display
      this.confirmationText.length + 20,  // Confirmation text
      50,  // Instructions text
      30   // Minimum usable width
    );
    const modalWidth = Math.min(Math.max(60, minContentWidth), 100); // Cap at 100 chars
    
    if (this.deleteSuccess) {
      // Success message modal - compact
      const keyCount = this.keysToDelete.length;
      const successMessage = `${keyCount} key${keyCount === 1 ? '' : 's'} deleted successfully`;
      const fullSuccessMessage = `✓ ${successMessage}`;
      
      // Calculate proper width
      const successWidth = Math.min(
        Math.max(
          40,                               // Minimum width
          fullSuccessMessage.length + 4,   // Message + padding
          'Press any key to continue'.length + 4  // Instructions + padding
        ),
        process.stdout.columns - 10        // Max width: terminal width minus padding
      );
      
      lines.push(this.buildModalBorder('top', successWidth));
      lines.push(this.buildModalLine(colorize(keyCount === 1 ? 'Key Deleted' : 'Keys Deleted', 'green'), successWidth));
      lines.push(this.buildModalLine('', successWidth));
      lines.push(this.buildModalLine(`${colorize('✓', 'green')} ${successMessage}`, successWidth));
      lines.push(this.buildModalLine('', successWidth));
      lines.push(this.buildModalLine(colorize('Press any key to continue', 'gray'), successWidth));
      lines.push(this.buildModalBorder('bottom', successWidth));
      
    } else if (this.isDeleting) {
      // Deleting message modal
      lines.push(this.buildModalBorder('top', modalWidth));
      lines.push(this.buildModalLine(colorize(this.keysToDelete.length === 1 ? 'Delete Key' : 'Delete Keys', 'red'), modalWidth));
      lines.push(this.buildModalLine('', modalWidth));
      lines.push(this.buildModalLine(colorize('Deleting keys...', 'yellow'), modalWidth));
      lines.push(this.buildModalLine('', modalWidth));
      lines.push(this.buildModalLine('', modalWidth));
      lines.push(this.buildModalLine('', modalWidth));
      lines.push(this.buildModalBorder('bottom', modalWidth));
      
    } else {
      // Confirmation prompt modal
      const isPlural = this.keysToDelete.length > 1;
      const title = isPlural ? 'Delete Keys' : 'Delete Key';
      
      lines.push(this.buildModalBorder('top', modalWidth));
      lines.push(this.buildModalLine(colorize(title, 'red'), modalWidth));
      lines.push(this.buildModalLine('', modalWidth));
      lines.push(this.buildModalLine(`From secret: ${colorize(this.secretName, 'cyan')}`, modalWidth));
      lines.push(this.buildModalLine('', modalWidth));
      
      // Show keys to be deleted
      if (isPlural) {
        lines.push(this.buildModalLine(colorize(`You are about to delete ${this.keysToDelete.length} keys:`, 'yellow'), modalWidth));
      } else {
        lines.push(this.buildModalLine(colorize('You are about to delete this key:', 'yellow'), modalWidth));
      }
      
      // List keys (with word wrapping if needed)
      const keysDisplay = this.keysToDelete.map(key => colorize(key, 'white')).join(', ');
      const wrappedKeys = this.wrapText(keysDisplay, modalWidth - 6);
      wrappedKeys.forEach(line => {
        lines.push(this.buildModalLine(line, modalWidth));
      });
      
      lines.push(this.buildModalLine('', modalWidth));
      lines.push(this.buildModalLine(colorize(`Type "${this.confirmationText}" to confirm:`, 'yellow'), modalWidth));
      lines.push(this.buildModalLine('', modalWidth));
      
      // Input box
      const inputBoxLines = this.buildInputBoxLines(modalWidth - 4);
      inputBoxLines.forEach(line => {
        lines.push(this.buildModalLine(line, modalWidth));
      });
      
      lines.push(this.buildModalLine('', modalWidth));
      
      // Instructions
      const canDelete = this.inputValue === this.confirmationText;
      const pasteKey = process.platform === 'darwin' ? 'Cmd+V' : 'Ctrl+V';
      const instructions = [
        colorize(pasteKey, 'white') + ' paste',
        colorize('Enter', canDelete ? 'white' : 'gray') + (canDelete ? ' delete' : ' disabled'),
        colorize('Esc', 'white') + ' cancel'
      ].join(', ');
      lines.push(this.buildModalLine(colorize(instructions, 'gray'), modalWidth));
      
      // Error message
      if (this.errorMessage) {
        lines.push(this.buildModalLine(colorize(`Error: Must type "${this.confirmationText}".`, 'red'), modalWidth));
      } else {
        lines.push(this.buildModalLine('', modalWidth));
      }
      
      lines.push(this.buildModalBorder('bottom', modalWidth));
    }
    
    return lines.join('\n');
  }
  
  /**
   * Wrap text to fit within a specified width, accounting for ANSI codes
   */
  wrapText(text, maxWidth) {
    const lines = [];
    const words = text.split(' ');
    let currentLine = '';
    
    for (const word of words) {
      const plainWord = word.replace(/\x1B\[[0-9;]*m/g, ''); // Strip ANSI for length calc
      const plainCurrentLine = currentLine.replace(/\x1B\[[0-9;]*m/g, '');
      
      if (plainCurrentLine.length + plainWord.length + (plainCurrentLine.length > 0 ? 1 : 0) <= maxWidth) {
        currentLine += (currentLine.length > 0 ? ' ' : '') + word;
      } else {
        if (currentLine.length > 0) {
          lines.push(currentLine);
        }
        currentLine = word;
      }
    }
    
    if (currentLine.length > 0) {
      lines.push(currentLine);
    }
    
    return lines.length > 0 ? lines : [''];
  }
  
  buildModalBorder(type, width) {
    if (type === 'top') {
      return colorize('╔' + '═'.repeat(width - 2) + '╗', 'red');
    } else {
      return colorize('╚' + '═'.repeat(width - 2) + '╝', 'red');
    }
  }
  
  buildModalLine(content, width) {
    const plainContent = content.replace(/\x1B\[[0-9;]*m/g, ''); // Strip ANSI for length calculation
    const padding = Math.max(0, width - 4 - plainContent.length); // 4 for borders and spacing
    return colorize('║', 'red') + ' ' + content + ' '.repeat(padding) + ' ' + colorize('║', 'red');
  }
  
  buildInputBoxLines(boxWidth) {
    const topBorder = '┌' + '─'.repeat(boxWidth - 2) + '┐';
    const bottomBorder = '└' + '─'.repeat(boxWidth - 2) + '┘';
    
    const placeholder = colorize(this.confirmationText, 'gray');
    const displayValue = this.inputValue || placeholder;
    const contentWidth = boxWidth - 2; // Account for borders only
    let content = ` ${displayValue}`;
    
    // Add cursor if we're in input mode
    if (!this.isDeleting && !this.deleteSuccess) {
      content += colorize('█', 'white');
    }
    
    // Calculate content length without ANSI codes
    const plainContent = content.replace(/\x1B\[[0-9;]*m/g, '');
    
    // Pad or truncate to fit exactly
    if (plainContent.length < contentWidth) {
      content += ' '.repeat(contentWidth - plainContent.length);
    } else if (plainContent.length > contentWidth) {
      // Truncate while preserving ANSI codes properly
      content = this.truncateWithAnsi(content, contentWidth);
    }
    
    const middleLine = '│' + content + '│';
    
    return [topBorder, middleLine, bottomBorder];
  }
  
  truncateWithAnsi(text, maxLength) {
    let result = '';
    let visibleLength = 0;
    let i = 0;
    
    while (i < text.length && visibleLength < maxLength) {
      if (text[i] === '\x1B') {
        // Copy entire ANSI sequence
        while (i < text.length && text[i] !== 'm') {
          result += text[i];
          i++;
        }
        if (i < text.length) {
          result += text[i]; // Add the 'm'
          i++;
        }
      } else {
        result += text[i];
        visibleLength++;
        i++;
      }
    }
    
    return result;
  }

  /**
   * Handle key press
   */
  handleKey(key, state, context) {
    if (this.isDeleting) {
      // Only allow Escape during deletion
      if (key === '\u001b') { // Escape
        this.close();
        return true;
      }
      return true; // Consume all other keys during deletion
    }
    
    if (this.deleteSuccess) {
      // Any key closes the success modal
      this.close();
      return true;
    }

    const keyStr = key.toString();
    
    switch (keyStr) {
      case '\u001b': // Escape
        this.close();
        return true;
        
      case '\r': // Enter
        if (this.inputValue === this.confirmationText) {
          this.performDelete();
        } else {
          this.errorMessage = `Must type "${this.confirmationText}".`;
          this.renderCurrentScreen();
        }
        return true;
        
      case '\u0016': // Ctrl+V (Note: Cmd+V on macOS works natively via terminal)
        this.handlePaste();
        return true;
        
      case '\u007f': // Backspace
      case '\b':
        if (this.inputValue.length > 0) {
          this.inputValue = this.inputValue.slice(0, -1);
          this.errorMessage = null;
          this.renderCurrentScreen();
        }
        return true;
        
      default:
        // Regular character input (including pasted content from Cmd+V on macOS)
        if (keyStr.length === 1 && keyStr >= ' ' && keyStr <= '~') {
          // Single character input
          this.inputValue += keyStr;
          this.errorMessage = null;
          this.renderCurrentScreen();
        } else if (keyStr.length > 1) {
          // Multi-character input (likely pasted content)
          // Validate that it's printable text
          const isPrintable = [...keyStr].every(char => char >= ' ' && char <= '~');
          if (isPrintable) {
            this.inputValue = keyStr; // Replace entire input with pasted content
            this.errorMessage = null;
            this.renderCurrentScreen();
          }
        }
        return true;
    }
  }

  /**
   * Handle paste operation (Ctrl+V)
   */
  async handlePaste() {
    try {
      const { spawn } = require('child_process');
      let pasteCommand, pasteArgs;
      
      if (process.platform === 'darwin') {
        pasteCommand = 'pbpaste';
        pasteArgs = [];
      } else {
        pasteCommand = 'xclip';
        pasteArgs = ['-selection', 'clipboard', '-o'];
      }
      
      const pasteProcess = spawn(pasteCommand, pasteArgs);
      let clipboardContent = '';
      
      pasteProcess.stdout.on('data', (data) => {
        clipboardContent += data.toString();
      });
      
      pasteProcess.on('close', (code) => {
        if (code === 0 && clipboardContent.trim()) {
          const cleanContent = clipboardContent.trim().replace(/\n/g, '');
          this.inputValue = cleanContent;
          this.errorMessage = null;
          this.renderCurrentScreen();
        }
      });
      
      pasteProcess.on('error', () => {
        // Paste failed, ignore silently
      });
      
    } catch (error) {
      // Paste not supported or failed, ignore silently
    }
  }

  /**
   * Perform the actual delete operation
   */
  async performDelete() {
    this.isDeleting = true;
    this.errorMessage = null;
    this.renderCurrentScreen();
    
    try {
      await this.onConfirm();
      this.deleteSuccess = true;
      this.isDeleting = false;
      this.renderCurrentScreen();
      
    } catch (error) {
      this.errorMessage = `Delete failed: ${error.message}`;
      this.isDeleting = false;
      this.renderCurrentScreen();
    }
  }

  /**
   * Re-render just this popup
   */
  renderCurrentScreen() {
    const { getPopupManager } = require('../popup-manager');
    const popupManager = getPopupManager();
    popupManager.render();
  }

  /**
   * Close the popup
   */
  close() {
    this.onCancel();
    if (this.onClose) {
      this.onClose();
    }
  }
}

module.exports = { DeleteKeysConfirmationPopup };