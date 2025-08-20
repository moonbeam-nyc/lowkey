/**
 * Delete Confirmation Popup
 * 
 * A modal popup that prompts the user to confirm deletion by typing the secret name.
 * Supports pasting with Ctrl+V and canceling with Esc.
 */

const { BasePopup } = require('../popup-manager');
const { ModalComponents } = require('../ui-components');
const { colorize } = require('../../core/colors');

class DeleteConfirmationPopup extends BasePopup {
  constructor(options) {
    super(options);
    
    this.secretName = options.secretName || '';
    this.secretType = options.secretType || '';
    this.onConfirm = options.onConfirm || (() => {});
    this.onCancel = options.onCancel || (() => {});
    
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
      console.error('Error rendering delete confirmation popup:', error);
      return 'Error rendering popup';
    }
  }

  /**
   * Generate modal content as a string (for PopupManager overlay)
   */
  renderModalContent() {
    const lines = [];
    
    // Calculate modal dimensions
    const minContentWidth = Math.max(
      this.secretName.length + 20,  // Secret name display
      50,  // Instructions text
      30   // Minimum usable width
    );
    const modalWidth = Math.min(Math.max(60, minContentWidth), 100); // Cap at 100 chars
    const modalHeight = this.deleteSuccess ? 6 : 12; // Success modal is much more compact
    
    if (this.deleteSuccess) {
      // Success message modal - much more compact (7 lines total)
      // Calculate width based on the longest line: "✓ {secretName} deleted successfully"
      const successMessage = `✓ ${this.secretName} deleted successfully`;
      const successWidth = Math.min(
        Math.max(
          40,                           // Minimum width
          successMessage.length + 4,    // Message + padding
          'Press any key to continue'.length + 4  // Instructions + padding
        ),
        process.stdout.columns - 10    // Max width: terminal width minus padding
      );
      
      // Truncate the secret name if it's too long for the modal
      let displayName = this.secretName;
      const maxNameLength = successWidth - 25; // Account for "✓ " and " deleted successfully"
      if (displayName.length > maxNameLength) {
        displayName = displayName.substring(0, maxNameLength - 3) + '...';
      }
      
      lines.push(this.buildModalBorder('top', successWidth));                    // Line 1
      lines.push(this.buildModalLine(colorize('Secret Deleted', 'green'), successWidth));  // Line 2
      lines.push(this.buildModalLine('', successWidth));                         // Line 3
      lines.push(this.buildModalLine(`${colorize('✓', 'green')} ${displayName} deleted successfully`, successWidth)); // Line 4
      lines.push(this.buildModalLine('', successWidth));                         // Line 5
      lines.push(this.buildModalLine(colorize('Press any key to continue', 'gray'), successWidth)); // Line 6
      lines.push(this.buildModalBorder('bottom', successWidth));                 // Line 7
      
    } else if (this.isDeleting) {
      // Deleting message modal
      lines.push(this.buildModalBorder('top', modalWidth));
      lines.push(this.buildModalLine(colorize('Delete Secret', 'red'), modalWidth));
      lines.push(this.buildModalLine('', modalWidth));
      lines.push(this.buildModalLine(colorize('Deleting secret...', 'yellow'), modalWidth));
      lines.push(this.buildModalLine('', modalWidth));
      lines.push(this.buildModalLine('', modalWidth));
      lines.push(this.buildModalLine('', modalWidth));
      lines.push(this.buildModalBorder('bottom', modalWidth));
      
    } else {
      // Confirmation prompt modal
      lines.push(this.buildModalBorder('top', modalWidth));
      lines.push(this.buildModalLine(colorize('Delete Secret', 'red'), modalWidth));
      lines.push(this.buildModalLine('', modalWidth));
      lines.push(this.buildModalLine(`You are about to delete: ${colorize(this.secretName, 'cyan')}`, modalWidth));
      lines.push(this.buildModalLine(`Type: ${colorize(this.secretType, 'gray')}`, modalWidth));
      lines.push(this.buildModalLine('', modalWidth));
      lines.push(this.buildModalLine(colorize('Type the secret name to confirm deletion:', 'yellow'), modalWidth));
      lines.push(this.buildModalLine('', modalWidth));
      
      // Input box - each line separately
      const inputBoxLines = this.buildInputBoxLines(modalWidth - 4);
      inputBoxLines.forEach(line => {
        lines.push(this.buildModalLine(line, modalWidth));
      });
      
      lines.push(this.buildModalLine('', modalWidth));
      
      // Instructions (show Cmd+V on macOS, Ctrl+V on other platforms)
      const canDelete = this.inputValue === this.secretName;
      const pasteKey = process.platform === 'darwin' ? 'Cmd+V' : 'Ctrl+V';
      const instructions = [
        colorize(pasteKey, 'white') + ' paste',
        colorize('Enter', canDelete ? 'white' : 'gray') + (canDelete ? ' delete' : ' disabled'),
        colorize('Esc', 'white') + ' cancel'
      ].join(', ');
      lines.push(this.buildModalLine(colorize(instructions, 'gray'), modalWidth));
      
      // Error message
      if (this.errorMessage) {
        lines.push(this.buildModalLine(colorize('Error: Secret name does not match.', 'red'), modalWidth));
      } else {
        lines.push(this.buildModalLine('', modalWidth));
      }
      
      lines.push(this.buildModalBorder('bottom', modalWidth));
    }
    
    return lines.join('\n');
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
    
    const displayValue = this.inputValue || colorize(this.secretName, 'gray');
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
        if (this.inputValue === this.secretName) {
          this.performDelete();
        } else {
          this.errorMessage = 'Secret name does not match.';
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

module.exports = { DeleteConfirmationPopup };