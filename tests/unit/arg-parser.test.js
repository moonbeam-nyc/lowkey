const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { 
  parseCommonArgs, 
  validateRequiredArgs, 
  validateTypes, 
  validateAwsRegion,
  createCustomArgHandler,
  handleRegionFallback
} = require('../../lib/cli/arg-parser');
const { config } = require('../../lib/core/config');

describe('arg-parser.js unit tests', () => {
  let originalEnv;
  let originalConsoleError;
  let originalProcessExit;
  let consoleErrors;

  beforeEach(() => {
    // Save original environment and console
    originalEnv = { ...process.env };
    originalConsoleError = console.error;
    originalProcessExit = process.exit;
    
    // Mock console.error to capture error messages
    consoleErrors = [];
    console.error = (msg) => consoleErrors.push(msg);
    
    // Mock process.exit to prevent test termination
    process.exit = (code) => { throw new Error(`Process exit with code ${code}`); };
  });

  afterEach(() => {
    // Restore original environment and console
    process.env = originalEnv;
    console.error = originalConsoleError;
    process.exit = originalProcessExit;
  });
  describe('parseCommonArgs', () => {
    test('parses basic help flag', () => {
      let helpCalled = false;
      const mockShowHelp = () => { helpCalled = true; };
      
      assert.throws(() => {
        parseCommonArgs(['--help'], {
          defaults: { command: 'test' },
          showHelp: mockShowHelp
        });
      }, /Process exit with code 0/);
      
      assert.strictEqual(helpCalled, true);
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
    test('creates handler that processes individual arguments', () => {
      const handler = createCustomArgHandler({
        '--input-type': { field: 'inputType', hasValue: true },
        '--verbose': { field: 'verbose', hasValue: false }
      });

      const options = {};
      
      // Test argument with value
      const result1 = handler('--input-type', ['--input-type', 'env'], 0, options);
      assert.strictEqual(result1, 2);
      assert.strictEqual(options.inputType, 'env');
      
      // Test flag argument
      const result2 = handler('--verbose', ['--verbose'], 0, options);
      assert.strictEqual(result2, 1);
      assert.strictEqual(options.verbose, true);
    });

    test('handles arguments without values', () => {
      const handler = createCustomArgHandler({
        '--flag': { field: 'flag', hasValue: false }
      });

      const options = {};
      const result = handler('--flag', ['--flag'], 0, options);
      
      assert.strictEqual(result, 1);
      assert.strictEqual(options.flag, true);
    });

    test('handles arguments with values', () => {
      const handler = createCustomArgHandler({
        '--value': { field: 'value', hasValue: true }
      });

      const options = {};
      const result = handler('--value', ['--value', 'test-value'], 0, options);
      
      assert.strictEqual(result, 2);
      assert.strictEqual(options.value, 'test-value');
    });

    test('ignores unrecognized arguments', () => {
      const handler = createCustomArgHandler({
        '--known': { field: 'known', hasValue: true }
      });

      const options = {};
      
      // Test known argument
      const result1 = handler('--known', ['--known', 'value'], 0, options);
      assert.strictEqual(result1, 2);
      assert.strictEqual(options.known, 'value');
      
      // Test unknown argument
      const result2 = handler('--unknown', ['--unknown', 'ignored'], 0, options);
      assert.strictEqual(result2, false);
      assert.strictEqual(options.unknown, undefined);
    });

    test('creates handler with correct function signature', () => {
      const argMap = {
        '--input-name': { field: 'inputName', hasValue: true },
        '--verbose': { field: 'verbose', hasValue: false }
      };
      const handler = createCustomArgHandler(argMap);
      const options = {};
      
      // Test argument with value
      const result1 = handler('--input-name', ['--input-name', 'secret-name'], 0, options);
      assert.strictEqual(result1, 2);
      assert.strictEqual(options.inputName, 'secret-name');
      
      // Test flag argument
      const result2 = handler('--verbose', ['--verbose'], 0, options);
      assert.strictEqual(result2, 1);
      assert.strictEqual(options.verbose, true);
      
      // Test unknown argument
      const result3 = handler('--unknown', ['--unknown'], 0, options);
      assert.strictEqual(result3, false);
    });

    test('handles missing value for argument that requires one', () => {
      const handler = createCustomArgHandler({
        '--input-name': { field: 'inputName', hasValue: true }
      });
      const options = {};
      
      const result = handler('--input-name', ['--input-name'], 0, options);
      assert.strictEqual(result, false);
    });

    test('handles custom value for flag arguments', () => {
      const handler = createCustomArgHandler({
        '--debug': { field: 'logLevel', hasValue: false, value: 'debug' }
      });
      const options = {};
      
      const result = handler('--debug', ['--debug'], 0, options);
      assert.strictEqual(result, 1);
      assert.strictEqual(options.logLevel, 'debug');
    });
  });

  describe('parseCommonArgs - error handling and edge cases', () => {
    test('handles unknown arguments with error', () => {
      assert.throws(() => {
        parseCommonArgs(['--unknown-arg']);
      }, /Process exit with code 1/);
      
      assert.ok(consoleErrors.some(err => err.includes('Unknown option \'--unknown-arg\'')));
    });

    test('handles help flag with showHelp callback', () => {
      let helpCalled = false;
      const mockShowHelp = () => { helpCalled = true; };
      
      assert.throws(() => {
        parseCommonArgs(['--help'], { showHelp: mockShowHelp });
      }, /Process exit with code 0/);
      
      assert.strictEqual(helpCalled, true);
    });

    test('handles -h flag with showHelp callback', () => {
      let helpCalled = false;
      const mockShowHelp = () => { helpCalled = true; };
      
      assert.throws(() => {
        parseCommonArgs(['-h'], { showHelp: mockShowHelp });
      }, /Process exit with code 0/);
      
      assert.strictEqual(helpCalled, true);
    });

    test('handles missing value for arguments', () => {
      assert.throws(() => {
        parseCommonArgs(['--region']);
      }, /Process exit with code 1/);
    });

    test('parses -y and --yes flags', () => {
      const result1 = parseCommonArgs(['-y']);
      assert.strictEqual(result1.autoYes, true);
      
      const result2 = parseCommonArgs(['--yes']);
      assert.strictEqual(result2.autoYes, true);
    });

    test('parses --show-values flag', () => {
      const result = parseCommonArgs(['--show-values']);
      assert.strictEqual(result.showValues, true);
    });

    test('parses --stage argument', () => {
      const result = parseCommonArgs(['--stage', 'production']);
      assert.strictEqual(result.stage, 'production');
    });

    test('handles custom args with return value', () => {
      const customHandler = (arg, args, i, options) => {
        if (arg === '--custom') {
          options.customValue = args[i + 1];
          return i + 2; // Skip next argument
        }
        return false;
      };
      
      const result = parseCommonArgs(['--custom', 'value'], { customArgs: customHandler });
      assert.strictEqual(result.customValue, 'value');
    });
  });

  describe('handleRegionFallback', () => {
    let originalAwsRegion, originalAwsDefaultRegion;
    
    beforeEach(() => {
      // Save original environment variables
      originalAwsRegion = process.env.AWS_REGION;
      originalAwsDefaultRegion = process.env.AWS_DEFAULT_REGION;
    });
    
    afterEach(() => {
      // Restore original environment variables
      if (originalAwsRegion !== undefined) {
        process.env.AWS_REGION = originalAwsRegion;
      } else {
        delete process.env.AWS_REGION;
      }
      if (originalAwsDefaultRegion !== undefined) {
        process.env.AWS_DEFAULT_REGION = originalAwsDefaultRegion;
      } else {
        delete process.env.AWS_DEFAULT_REGION;
      }
      
      // Reload config to pick up environment changes
      config.reloadEnvironment();
    });

    test('does not override existing region', () => {
      const options = { region: 'us-west-1' };
      handleRegionFallback(options);
      assert.strictEqual(options.region, 'us-west-1');
    });

    test('sets region from AWS_REGION environment variable', () => {
      delete process.env.AWS_DEFAULT_REGION;
      process.env.AWS_REGION = 'us-east-1';
      config.reloadEnvironment();
      const options = { region: null };
      handleRegionFallback(options);
      assert.strictEqual(options.region, 'us-east-1');
    });

    test('sets region from AWS_DEFAULT_REGION environment variable', () => {
      delete process.env.AWS_REGION;
      process.env.AWS_DEFAULT_REGION = 'us-west-2';
      config.reloadEnvironment();
      const options = { region: null };
      handleRegionFallback(options);
      assert.strictEqual(options.region, 'us-west-2');
    });

    test('prefers AWS_REGION over AWS_DEFAULT_REGION', () => {
      process.env.AWS_REGION = 'us-east-1';
      process.env.AWS_DEFAULT_REGION = 'us-west-2';
      config.reloadEnvironment();
      const options = { region: null };
      handleRegionFallback(options);
      assert.strictEqual(options.region, 'us-east-1');
    });

    test('leaves region null when no environment variables set', () => {
      delete process.env.AWS_REGION;
      delete process.env.AWS_DEFAULT_REGION;
      config.reloadEnvironment();
      const options = { region: null };
      handleRegionFallback(options);
      assert.strictEqual(options.region, null);
    });

    test('handles undefined region', () => {
      delete process.env.AWS_REGION;
      delete process.env.AWS_DEFAULT_REGION;
      config.reloadEnvironment();
      const options = { region: undefined };
      handleRegionFallback(options);
      assert.strictEqual(options.region, null);
    });
  });

  describe('validateRequiredArgs - error message validation', () => {
    test('shows correct error message for camelCase fields', () => {
      const options = {};
      validateRequiredArgs(options, ['inputType']);
      assert.ok(consoleErrors.some(err => err.includes('--input-type is required')));
    });

    test('shows correct error message for multiple word fields', () => {
      const options = {};
      validateRequiredArgs(options, ['outputFileName']);
      assert.ok(consoleErrors.some(err => err.includes('--output-file-name is required')));
    });
  });

  describe('validateTypes - error message validation', () => {
    test('shows error message with supported types', () => {
      const supportedTypes = ['env', 'json', 'aws-secrets-manager'];
      validateTypes('invalid', supportedTypes);
      assert.ok(consoleErrors.some(err => 
        err.includes('Unsupported type \'invalid\'') && 
        err.includes('env, json, aws-secrets-manager')
      ));
    });
  });

  describe('validateAwsRegion - error message validation', () => {
    test('shows helpful error message when region required but missing', () => {
      const options = { region: null };
      validateAwsRegion(options, true);
      assert.ok(consoleErrors.some(err => 
        err.includes('--region is required') && 
        err.includes('AWS_REGION')
      ));
    });

    test('defaults requiresRegion parameter to false', () => {
      const options = { region: null };
      const result = validateAwsRegion(options);
      assert.strictEqual(result, true);
    });
  });
});