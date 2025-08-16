const { test, describe } = require('node:test');
const assert = require('node:assert');
const { KeyHandlerUtils } = require('../../lib/interactive/key-handlers');

describe('KeyHandlerUtils unit tests', () => {
  describe('isNavigationKey', () => {
    test('recognizes arrow keys', () => {
      assert.strictEqual(KeyHandlerUtils.isNavigationKey('\u001b[A'), true, 'up arrow');
      assert.strictEqual(KeyHandlerUtils.isNavigationKey('\u001b[B'), true, 'down arrow');
    });

    test('recognizes vim navigation keys', () => {
      assert.strictEqual(KeyHandlerUtils.isNavigationKey('k'), true, 'k for up');
      assert.strictEqual(KeyHandlerUtils.isNavigationKey('j'), true, 'j for down');
    });

    test('rejects non-navigation keys', () => {
      assert.strictEqual(KeyHandlerUtils.isNavigationKey('a'), false);
      assert.strictEqual(KeyHandlerUtils.isNavigationKey(' '), false);
      assert.strictEqual(KeyHandlerUtils.isNavigationKey('\r'), false);
    });
  });

  describe('isPageKey', () => {
    test('recognizes page navigation keys', () => {
      assert.strictEqual(KeyHandlerUtils.isPageKey('\u0015'), true, 'Ctrl+U');
      assert.strictEqual(KeyHandlerUtils.isPageKey('\u0002'), true, 'Ctrl+B');
      assert.strictEqual(KeyHandlerUtils.isPageKey('\u0004'), true, 'Ctrl+D');
      assert.strictEqual(KeyHandlerUtils.isPageKey('\u0006'), true, 'Ctrl+F');
    });

    test('rejects non-page keys', () => {
      assert.strictEqual(KeyHandlerUtils.isPageKey('k'), false);
      assert.strictEqual(KeyHandlerUtils.isPageKey(' '), false);
      assert.strictEqual(KeyHandlerUtils.isPageKey('\r'), false);
    });
  });

  describe('isEditingKey', () => {
    test('recognizes backspace keys', () => {
      assert.strictEqual(KeyHandlerUtils.isEditingKey('\u007f'), true, 'delete');
      assert.strictEqual(KeyHandlerUtils.isEditingKey('\b'), true, 'backspace');
    });

    test('recognizes search trigger', () => {
      assert.strictEqual(KeyHandlerUtils.isEditingKey('/'), true, 'forward slash');
    });

    test('rejects non-editing keys', () => {
      assert.strictEqual(KeyHandlerUtils.isEditingKey('a'), false);
      assert.strictEqual(KeyHandlerUtils.isEditingKey(' '), false);
      assert.strictEqual(KeyHandlerUtils.isEditingKey('\r'), false);
    });
  });

  describe('isPrintableKey', () => {
    test('recognizes printable characters', () => {
      assert.strictEqual(KeyHandlerUtils.isPrintableKey('a'), true);
      assert.strictEqual(KeyHandlerUtils.isPrintableKey('Z'), true);
      assert.strictEqual(KeyHandlerUtils.isPrintableKey('1'), true);
      assert.strictEqual(KeyHandlerUtils.isPrintableKey(' '), true);
      assert.strictEqual(KeyHandlerUtils.isPrintableKey('!'), true);
    });

    test('rejects non-printable characters', () => {
      assert.strictEqual(KeyHandlerUtils.isPrintableKey('\u001b'), false, 'escape');
      assert.strictEqual(KeyHandlerUtils.isPrintableKey('\r'), false, 'enter');
      assert.strictEqual(KeyHandlerUtils.isPrintableKey('\n'), false, 'newline');
      assert.strictEqual(KeyHandlerUtils.isPrintableKey('\t'), false, 'tab');
      assert.strictEqual(KeyHandlerUtils.isPrintableKey('\u0000'), false, 'null');
    });

    test('rejects multi-character sequences', () => {
      assert.strictEqual(KeyHandlerUtils.isPrintableKey('\u001b[A'), false);
      assert.strictEqual(KeyHandlerUtils.isPrintableKey('ab'), false);
    });
  });

  describe('handleUpKey', () => {
    test('decrements selected index', () => {
      const result = KeyHandlerUtils.handleUpKey({ selectedIndex: 5, filteredItems: new Array(10) });
      assert.strictEqual(result.selectedIndex, 4);
    });

    test('stops at zero', () => {
      const result = KeyHandlerUtils.handleUpKey({ selectedIndex: 0, filteredItems: new Array(10) });
      assert.strictEqual(result.selectedIndex, 0);
    });

    test('handles missing state properties', () => {
      const result = KeyHandlerUtils.handleUpKey({});
      assert.strictEqual(result.selectedIndex, 0);
    });
  });

  describe('handleDownKey', () => {
    test('increments selected index', () => {
      const result = KeyHandlerUtils.handleDownKey({ selectedIndex: 5, filteredItems: new Array(10) });
      assert.strictEqual(result.selectedIndex, 6);
    });

    test('stops at last item', () => {
      const result = KeyHandlerUtils.handleDownKey({ selectedIndex: 9, filteredItems: new Array(10) });
      assert.strictEqual(result.selectedIndex, 9);
    });

    test('handles missing state properties', () => {
      const result = KeyHandlerUtils.handleDownKey({});
      assert.strictEqual(result.selectedIndex, 0);
    });

    test('handles empty filtered items', () => {
      const result = KeyHandlerUtils.handleDownKey({ selectedIndex: 0, filteredItems: [] });
      assert.strictEqual(result.selectedIndex, 0);
    });
  });

  describe('search key handling', () => {
    test('handles search initiation', () => {
      const state = { searchMode: false, query: '' };
      assert.strictEqual(KeyHandlerUtils.isEditingKey('/'), true);
    });

    test('handles query building', () => {
      const state = { searchMode: true, query: 'test' };
      assert.strictEqual(KeyHandlerUtils.isPrintableKey('s'), true);
    });

    test('handles backspace in search', () => {
      assert.strictEqual(KeyHandlerUtils.isEditingKey('\u007f'), true);
    });
  });

  describe('factory functions existence', () => {
    test('createFuzzySearchKeyHandler exists', () => {
      assert.strictEqual(typeof KeyHandlerUtils.createFuzzySearchKeyHandler, 'function');
    });

    test('createInteractiveBrowserKeyHandler exists', () => {
      assert.strictEqual(typeof KeyHandlerUtils.createInteractiveBrowserKeyHandler, 'function');
    });
  });

  describe('Esc key behavior with search queries', () => {
    test('clears search query when focused on list', () => {
      // Test that Esc clears query and shows all items when not in search mode
      const mockTerminal = {
        items: ['item1', 'item2', 'item3'],
        setState: () => {}
      };
      
      let capturedStateUpdate = null;
      mockTerminal.setState = (state) => {
        capturedStateUpdate = state;
      };

      const handler = KeyHandlerUtils.createFuzzySearchKeyHandler({
        filteredItemsKey: 'filteredItems',
        terminal: mockTerminal
      });

      const state = {
        query: 'search',
        selectedIndex: 0,
        searchMode: false,
        filteredItems: ['item1'] // Currently filtered
      };

      // Simulate Esc key press
      const handled = handler('\u001b', state);

      assert.strictEqual(handled, true, 'Esc key should be handled');
      assert.strictEqual(capturedStateUpdate.query, '', 'Query should be cleared');
      assert.strictEqual(capturedStateUpdate.selectedIndex, 0, 'Should reset to first item');
      assert.deepStrictEqual(capturedStateUpdate.filteredItems, ['item1', 'item2', 'item3'], 'Should show all items');
    });
  });
});