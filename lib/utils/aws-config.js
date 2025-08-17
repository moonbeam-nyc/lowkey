const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Parse AWS configuration files to extract available profiles
 * @returns {Array<string>} Array of available AWS profile names
 */
function getAvailableProfiles() {
  const profiles = new Set();
  
  // Check ~/.aws/credentials
  const credentialsPath = path.join(os.homedir(), '.aws', 'credentials');
  if (fs.existsSync(credentialsPath)) {
    try {
      const content = fs.readFileSync(credentialsPath, 'utf8');
      const profileMatches = content.match(/^\[([^\]]+)\]/gm);
      if (profileMatches) {
        profileMatches.forEach(match => {
          const profile = match.slice(1, -1); // Remove brackets
          if (profile !== 'default') {
            profiles.add(profile);
          }
        });
      }
    } catch (err) {
      // Ignore read errors
    }
  }
  
  // Check ~/.aws/config
  const configPath = path.join(os.homedir(), '.aws', 'config');
  if (fs.existsSync(configPath)) {
    try {
      const content = fs.readFileSync(configPath, 'utf8');
      const profileMatches = content.match(/^\[(?:profile\s+)?([^\]]+)\]/gm);
      if (profileMatches) {
        profileMatches.forEach(match => {
          let profile = match.slice(1, -1); // Remove brackets
          // Remove 'profile ' prefix if present
          if (profile.startsWith('profile ')) {
            profile = profile.substring(8);
          }
          if (profile !== 'default') {
            profiles.add(profile);
          }
        });
      }
    } catch (err) {
      // Ignore read errors
    }
  }
  
  // Always include 'default' profile at the beginning
  const profileList = ['default', ...Array.from(profiles).sort()];
  return profileList;
}

/**
 * Get the current AWS profile from environment
 * @returns {string} Current AWS profile name
 */
function getCurrentProfile() {
  return process.env.AWS_PROFILE || 'default';
}

module.exports = {
  getAvailableProfiles,
  getCurrentProfile
};