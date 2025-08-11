// Central export for all screen classes
const { Screen } = require('./base-screen');
const { FuzzySearchScreen } = require('./fuzzy-search-screen');
const { KeyBrowserScreen } = require('./key-browser-screen');
const { TypeSelectionScreen } = require('./type-selection-screen');
const { SecretSelectionScreen } = require('./secret-selection-screen');

module.exports = {
  Screen,
  FuzzySearchScreen,
  KeyBrowserScreen,
  TypeSelectionScreen,
  SecretSelectionScreen
};