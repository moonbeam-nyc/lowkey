const { test, describe } = require('node:test');
const assert = require('node:assert');
const { RenderUtils } = require('../../lib/interactive/renderer');

describe('RenderUtils unit tests', () => {
  describe('calculateAvailableHeight', () => {
    test('calculates available height with default terminal size', () => {
      const currentLines = 5;
      const availableHeight = RenderUtils.calculateAvailableHeight(currentLines);
      assert.ok(availableHeight > 0, 'should return positive height');
      assert.ok(availableHeight < 24, 'should be less than default terminal height');
    });

    test('respects minimum available height', () => {
      const currentLines = 100;
      const availableHeight = RenderUtils.calculateAvailableHeight(currentLines);
      assert.ok(availableHeight >= 3, 'should respect minimum height');
    });
  });

  describe('calculatePaginationWindow', () => {
    test('calculates pagination window for middle selection', () => {
      const result = RenderUtils.calculatePaginationWindow(5, 20, 10);
      assert.ok(result.startIndex >= 0, 'start index should be non-negative');
      assert.ok(result.endIndex <= 20, 'end index should not exceed total items');
      assert.ok(result.endIndex - result.startIndex <= 10, 'window size should respect available height');
    });

    test('handles selection at beginning', () => {
      const result = RenderUtils.calculatePaginationWindow(0, 20, 10);
      assert.strictEqual(result.startIndex, 0, 'should start at 0');
      assert.ok(result.endIndex <= 10, 'should limit window size');
    });

    test('handles selection at end', () => {
      const result = RenderUtils.calculatePaginationWindow(19, 20, 10);
      assert.ok(result.startIndex >= 10, 'should adjust start to show end');
      assert.strictEqual(result.endIndex, 20, 'should include last item');
    });

    test('handles empty list', () => {
      const result = RenderUtils.calculatePaginationWindow(0, 0, 10);
      assert.strictEqual(result.startIndex, 0);
      assert.strictEqual(result.endIndex, 0);
    });

    test('handles single item', () => {
      const result = RenderUtils.calculatePaginationWindow(0, 1, 10);
      assert.strictEqual(result.startIndex, 0);
      assert.strictEqual(result.endIndex, 1);
    });
  });

  describe('getPaginationIndicators', () => {
    test('shows both indicators when items are hidden', () => {
      const indicators = RenderUtils.getPaginationIndicators(5, 15, 20);
      assert.strictEqual(indicators.length, 2, 'should show both indicators');
      assert.ok(indicators[0].includes('previous'), 'should show previous indicator');
      assert.ok(indicators[1].includes('more'), 'should show next indicator');
    });

    test('shows only next indicator at start', () => {
      const indicators = RenderUtils.getPaginationIndicators(0, 10, 20);
      assert.strictEqual(indicators.length, 1, 'should show only one indicator');
      assert.ok(indicators[0].includes('more'), 'should show next indicator');
    });

    test('shows only previous indicator at end', () => {
      const indicators = RenderUtils.getPaginationIndicators(10, 20, 20);
      assert.strictEqual(indicators.length, 1, 'should show only one indicator');
      assert.ok(indicators[0].includes('previous'), 'should show previous indicator');
    });

    test('shows no indicators when all items visible', () => {
      const indicators = RenderUtils.getPaginationIndicators(0, 5, 5);
      assert.strictEqual(indicators.length, 0, 'should show no indicators');
    });
  });

  describe('formatBreadcrumbs', () => {
    test('formats single breadcrumb', () => {
      const result = RenderUtils.formatBreadcrumbs(['Home']);
      assert.ok(result.includes('Home'), 'should include breadcrumb text');
      assert.ok(result.includes('📍'), 'should include pin emoji');
    });

    test('formats multiple breadcrumbs with separator', () => {
      const result = RenderUtils.formatBreadcrumbs(['Home', 'Settings', 'Profile']);
      assert.ok(result.includes('Home'), 'should include first breadcrumb');
      assert.ok(result.includes('Settings'), 'should include middle breadcrumb');
      assert.ok(result.includes('Profile'), 'should include last breadcrumb');
      assert.ok(result.includes('>'), 'should include separator');
    });

    test('handles empty breadcrumbs', () => {
      const result = RenderUtils.formatBreadcrumbs([]);
      assert.strictEqual(result, '📍 ', 'should show just the pin');
    });
  });

  describe('formatSearchDisplay', () => {
    test('shows search query with cursor in search mode', () => {
      const result = RenderUtils.formatSearchDisplay('test', true);
      assert.ok(result.includes('test'), 'should include query');
      assert.ok(result.includes('█'), 'should include cursor');
      assert.ok(result.includes('Search:'), 'should include search label');
    });

    test('shows search query without cursor when not in search mode', () => {
      const result = RenderUtils.formatSearchDisplay('test', false);
      assert.ok(result.includes('test'), 'should include query');
      assert.ok(!result.includes('█'), 'should not include cursor');
    });

    test('returns null for empty query', () => {
      const result = RenderUtils.formatSearchDisplay('', false);
      assert.strictEqual(result, null, 'should return null for empty query');
    });
  });

  describe('formatInstructions', () => {
    test('formats basic instructions', () => {
      const result = RenderUtils.formatInstructions(false, false, false);
      assert.ok(result.includes('navigate'), 'should include navigation');
      assert.ok(result.includes('search'), 'should include search');
      assert.ok(result.includes('Ctrl+C'), 'should include exit');
    });

    test('includes back navigation when enabled', () => {
      const result = RenderUtils.formatInstructions(true, false, false);
      assert.ok(result.includes('Esc'), 'should include escape key');
      assert.ok(result.includes('back'), 'should mention going back');
    });

    test('includes edit option when enabled', () => {
      const result = RenderUtils.formatInstructions(false, true, false);
      assert.ok(result.includes('e to edit'), 'should include edit key');
      assert.ok(result.includes('Ctrl+V'), 'should include value toggle');
    });

    test('includes copy option when enabled', () => {
      const result = RenderUtils.formatInstructions(false, false, true);
      assert.ok(result.includes('Ctrl+S to copy'), 'should include copy shortcut');
    });

    test('includes all options when enabled', () => {
      const result = RenderUtils.formatInstructions(true, true, true);
      assert.ok(result.includes('Esc'), 'should include escape');
      assert.ok(result.includes('e to edit'), 'should include edit');
      assert.ok(result.includes('Ctrl+S to copy'), 'should include copy');
      assert.ok(result.includes('Ctrl+V'), 'should include value toggle');
    });
  });

  describe('truncateValue', () => {
    test('does not truncate short values', () => {
      const result = RenderUtils.truncateValue('short value');
      assert.strictEqual(result, 'short value');
    });

    test('truncates long values with ellipsis', () => {
      const longValue = 'a'.repeat(100);
      const result = RenderUtils.truncateValue(longValue);
      assert.ok(result.length < longValue.length, 'should be shorter');
      assert.ok(result.endsWith('...'), 'should end with ellipsis');
    });

    test('handles exact length values', () => {
      const exactValue = 'a'.repeat(60);
      const result = RenderUtils.truncateValue(exactValue);
      assert.strictEqual(result, exactValue, 'should not truncate at exact limit');
    });

    test('handles empty string', () => {
      const result = RenderUtils.truncateValue('');
      assert.strictEqual(result, '');
    });
  });
});