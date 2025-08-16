const { test } = require('node:test');
const assert = require('node:assert');

// Mock the KeyBrowserScreen class to test the updateSecretDataSubset method
class MockKeyBrowserScreen {
  constructor(secretData) {
    this.secretData = secretData;
    this.originalKeysToEdit = null;
  }

  // Copy the updateSecretDataSubset method from KeyBrowserScreen
  updateSecretDataSubset(editedData) {
    const keysToEdit = this.originalKeysToEdit;
    
    if (!keysToEdit) {
      // If no subset was specified, replace all data (full edit)
      this.secretData = { ...editedData };
      return;
    }
    
    // Subset editing: surgical updates only
    
    // 1. Remove keys that were in the editing scope but are now missing (deletions)
    keysToEdit.forEach(key => {
      if (!(key in editedData)) {
        delete this.secretData[key];
      }
    });
    
    // 2. Add/update keys from the edited data
    Object.keys(editedData).forEach(key => {
      this.secretData[key] = editedData[key];
    });
  }

  // Helper method to simulate the editing process
  simulateEdit(keysToEdit, editedData) {
    this.originalKeysToEdit = keysToEdit;
    this.updateSecretDataSubset(editedData);
  }
}

test('Subset Editing Tests', async (t) => {
  await t.test('Full edit (no subset) - replaces all data', () => {
    const screen = new MockKeyBrowserScreen({
      A: '1',
      B: '2', 
      C: '3'
    });

    // Simulate full edit (no keysToEdit specified)
    screen.simulateEdit(null, {
      X: 'new',
      Y: 'data'
    });

    assert.deepStrictEqual(screen.secretData, {
      X: 'new',
      Y: 'data'
    });
  });

  await t.test('Subset edit - preserves untouched keys', () => {
    const screen = new MockKeyBrowserScreen({
      A: '1',
      B: '2',
      C: '3',
      D: '4'
    });

    // Edit only keys A and C
    screen.simulateEdit(['A', 'C'], {
      A: 'updated',
      C: 'changed'
    });

    assert.deepStrictEqual(screen.secretData, {
      A: 'updated',
      B: '2',  // preserved (not in subset)
      C: 'changed',
      D: '4'   // preserved (not in subset)
    });
  });

  await t.test('Subset edit - handles deletions correctly', () => {
    const screen = new MockKeyBrowserScreen({
      A: '1',
      B: '2',
      C: '3',
      D: '4'
    });

    // Edit keys A, B, C but only return A and B (C gets deleted)
    screen.simulateEdit(['A', 'B', 'C'], {
      A: 'updated',
      B: 'modified'
      // C is missing = deleted
    });

    assert.deepStrictEqual(screen.secretData, {
      A: 'updated',
      B: 'modified',
      // C was deleted (was in subset, now missing)
      D: '4'  // preserved (not in subset)
    });
  });

  await t.test('Subset edit - allows adding new keys', () => {
    const screen = new MockKeyBrowserScreen({
      A: '1',
      B: '2',
      C: '3'
    });

    // Edit only key A, but also add new keys
    screen.simulateEdit(['A'], {
      A: 'updated',
      X: 'new key',
      Y: 'another new key'
    });

    assert.deepStrictEqual(screen.secretData, {
      A: 'updated',
      B: '2',        // preserved
      C: '3',        // preserved
      X: 'new key',  // added
      Y: 'another new key'  // added
    });
  });

  await t.test('Subset edit - mixed operations (add, update, delete)', () => {
    const screen = new MockKeyBrowserScreen({
      A: '1',
      B: '2',
      C: '3',
      D: '4',
      E: '5'
    });

    // Edit keys A, C, D
    screen.simulateEdit(['A', 'C', 'D'], {
      A: 'updated',   // update existing
      C: 'changed',   // update existing 
      // D is missing = deleted
      F: 'new',       // add new key
      G: 'another'    // add another new key
    });

    assert.deepStrictEqual(screen.secretData, {
      A: 'updated',  // updated (was in subset)
      B: '2',        // preserved (not in subset)
      C: 'changed',  // updated (was in subset)
      // D deleted (was in subset, missing from result)
      E: '5',        // preserved (not in subset)
      F: 'new',      // added (new key)
      G: 'another'   // added (new key)
    });
  });

  await t.test('Subset edit - delete all keys in subset', () => {
    const screen = new MockKeyBrowserScreen({
      A: '1',
      B: '2',
      C: '3',
      D: '4'
    });

    // Edit keys A and C, but delete both
    screen.simulateEdit(['A', 'C'], {
      // Empty result = both A and C deleted
    });

    assert.deepStrictEqual(screen.secretData, {
      // A deleted (was in subset, missing from result)
      B: '2',  // preserved
      // C deleted (was in subset, missing from result)
      D: '4'   // preserved
    });
  });

  await t.test('Subset edit - empty subset has no effect on preservation', () => {
    const screen = new MockKeyBrowserScreen({
      A: '1',
      B: '2',
      C: '3'
    });

    // Edit empty subset, add new keys
    screen.simulateEdit([], {
      X: 'new',
      Y: 'keys'
    });

    assert.deepStrictEqual(screen.secretData, {
      A: '1',   // preserved
      B: '2',   // preserved
      C: '3',   // preserved
      X: 'new', // added
      Y: 'keys' // added
    });
  });

  await t.test('Subset edit - single key operations', () => {
    const screen = new MockKeyBrowserScreen({
      A: '1',
      B: '2',
      C: '3'
    });

    // Edit only key B, update it
    screen.simulateEdit(['B'], {
      B: 'totally changed'
    });

    assert.deepStrictEqual(screen.secretData, {
      A: '1',               // preserved
      B: 'totally changed', // updated
      C: '3'                // preserved
    });
  });

  await t.test('Subset edit - single key deletion', () => {
    const screen = new MockKeyBrowserScreen({
      A: '1',
      B: '2',
      C: '3'
    });

    // Edit only key B, delete it
    screen.simulateEdit(['B'], {
      // B missing = deleted
    });

    assert.deepStrictEqual(screen.secretData, {
      A: '1', // preserved
      // B deleted
      C: '3'  // preserved
    });
  });

  await t.test('Subset edit - handles complex data types', () => {
    const screen = new MockKeyBrowserScreen({
      simple: 'value',
      number: '123',
      special: 'with spaces and symbols!@#',
      unicode: '🔑 secret key 🔐'
    });

    // Edit special and unicode keys
    screen.simulateEdit(['special', 'unicode'], {
      special: 'updated with new symbols $%^',
      unicode: '🚀 rocket secret 🌟',
      newComplex: 'json-like: {"nested": "value"}'
    });

    assert.deepStrictEqual(screen.secretData, {
      simple: 'value',                              // preserved
      number: '123',                                // preserved  
      special: 'updated with new symbols $%^',     // updated
      unicode: '🚀 rocket secret 🌟',              // updated
      newComplex: 'json-like: {"nested": "value"}' // added
    });
  });
});