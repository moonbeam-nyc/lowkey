const { BasePopup } = require('../popup-manager');
const { ModalComponents, ListComponents, NavigationComponents } = require('../ui-components');
const { getAvailableProfiles, getCurrentProfile } = require('../../utils/aws-config');
const { AWS } = require('../../core/constants');
const { colorize } = require('../../core/colors');
const config = require('../../core/config');
const { KeyHandlerSet, KeyDetector } = require('../key-handler-set');

/**
 * AWS Profile and Region Selection Popup
 * 
 * Provides a centered popup for selecting AWS profile and region
 * Triggered by Ctrl+A from any list screen
 */
class AwsProfilePopup extends BasePopup {
  /**
   * Helper to wrap a line with ANSI reset codes to prevent color bleeding
   */
  wrapWithReset(line) {
    return `\x1B[0m${line}\x1B[0m`;
  }
  constructor(options = {}) {
    super(options);
    
    const debugLogger = require('../../core/debug-logger');
    
    try {
      debugLogger.log('AwsProfilePopup constructor called', options);
      
      this.currentProfile = getCurrentProfile();
      this.currentRegion = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
      this.availableProfiles = getAvailableProfiles();
      
      debugLogger.log('AWS profile popup initialized', {
        currentProfile: this.currentProfile,
        currentRegion: this.currentRegion,
        availableProfiles: this.availableProfiles
      });
      
      this.state = {
        mode: 'compact', // 'compact', 'profile-list', 'region-list'
        selectedFieldIndex: 0, // 0 = profile, 1 = region
        selectedProfileIndex: Math.max(0, this.availableProfiles.indexOf(this.currentProfile)),
        selectedRegionIndex: Math.max(0, AWS.REGIONS.indexOf(this.currentRegion)),
        query: '',
        searchMode: false // Whether user is in search/filter mode
      };
      
      this.onConfigChange = options.onConfigChange || (() => {});
      
      debugLogger.log('AwsProfilePopup constructor completed', { state: this.state });
      
    } catch (error) {
      debugLogger.log('Error in AwsProfilePopup constructor', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  handleKey(key) {
    const { mode, selectedFieldIndex, selectedProfileIndex, selectedRegionIndex, query } = this.state;
    const debugLogger = require('../../core/debug-logger');
    
    debugLogger.log('AwsProfilePopup.handleKey called', {
      key: key,
      mode: mode,
      state: this.state
    });
    
    if (mode === 'compact') {
      const result = this.handleCompactMode(key);
      debugLogger.log('AwsProfilePopup.handleKey compact mode result', { result });
      return result;
    } else if (mode === 'profile-list') {
      const result = this.handleProfileListMode(key);
      debugLogger.log('AwsProfilePopup.handleKey profile-list mode result', { result });
      return result;
    } else if (mode === 'region-list') {
      const result = this.handleRegionListMode(key);
      debugLogger.log('AwsProfilePopup.handleKey region-list mode result', { result });
      return result;
    }
    
    debugLogger.log('AwsProfilePopup.handleKey no mode matched, returning false');
    return false;
  }

  handleCompactMode(key) {
    const { selectedFieldIndex } = this.state;
    const debugLogger = require('../../core/debug-logger');
    
    debugLogger.log('handleCompactMode called', {
      key: KeyDetector.normalize(key),
      selectedFieldIndex: selectedFieldIndex
    });
    
    // Create key handler set for compact mode
    const keyHandlers = new KeyHandlerSet()
      .onEscape(() => {
        debugLogger.log('Compact mode: Escape key pressed, closing popup to return to parent screen');
        this.close();
        return true;
      })
      .onKey('\u0003', () => { // Ctrl+C
        debugLogger.log('Compact mode: Ctrl+C pressed, closing popup');
        this.close();
        return true;
      })
      .onEnter(() => {
        debugLogger.log('Compact mode: Enter key pressed', { selectedFieldIndex });
        if (selectedFieldIndex === 0) {
          this.setState({ mode: 'profile-list', query: '', searchMode: false });
        } else {
          this.setState({ mode: 'region-list', query: '', searchMode: false });
        }
        return true;
      })
      .onDownArrow(() => {
        const newIndex = selectedFieldIndex === 0 ? 1 : 0;
        debugLogger.log('Compact mode: Down navigation', { 
          from: selectedFieldIndex, 
          to: newIndex 
        });
        this.setState({ selectedFieldIndex: newIndex });
        return true;
      })
      .onUpArrow(() => {
        const newIndex = selectedFieldIndex === 0 ? 1 : 0;
        debugLogger.log('Compact mode: Up navigation', { 
          from: selectedFieldIndex, 
          to: newIndex 
        });
        this.setState({ selectedFieldIndex: newIndex });
        return true;
      })
      .onKey('j', () => {
        const newIndex = selectedFieldIndex === 0 ? 1 : 0;
        debugLogger.log('Compact mode: j key pressed (down navigation)', { 
          from: selectedFieldIndex, 
          to: newIndex 
        });
        this.setState({ selectedFieldIndex: newIndex });
        return true;
      })
      .onKey('k', () => {
        const newIndex = selectedFieldIndex === 0 ? 1 : 0;
        debugLogger.log('Compact mode: k key pressed (up navigation)', { 
          from: selectedFieldIndex, 
          to: newIndex 
        });
        this.setState({ selectedFieldIndex: newIndex });
        return true;
      });

    // Process the key through the handler set
    const handled = keyHandlers.process(key, { 
      state: this.state, 
      setState: this.setState.bind(this) 
    });
    
    if (!handled) {
      debugLogger.log('Compact mode: Key not handled', { 
        key: KeyDetector.normalize(key) 
      });
    }
    
    return handled;
  }

  handleProfileListMode(key) {
    const { selectedProfileIndex, query, searchMode } = this.state;
    const debugLogger = require('../../core/debug-logger');
    
    debugLogger.log('handleProfileListMode called', {
      key: KeyDetector.normalize(key),
      currentQuery: query,
      selectedProfileIndex: selectedProfileIndex,
      searchMode: searchMode
    });
    
    // Create key handler set for profile list mode
    const keyHandlers = new KeyHandlerSet()
      .onEscape(() => {
        if (searchMode) {
          // Exit search mode
          debugLogger.log('Profile list mode: Exiting search mode');
          this.setState({ searchMode: false });
          return true;
        } else {
          // Return to compact mode
          debugLogger.log('Profile list mode: Escape key pressed, returning to compact mode');
          this.setState({ mode: 'compact', query: '', searchMode: false });
          return true;
        }
      })
      .onEnter(() => {
        if (searchMode) {
          // Exit search mode when Enter is pressed during filtering
          debugLogger.log('Profile list mode: Enter key pressed in search mode, exiting search mode');
          this.setState({ searchMode: false });
          return true;
        } else {
          // Select profile when not in search mode
          const selectedProfile = this.getFilteredProfiles()[selectedProfileIndex];
          debugLogger.log('Profile list mode: Enter key pressed', { selectedProfile });
          if (selectedProfile) {
            this.applyConfiguration(selectedProfile, this.currentRegion);
            this.close();
          }
          return true;
        }
      })
      .onDownArrow(() => {
        const filteredProfiles = this.getFilteredProfiles();
        const newDownIndex = Math.min(selectedProfileIndex + 1, filteredProfiles.length - 1);
        debugLogger.log('Profile list mode: Down navigation triggered', { 
          from: selectedProfileIndex, 
          to: newDownIndex,
          filteredCount: filteredProfiles.length 
        });
        this.setState({ 
          selectedProfileIndex: newDownIndex
        });
        return true;
      })
      .onUpArrow(() => {
        const newUpIndex = Math.max(selectedProfileIndex - 1, 0);
        debugLogger.log('Profile list mode: Up navigation triggered', { 
          from: selectedProfileIndex, 
          to: newUpIndex 
        });
        this.setState({ 
          selectedProfileIndex: newUpIndex
        });
        return true;
      })
      .onSearchTrigger(() => {
        debugLogger.log('Profile list mode: Search trigger pressed, entering search mode');
        this.setState({ searchMode: true });
        return true;
      })
      .onKey('j', () => {
        if (!searchMode) {
          // j acts as down navigation when not in search mode
          const filteredProfiles = this.getFilteredProfiles();
          const newDownIndex = Math.min(selectedProfileIndex + 1, filteredProfiles.length - 1);
          debugLogger.log('Profile list mode: j key navigation (down)', { 
            from: selectedProfileIndex, 
            to: newDownIndex,
            filteredCount: filteredProfiles.length 
          });
          this.setState({ selectedProfileIndex: newDownIndex });
          return true;
        }
        return false; // Let printable handler process it
      })
      .onKey('k', () => {
        if (!searchMode) {
          // k acts as up navigation when not in search mode
          const newUpIndex = Math.max(selectedProfileIndex - 1, 0);
          debugLogger.log('Profile list mode: k key navigation (up)', { 
            from: selectedProfileIndex, 
            to: newUpIndex 
          });
          this.setState({ selectedProfileIndex: newUpIndex });
          return true;
        }
        return false; // Let printable handler process it
      })
      .onBackspace(() => {
        if (searchMode && query.length > 0) {
          const newQuery = query.slice(0, -1);
          debugLogger.log('Profile list mode: Removing character from query', {
            oldQuery: query,
            newQuery: newQuery,
            removedChar: query.slice(-1)
          });
          this.setState({ 
            query: newQuery,
            selectedProfileIndex: 0 
          });
          return true;
        } else {
          debugLogger.log('Profile list mode: Backspace ignored - not in search mode or query empty');
          return false;
        }
      })
      .onPrintable((key) => {
        if (searchMode) {
          const char = KeyDetector.normalize(key);
          const newQuery = query + char;
          debugLogger.log('Profile list mode: Adding character to query', {
            oldQuery: query,
            newQuery: newQuery,
            addedChar: char
          });
          this.setState({ 
            query: newQuery,
            selectedProfileIndex: 0 
          });
          return true;
        } else {
          debugLogger.log('Profile list mode: Printable key ignored - not in search mode');
          return false;
        }
      });

    // Process the key through the handler set
    const handled = keyHandlers.process(key, { 
      state: this.state, 
      setState: this.setState.bind(this) 
    });
    
    if (!handled) {
      debugLogger.log('Profile list mode: Key not handled', { 
        key: KeyDetector.normalize(key) 
      });
    }
    
    return handled;
  }

  handleRegionListMode(key) {
    const { selectedRegionIndex, query, searchMode } = this.state;
    const debugLogger = require('../../core/debug-logger');
    
    debugLogger.log('handleRegionListMode called', {
      key: KeyDetector.normalize(key),
      currentQuery: query,
      selectedRegionIndex: selectedRegionIndex,
      searchMode: searchMode
    });
    
    // Create key handler set for region list mode
    const keyHandlers = new KeyHandlerSet()
      .onEscape(() => {
        if (searchMode) {
          // Exit search mode
          debugLogger.log('Region list mode: Exiting search mode');
          this.setState({ searchMode: false });
          return true;
        } else {
          // Return to compact mode
          debugLogger.log('Region list mode: Escape key pressed, returning to compact mode');
          this.setState({ mode: 'compact', query: '', searchMode: false });
          return true;
        }
      })
      .onEnter(() => {
        if (searchMode) {
          // Exit search mode when Enter is pressed during filtering
          debugLogger.log('Region list mode: Enter key pressed in search mode, exiting search mode');
          this.setState({ searchMode: false });
          return true;
        } else {
          // Select region when not in search mode
          const selectedRegion = this.getFilteredRegions()[selectedRegionIndex];
          debugLogger.log('Region list mode: Enter key pressed', { selectedRegion });
          if (selectedRegion) {
            this.applyConfiguration(this.currentProfile, selectedRegion);
            this.close();
          }
          return true;
        }
      })
      .onDownArrow(() => {
        const filteredRegions = this.getFilteredRegions();
        const newDownIndex = Math.min(selectedRegionIndex + 1, filteredRegions.length - 1);
        debugLogger.log('Region list mode: Down navigation', { 
          from: selectedRegionIndex, 
          to: newDownIndex,
          filteredCount: filteredRegions.length 
        });
        this.setState({ 
          selectedRegionIndex: newDownIndex
        });
        return true;
      })
      .onUpArrow(() => {
        const newUpIndex = Math.max(selectedRegionIndex - 1, 0);
        debugLogger.log('Region list mode: Up navigation', { 
          from: selectedRegionIndex, 
          to: newUpIndex 
        });
        this.setState({ 
          selectedRegionIndex: newUpIndex
        });
        return true;
      })
      .onSearchTrigger(() => {
        debugLogger.log('Region list mode: Search trigger pressed, entering search mode');
        this.setState({ searchMode: true });
        return true;
      })
      .onKey('j', () => {
        if (!searchMode) {
          // j acts as down navigation when not in search mode
          const filteredRegions = this.getFilteredRegions();
          const newDownIndex = Math.min(selectedRegionIndex + 1, filteredRegions.length - 1);
          debugLogger.log('Region list mode: j key navigation (down)', { 
            from: selectedRegionIndex, 
            to: newDownIndex,
            filteredCount: filteredRegions.length 
          });
          this.setState({ selectedRegionIndex: newDownIndex });
          return true;
        }
        return false; // Let printable handler process it
      })
      .onKey('k', () => {
        if (!searchMode) {
          // k acts as up navigation when not in search mode
          const newUpIndex = Math.max(selectedRegionIndex - 1, 0);
          debugLogger.log('Region list mode: k key navigation (up)', { 
            from: selectedRegionIndex, 
            to: newUpIndex 
          });
          this.setState({ selectedRegionIndex: newUpIndex });
          return true;
        }
        return false; // Let printable handler process it
      })
      .onBackspace(() => {
        if (searchMode && query.length > 0) {
          const newQuery = query.slice(0, -1);
          debugLogger.log('Region list mode: Removing character from query', {
            oldQuery: query,
            newQuery: newQuery,
            removedChar: query.slice(-1)
          });
          this.setState({ 
            query: newQuery,
            selectedRegionIndex: 0 
          });
          return true;
        } else {
          debugLogger.log('Region list mode: Backspace ignored - not in search mode or query empty');
          return false;
        }
      })
      .onPrintable((key) => {
        if (searchMode) {
          const char = KeyDetector.normalize(key);
          const newQuery = query + char;
          debugLogger.log('Region list mode: Adding character to query', {
            oldQuery: query,
            newQuery: newQuery,
            addedChar: char
          });
          this.setState({ 
            query: newQuery,
            selectedRegionIndex: 0 
          });
          return true;
        } else {
          debugLogger.log('Region list mode: Printable key ignored - not in search mode');
          return false;
        }
      });

    // Process the key through the handler set
    const handled = keyHandlers.process(key, { 
      state: this.state, 
      setState: this.setState.bind(this) 
    });
    
    if (!handled) {
      debugLogger.log('Region list mode: Key not handled', { 
        key: KeyDetector.normalize(key) 
      });
    }
    
    return handled;
  }

  getFilteredProfiles() {
    const { query } = this.state;
    if (!query) return this.availableProfiles;
    
    const lowerQuery = query.toLowerCase();
    return this.availableProfiles.filter(profile => 
      profile.toLowerCase().includes(lowerQuery)
    );
  }

  getFilteredRegions() {
    const { query } = this.state;
    if (!query) return AWS.REGIONS;
    
    const lowerQuery = query.toLowerCase();
    return AWS.REGIONS.filter(region => 
      region.toLowerCase().includes(lowerQuery)
    );
  }

  setState(newState) {
    this.state = { ...this.state, ...newState };
  }

  handleNavigation(direction) {
    const { mode } = this.state;
    
    if (mode === 'profile') {
      const newIndex = Math.max(0, Math.min(this.availableProfiles.length - 1, 
        this.state.selectedProfileIndex + direction));
      this.setState({ selectedProfileIndex: newIndex });
    } else {
      const newIndex = Math.max(0, Math.min(AWS.REGIONS.length - 1, 
        this.state.selectedRegionIndex + direction));
      this.setState({ selectedRegionIndex: newIndex });
    }
    
    return true;
  }

  handleEnter() {
    const { selectedProfileIndex, selectedRegionIndex } = this.state;
    const selectedProfile = this.availableProfiles[selectedProfileIndex];
    const selectedRegion = AWS.REGIONS[selectedRegionIndex];
    
    // Apply the configuration changes
    this.applyConfiguration(selectedProfile, selectedRegion);
    
    // Close the popup
    this.close();
    return true;
  }

  applyConfiguration(profile, region) {
    const debugLogger = require('../../core/debug-logger');
    
    debugLogger.log('applyConfiguration called', { profile, region });
    
    // Update our cached values
    this.currentProfile = profile;
    this.currentRegion = region;
    
    // Update environment variables to persist the selection
    if (profile) {
      process.env.AWS_PROFILE = profile;
    }
    if (region) {
      process.env.AWS_REGION = region;
    }
    
    debugLogger.log('Applied AWS configuration', { 
      profile: this.currentProfile, 
      region: this.currentRegion 
    });
    
    // Refresh the global header to reflect new AWS configuration
    const { TerminalManager } = require('../terminal-manager');
    const terminalManager = TerminalManager.getInstance();
    terminalManager.refreshHeaderInfo();
    
    // Notify parent of configuration change
    this.onConfigChange({ profile, region });
  }

  render() {
    const { mode, selectedFieldIndex, selectedProfileIndex, selectedRegionIndex, query } = this.state;
    
    if (mode === 'compact') {
      return this.renderCompactMode();
    } else if (mode === 'profile-list') {
      return this.renderProfileListMode();
    } else if (mode === 'region-list') {
      return this.renderRegionListMode();
    }
  }

  renderCompactMode() {
    const { selectedFieldIndex } = this.state;
    const output = [];
    const boxWidth = 40;  // Total box width including borders
    const contentWidth = boxWidth - 2;  // Internal content width (excluding borders)
    
    // Top border
    output.push(this.wrapWithReset('┌' + '─'.repeat(contentWidth) + '┐'));
    
    // Title
    const title = colorize('AWS Configuration', 'bold');
    const titleStripped = title.replace(/\x1B\[[0-9;]*m/g, '');
    const titlePadding = Math.max(0, contentWidth - titleStripped.length - 2);  // -2 for space after border
    output.push(this.wrapWithReset(`│ ${title}${' '.repeat(titlePadding)} │`));
    output.push(this.wrapWithReset('├' + '─'.repeat(contentWidth) + '┤'));
    
    // Profile field
    const profileSelected = selectedFieldIndex === 0;
    const profilePrefix = profileSelected ? '▶ ' : '  ';
    const profileLine = `${profilePrefix}Profile: ${colorize(this.currentProfile, 'cyan')}`;
    const profileStripped = profileLine.replace(/\x1B\[[0-9;]*m/g, '');
    const profilePadding = Math.max(0, contentWidth - profileStripped.length - 2);  // -2 for space after border
    output.push(this.wrapWithReset(`│ ${profileLine}${' '.repeat(profilePadding)} │`));
    
    // Region field
    const regionSelected = selectedFieldIndex === 1;
    const regionPrefix = regionSelected ? '▶ ' : '  ';
    const regionLine = `${regionPrefix}Region:  ${colorize(this.currentRegion, 'cyan')}`;
    const regionStripped = regionLine.replace(/\x1B\[[0-9;]*m/g, '');
    const regionPadding = Math.max(0, contentWidth - regionStripped.length - 2);  // -2 for space after border
    output.push(this.wrapWithReset(`│ ${regionLine}${' '.repeat(regionPadding)} │`));
    
    output.push(this.wrapWithReset('├' + '─'.repeat(contentWidth) + '┤'));
    
    // Instructions
    const instructions = colorize('Enter: Edit | Esc: Cancel', 'gray');
    const instrStripped = instructions.replace(/\x1B\[[0-9;]*m/g, '');
    const instrPadding = Math.max(0, contentWidth - instrStripped.length - 2);  // -2 for space after border
    output.push(this.wrapWithReset(`│ ${instructions}${' '.repeat(instrPadding)} │`));
    
    // Bottom border
    output.push(this.wrapWithReset('└' + '─'.repeat(contentWidth) + '┘'));
    
    return output.join('\n');
  }

  renderProfileListMode() {
    const { selectedProfileIndex, query, searchMode } = this.state;
    const filteredProfiles = this.getFilteredProfiles();
    const output = [];
    
    // Calculate width based on ALL profiles (not just filtered) and instruction text
    const instructionText = '/ to search | Enter: Select | Esc: Back';
    const maxProfileLength = Math.max(...this.availableProfiles.map(p => p.length));
    const minWidth = Math.max(instructionText.length + 4, 30); // Ensure instructions fit
    const boxWidth = Math.max(minWidth, Math.min(60, maxProfileLength + 12));
    const contentWidth = boxWidth - 2;  // Internal content width (excluding borders)
    
    // Top border
    output.push(this.wrapWithReset('┌' + '─'.repeat(contentWidth) + '┐'));
    
    // Title
    const title = `Select AWS Profile`;
    const titlePadding = Math.max(0, contentWidth - title.length - 2);  // -2 for spaces after border
    output.push(this.wrapWithReset(`│ ${colorize(title, 'bold')}${' '.repeat(titlePadding)} │`));
    
    // Search box if there's a query or in search mode
    if (query || searchMode) {
      output.push(this.wrapWithReset('├' + '─'.repeat(contentWidth) + '┤'));
      const cursor = searchMode ? colorize('█', 'white') : '';
      const searchLine = `🔍 ${query}${cursor}`;
      const searchStripped = searchLine.replace(/\x1B\[[0-9;]*m/g, '');
      const searchPadding = Math.max(0, contentWidth - searchStripped.length - 2);
      output.push(this.wrapWithReset(`│ ${searchLine}${' '.repeat(searchPadding)} │`));
    }
    
    output.push(this.wrapWithReset('├' + '─'.repeat(contentWidth) + '┤'));
    
    // Profile list (limit to 8 items)
    const visibleProfiles = filteredProfiles.slice(0, 8);
    visibleProfiles.forEach((profile, index) => {
      const isSelected = index === selectedProfileIndex;
      const isCurrent = profile === this.currentProfile;
      const prefix = isSelected ? '▶ ' : '  ';
      const marker = isCurrent ? ' (current)' : '';
      const profileText = `${prefix}${profile}${marker}`;
      const finalText = isSelected ? colorize(profileText, 'cyan') : profileText;
      
      const strippedText = finalText.replace(/\x1B\[[0-9;]*m/g, '');
      const padding = Math.max(0, contentWidth - strippedText.length - 2);
      output.push(this.wrapWithReset(`│ ${finalText}${' '.repeat(padding)} │`));
    });
    
    // Show more indicator if needed
    if (filteredProfiles.length > 8) {
      const moreText = colorize(`  ... ${filteredProfiles.length - 8} more`, 'gray');
      const moreStripped = moreText.replace(/\x1B\[[0-9;]*m/g, '');
      const morePadding = Math.max(0, contentWidth - moreStripped.length - 2);
      output.push(this.wrapWithReset(`│ ${moreText}${' '.repeat(morePadding)} │`));
    }
    
    output.push(this.wrapWithReset('├' + '─'.repeat(contentWidth) + '┤'));
    
    // Instructions
    const instructions = colorize(instructionText, 'gray');
    const instrStripped = instructionText; // Use the plain text for length calculation
    const instrPadding = Math.max(0, contentWidth - instrStripped.length - 2);
    output.push(this.wrapWithReset(`│ ${instructions}${' '.repeat(instrPadding)} │`));
    
    // Bottom border
    output.push(this.wrapWithReset('└' + '─'.repeat(contentWidth) + '┘'));
    
    return output.join('\n');
  }

  renderRegionListMode() {
    const { selectedRegionIndex, query, searchMode } = this.state;
    const filteredRegions = this.getFilteredRegions();
    const output = [];
    
    // Calculate width based on ALL regions (not just filtered) and instruction text
    const instructionText = '/ to search | Enter: Select | Esc: Back';
    const maxRegionLength = Math.max(...AWS.REGIONS.map(r => r.length));
    const minWidth = Math.max(instructionText.length + 4, 30); // Ensure instructions fit
    const boxWidth = Math.max(minWidth, Math.min(60, maxRegionLength + 12));
    const contentWidth = boxWidth - 2;  // Internal content width (excluding borders)
    
    // Top border
    output.push(this.wrapWithReset('┌' + '─'.repeat(contentWidth) + '┐'));
    
    // Title
    const title = `Select AWS Region`;
    const titlePadding = Math.max(0, contentWidth - title.length - 2);  // -2 for spaces after border
    output.push(this.wrapWithReset(`│ ${colorize(title, 'bold')}${' '.repeat(titlePadding)} │`));
    
    // Search box if there's a query or in search mode
    if (query || searchMode) {
      output.push(this.wrapWithReset('├' + '─'.repeat(contentWidth) + '┤'));
      const cursor = searchMode ? colorize('█', 'white') : '';
      const searchLine = `🔍 ${query}${cursor}`;
      const searchStripped = searchLine.replace(/\x1B\[[0-9;]*m/g, '');
      const searchPadding = Math.max(0, contentWidth - searchStripped.length - 2);
      output.push(this.wrapWithReset(`│ ${searchLine}${' '.repeat(searchPadding)} │`));
    }
    
    output.push(this.wrapWithReset('├' + '─'.repeat(contentWidth) + '┤'));
    
    // Region list (limit to 8 items)
    const visibleRegions = filteredRegions.slice(0, 8);
    visibleRegions.forEach((region, index) => {
      const isSelected = index === selectedRegionIndex;
      const isCurrent = region === this.currentRegion;
      const prefix = isSelected ? '▶ ' : '  ';
      const marker = isCurrent ? ' (current)' : '';
      const regionText = `${prefix}${region}${marker}`;
      const finalText = isSelected ? colorize(regionText, 'cyan') : regionText;
      
      const strippedText = finalText.replace(/\x1B\[[0-9;]*m/g, '');
      const padding = Math.max(0, contentWidth - strippedText.length - 2);
      output.push(this.wrapWithReset(`│ ${finalText}${' '.repeat(padding)} │`));
    });
    
    // Show more indicator if needed
    if (filteredRegions.length > 8) {
      const moreText = colorize(`  ... ${filteredRegions.length - 8} more`, 'gray');
      const moreStripped = moreText.replace(/\x1B\[[0-9;]*m/g, '');
      const morePadding = Math.max(0, contentWidth - moreStripped.length - 2);
      output.push(this.wrapWithReset(`│ ${moreText}${' '.repeat(morePadding)} │`));
    }
    
    output.push(this.wrapWithReset('├' + '─'.repeat(contentWidth) + '┤'));
    
    // Instructions
    const instructions = colorize(instructionText, 'gray');
    const instrStripped = instructionText; // Use the plain text for length calculation
    const instrPadding = Math.max(0, contentWidth - instrStripped.length - 2);
    output.push(this.wrapWithReset(`│ ${instructions}${' '.repeat(instrPadding)} │`));
    
    // Bottom border
    output.push(this.wrapWithReset('└' + '─'.repeat(contentWidth) + '┘'));
    
    return output.join('\n');
  }
}

module.exports = AwsProfilePopup;