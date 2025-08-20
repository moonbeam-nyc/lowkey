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

/**
 * Get the current AWS region from multiple sources in order of priority:
 * 1. Environment variables (AWS_REGION, AWS_DEFAULT_REGION)
 * 2. AWS config files (~/.aws/config) for current profile
 * 3. null if none found
 * @returns {string|null} Current AWS region or null
 */
function getCurrentRegion() {
  // Check environment variables first (highest priority)
  const envRegion = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
  if (envRegion) {
    return envRegion;
  }

  // Check AWS config files for current profile
  const currentProfile = getCurrentProfile();
  return getRegionFromConfig(currentProfile);
}

/**
 * Get region for a specific profile from AWS config files
 * @param {string} profileName - AWS profile name
 * @returns {string|null} Region for the profile or null
 */
function getRegionFromConfig(profileName = 'default') {
  const configPath = path.join(os.homedir(), '.aws', 'config');
  
  if (!fs.existsSync(configPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(configPath, 'utf8');
    
    // Look for the profile section
    const profileSectionName = profileName === 'default' ? 'default' : `profile ${profileName}`;
    const sectionRegex = new RegExp(`^\\[${profileSectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]`, 'gm');
    
    const match = sectionRegex.exec(content);
    if (!match) {
      return null;
    }

    // Find the content from this section until the next section or end of file
    const sectionStart = match.index + match[0].length;
    const nextSectionMatch = content.slice(sectionStart).match(/^\[/gm);
    const sectionEnd = nextSectionMatch ? sectionStart + content.slice(sectionStart).indexOf(nextSectionMatch[0]) : content.length;
    
    const sectionContent = content.slice(sectionStart, sectionEnd);
    
    // Look for region setting
    const regionMatch = sectionContent.match(/^region\s*=\s*(.+)$/gm);
    if (regionMatch) {
      return regionMatch[0].split('=')[1].trim();
    }

    return null;
  } catch (err) {
    // Ignore read errors
    return null;
  }
}

module.exports = {
  getAvailableProfiles,
  getCurrentProfile,
  getCurrentRegion,
  getRegionFromConfig
};