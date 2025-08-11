const fs = require('fs/promises');
const path = require('path');
const os = require('os');

/**
 * Helper for managing temporary files in tests
 */
class TempFileManager {
  constructor() {
    this.tempFiles = [];
    this.tempDirs = [];
  }

  /**
   * Create a temporary file with given content
   */
  async createTempFile(content, extension = '.tmp') {
    const tempDir = os.tmpdir();
    const fileName = `lowkey-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}${extension}`;
    const filePath = path.join(tempDir, fileName);
    
    await fs.writeFile(filePath, content);
    this.tempFiles.push(filePath);
    
    return filePath;
  }

  /**
   * Create a temporary directory
   */
  async createTempDir() {
    const tempDir = os.tmpdir();
    const dirName = `lowkey-test-dir-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const dirPath = path.join(tempDir, dirName);
    
    await fs.mkdir(dirPath, { recursive: true });
    this.tempDirs.push(dirPath);
    
    return dirPath;
  }

  /**
   * Copy fixture to temporary location
   */
  async copyFixture(fixturePath) {
    const fixtureContent = await fs.readFile(fixturePath, 'utf8');
    const extension = path.extname(fixturePath);
    return await this.createTempFile(fixtureContent, extension);
  }

  /**
   * Clean up all temporary files and directories
   */
  async cleanup() {
    // Remove temporary files
    for (const filePath of this.tempFiles) {
      try {
        await fs.unlink(filePath);
      } catch (error) {
        // Ignore errors if file doesn't exist
        if (error.code !== 'ENOENT') {
          console.warn(`Failed to cleanup temp file ${filePath}:`, error.message);
        }
      }
    }

    // Remove temporary directories
    for (const dirPath of this.tempDirs) {
      try {
        await fs.rm(dirPath, { recursive: true });
      } catch (error) {
        // Ignore errors if directory doesn't exist
        if (error.code !== 'ENOENT') {
          console.warn(`Failed to cleanup temp dir ${dirPath}:`, error.message);
        }
      }
    }

    this.tempFiles = [];
    this.tempDirs = [];
  }

  /**
   * Read content of a temporary file
   */
  async readTempFile(filePath) {
    return await fs.readFile(filePath, 'utf8');
  }

  /**
   * Check if a file exists
   */
  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

module.exports = { TempFileManager };