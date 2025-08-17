// Central export for all screen classes
const { Screen } = require('./base-screen');
const { FuzzySearchScreen } = require('./fuzzy-search-screen');
const { KeyBrowserScreenV2 } = require('./key-browser-screen-v2');
const { TypeSelectionScreenV2 } = require('./type-selection-screen-v2');
const { SecretSelectionScreenV2 } = require('./secret-selection-screen-v2');
const { CopyWizardScreenV2 } = require('./copy-wizard-screen-v2');
const AwsProfilePopup = require('./aws-profile-screen');

module.exports = {
  Screen,
  FuzzySearchScreen,
  KeyBrowserScreen: KeyBrowserScreenV2, // Use v2 component-based version
  TypeSelectionScreen: TypeSelectionScreenV2, // Use v2 component-based version
  SecretSelectionScreen: SecretSelectionScreenV2, // Use v2 component-based version
  CopyWizardScreen: CopyWizardScreenV2, // Use v2 component-based version
  AwsProfilePopup
};