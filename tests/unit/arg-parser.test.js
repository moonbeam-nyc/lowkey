const { test, describe } = require('node:test');
const assert = require('node:assert');
const { 
  parseCommonArgs, 
  validateRequiredArgs, 
  validateTypes, 
  validateAwsRegion,
  createCustomArgHandler 
} = require('../../lib/arg-parser');

describe('arg-parser.js unit tests', () => {
  describe('parseCommonArgs', () => {
    test('parses basic help flag', () => {
      const result = parseCommonArgs(['--help'], {
        defaults: { command: 'test' },
        showHelp: () => console.log('help')
      });

      assert.strictEqual(result.showHelp, true);
    });

    test('parses region parameter', () => {
      const result = parseCommonArgs(['--region', 'us-west-2'], {
        defaults: { command: 'test' }
      });

      assert.strictEqual(result.region, 'us-west-2');
    });

    test('parses path parameter', () => {
      const result = parseCommonArgs(['--path', '/some/path'], {
        defaults: { command: 'test' }
      });

      assert.strictEqual(result.path, '/some/path');
    });

    test('applies default values', () => {
      const result = parseCommonArgs([], {
        defaults: { 
          command: 'test',
          defaultValue: 'default'
        }
      });

      assert.strictEqual(result.command, 'test');
      assert.strictEqual(result.defaultValue, 'default');
    });

    test('handles custom argument handlers', () => {
      const customHandler = createCustomArgHandler({
        '--custom-arg': { field: 'customField', hasValue: true }
      });

      const result = parseCommonArgs(['--custom-arg', 'custom-value'], {
        defaults: { command: 'test' },
        customArgs: customHandler
      });

      assert.strictEqual(result.customField, 'custom-value');
    });
  });

  describe('validateRequiredArgs', () => {
    test('returns true when all required args are present', () => {
      const options = {
        inputType: 'env',
        inputName: 'file.env',
        outputType: 'json'
      };

      const result = validateRequiredArgs(options, ['inputType', 'inputName', 'outputType']);
      assert.strictEqual(result, true);
    });

    test('returns false when required args are missing', () => {
      const options = {
        inputType: 'env',
        inputName: 'file.env'
        // Missing outputType
      };

      const result = validateRequiredArgs(options, ['inputType', 'inputName', 'outputType']);
      assert.strictEqual(result, false);
    });

    test('returns false when required arg is empty string', () => {
      const options = {
        inputType: '',
        inputName: 'file.env',
        outputType: 'json'
      };

      const result = validateRequiredArgs(options, ['inputType', 'inputName', 'outputType']);
      assert.strictEqual(result, false);
    });

    test('returns false when required arg is null or undefined', () => {
      const options1 = {
        inputType: null,
        inputName: 'file.env',
        outputType: 'json'
      };

      const options2 = {
        inputType: undefined,
        inputName: 'file.env',
        outputType: 'json'
      };

      assert.strictEqual(validateRequiredArgs(options1, ['inputType', 'inputName', 'outputType']), false);
      assert.strictEqual(validateRequiredArgs(options2, ['inputType', 'inputName', 'outputType']), false);
    });
  });

  describe('validateTypes', () => {
    test('returns true for supported types', () => {
      const supportedTypes = ['env', 'json', 'aws-secrets-manager'];

      assert.strictEqual(validateTypes('env', supportedTypes), true);
      assert.strictEqual(validateTypes('json', supportedTypes), true);
      assert.strictEqual(validateTypes('aws-secrets-manager', supportedTypes), true);
    });

    test('returns false for unsupported types', () => {
      const supportedTypes = ['env', 'json', 'aws-secrets-manager'];

      assert.strictEqual(validateTypes('invalid-type', supportedTypes), false);
      assert.strictEqual(validateTypes('yaml', supportedTypes), false);
      assert.strictEqual(validateTypes('', supportedTypes), false);
      assert.strictEqual(validateTypes(null, supportedTypes), false);
    });
  });

  describe('validateAwsRegion', () => {
    test('returns true when region is not required', () => {
      const options = { region: undefined };
      
      const result = validateAwsRegion(options, false);
      assert.strictEqual(result, true);
    });

    test('returns true when region is required and provided', () => {
      const options = { region: 'us-east-1' };
      
      const result = validateAwsRegion(options, true);
      assert.strictEqual(result, true);
    });

    test('returns false when region is required but missing', () => {
      const options = { region: undefined };
      
      const result = validateAwsRegion(options, true);
      assert.strictEqual(result, false);
    });

    test('returns false when region is empty string', () => {
      const options = { region: '' };
      
      const result = validateAwsRegion(options, true);
      assert.strictEqual(result, false);
    });

    test('accepts valid AWS region formats', () => {
      const validRegions = ['us-east-1', 'us-west-2', 'eu-west-1', 'ap-southeast-2'];
      
      validRegions.forEach(region => {
        const options = { region };
        const result = validateAwsRegion(options, true);
        assert.strictEqual(result, true, `Should accept region: ${region}`);
      });
    });
  });

  describe('createCustomArgHandler', () => {
    test('creates handler that processes custom arguments', () => {
      const handler = createCustomArgHandler({
        '--input-type': { field: 'inputType', hasValue: true },
        '--output-type': { field: 'outputType', hasValue: true },
        '--verbose': { field: 'verbose', hasValue: false }
      });

      const options = {};
      const args = ['--input-type', 'env', '--output-type', 'json', '--verbose'];
      
      handler(args, options);

      assert.strictEqual(options.inputType, 'env');
      assert.strictEqual(options.outputType, 'json');
      assert.strictEqual(options.verbose, true);
    });

    test('handles arguments without values', () => {
      const handler = createCustomArgHandler({
        '--flag': { field: 'flag', hasValue: false }
      });

      const options = {};
      const args = ['--flag'];
      
      handler(args, options);

      assert.strictEqual(options.flag, true);
    });

    test('handles arguments with values', () => {
      const handler = createCustomArgHandler({
        '--value': { field: 'value', hasValue: true }
      });

      const options = {};
      const args = ['--value', 'test-value'];
      
      handler(args, options);

      assert.strictEqual(options.value, 'test-value');
    });

    test('ignores unrecognized arguments', () => {
      const handler = createCustomArgHandler({
        '--known': { field: 'known', hasValue: true }
      });

      const options = {};
      const args = ['--known', 'value', '--unknown', 'ignored'];
      
      handler(args, options);

      assert.strictEqual(options.known, 'value');
      assert.strictEqual(options.unknown, undefined);
    });
  });
});