const { test, describe } = require('node:test');
const assert = require('node:assert');
const { parseSecretData, generateEnvContent, generateJsonContent } = require('../../lib/utils/secrets');

describe('secrets.js unit tests', () => {
  describe('parseSecretData', () => {
    test('parses valid flat JSON object', () => {
      const input = '{"key1": "value1", "key2": "value2", "key3": ""}';
      const result = parseSecretData(input);
      
      assert.deepStrictEqual(result, {
        key1: 'value1',
        key2: 'value2',
        key3: ''
      });
    });

    test('rejects non-JSON strings', () => {
      assert.throws(() => {
        parseSecretData('not json');
      }, /not valid JSON/);
    });

    test('rejects JSON arrays', () => {
      assert.throws(() => {
        parseSecretData('["array", "values"]');
      }, /must be a JSON object/);
    });

    test('rejects null values', () => {
      assert.throws(() => {
        parseSecretData('null');
      }, /must be a JSON object/);
    });

    test('rejects primitive values', () => {
      assert.throws(() => {
        parseSecretData('"just a string"');
      }, /must be a JSON object/);
      
      assert.throws(() => {
        parseSecretData('42');
      }, /must be a JSON object/);
    });

    test('rejects nested objects', () => {
      const nestedJson = '{"flat": "ok", "nested": {"should": "fail"}}';
      
      assert.throws(() => {
        parseSecretData(nestedJson);
      }, /flat object.*nested/);
    });

    test('rejects arrays as values', () => {
      const arrayJson = '{"flat": "ok", "array_val": ["should", "fail"]}';
      
      assert.throws(() => {
        parseSecretData(arrayJson);
      }, /flat object.*nested/);
    });

    test('accepts various primitive types as values', () => {
      const input = JSON.stringify({
        string_val: 'string',
        number_val: 42,
        boolean_val: true,
        null_val: null,
        empty_string: ''
      });
      
      const result = parseSecretData(input);
      
      assert.strictEqual(result.string_val, 'string');
      assert.strictEqual(result.number_val, 42);
      assert.strictEqual(result.boolean_val, true);
      assert.strictEqual(result.null_val, null);
      assert.strictEqual(result.empty_string, '');
    });
  });

  describe('generateEnvContent', () => {
    test('generates basic env format', () => {
      const input = {
        DATABASE_URL: 'postgresql://localhost:5432/test',
        API_KEY: 'secret123',
        DEBUG: 'true'
      };
      
      const result = generateEnvContent(input);
      const lines = result.split('\n');
      
      assert.ok(lines.includes('DATABASE_URL="postgresql://localhost:5432/test"'));
      assert.ok(lines.includes('API_KEY="secret123"'));
      assert.ok(lines.includes('DEBUG="true"'));
    });

    test('quotes values with spaces', () => {
      const input = {
        SECRET_TOKEN: 'value with spaces',
        SIMPLE_VALUE: 'nospaces'
      };
      
      const result = generateEnvContent(input);
      
      assert.ok(result.includes('SECRET_TOKEN="value with spaces"'));
      assert.ok(result.includes('SIMPLE_VALUE="nospaces"'));
    });

    test('handles special characters', () => {
      const input = {
        SPECIAL_CHARS: '!@#$%^&*()',
        QUOTES: 'has "quotes" inside',
        NEWLINES: 'has\nnewlines'
      };
      
      const result = generateEnvContent(input);
      
      assert.ok(result.includes('SPECIAL_CHARS="!@#$%^&*()"'));
      assert.ok(result.includes('QUOTES="has \\"quotes\\" inside"'));
      assert.ok(result.includes('NEWLINES="has\\nnewlines"'));
    });

    test('handles empty values', () => {
      const input = {
        EMPTY_STRING: '',
        NULL_VALUE: null,
        UNDEFINED_VALUE: undefined
      };
      
      const result = generateEnvContent(input);
      
      assert.ok(result.includes('EMPTY_STRING='));
      assert.ok(result.includes('NULL_VALUE='));
      assert.ok(result.includes('UNDEFINED_VALUE='));
    });

    test('rejects invalid environment variable keys', () => {
      const invalidKeys = [
        '123STARTS_WITH_NUMBER',
        'INVALID SPACES',
        'INVALID-DASHES',
        'INVALID.DOTS',
        ''
      ];
      
      invalidKeys.forEach(key => {
        const input = { [key]: 'value' };
        
        assert.throws(() => {
          generateEnvContent(input);
        }, /Invalid environment variable key/, `Should reject key: ${key}`);
      });
    });

    test('accepts valid environment variable keys', () => {
      const validInput = {
        VALID_KEY: 'value',
        _UNDERSCORE_START: 'value',
        MiXeD_CaSe_123: 'value',
        A: 'single letter',
        _: 'single underscore'
      };
      
      // Should not throw
      const result = generateEnvContent(validInput);
      assert.ok(typeof result === 'string');
    });
  });

  describe('generateJsonContent', () => {
    test('generates formatted JSON', () => {
      const input = {
        key1: 'value1',
        key2: 'value2',
        key3: ''
      };
      
      const result = generateJsonContent(input);
      const parsed = JSON.parse(result);
      
      assert.deepStrictEqual(parsed, input);
    });

    test('preserves different value types', () => {
      const input = {
        string_val: 'string',
        number_val: 42,
        boolean_val: true,
        null_val: null,
        empty_string: ''
      };
      
      const result = generateJsonContent(input);
      const parsed = JSON.parse(result);
      
      assert.deepStrictEqual(parsed, input);
    });

    test('produces properly formatted JSON', () => {
      const input = { key: 'value' };
      const result = generateJsonContent(input);
      
      // Should be formatted with indentation
      assert.ok(result.includes('\n'));
      assert.ok(result.includes('  '));
    });
  });
});