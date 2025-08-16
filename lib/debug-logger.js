const fs = require('fs');
const path = require('path');
const os = require('os');

class DebugLogger {
  constructor() {
    this.enabled = process.env.LOWKEY_DEBUG === 'true' || process.env.DEBUG === 'true';
    this.logFile = null;
    this.logStream = null;
    
    if (this.enabled) {
      this.initLogFile();
    }
  }

  initLogFile() {
    try {
      // Create logs directory in current working directory
      const logsDir = path.join(process.cwd(), 'lowkey-logs');
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }

      // Create timestamped log file
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const logFileName = `lowkey-debug-${timestamp}.log`;
      this.logFile = path.join(logsDir, logFileName);
      
      // Create write stream
      this.logStream = fs.createWriteStream(this.logFile, { flags: 'a' });
      
      // Write initial header
      this.writeHeader();
      
      // Create symlink to latest log
      const latestLink = path.join(logsDir, 'latest.log');
      try {
        if (fs.existsSync(latestLink)) {
          fs.unlinkSync(latestLink);
        }
        fs.symlinkSync(this.logFile, latestLink);
      } catch (e) {
        // Symlink might fail on some systems, that's ok
      }
      
      // Log the location only if not in interactive mode
      if (!this.isInteractiveMode()) {
        console.error(`Debug logging enabled: ${this.logFile}`);
      }
    } catch (error) {
      // Only log error if not in interactive mode
      if (!this.isInteractiveMode()) {
        console.error('Failed to initialize debug log:', error.message);
      }
      this.enabled = false;
    }
  }

  writeHeader() {
    if (!this.logStream) return;
    
    const header = [
      '='.repeat(80),
      `Lowkey Debug Log - ${new Date().toISOString()}`,
      `Node Version: ${process.version}`,
      `Platform: ${process.platform}`,
      `PID: ${process.pid}`,
      `Command: ${process.argv.join(' ')}`,
      '='.repeat(80),
      ''
    ].join('\n');
    
    this.logStream.write(header);
  }

  log(component, message, data = null) {
    if (!this.enabled || !this.logStream) return;
    
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      component,
      message,
      data: data ? this.sanitizeData(data) : undefined
    };
    
    const logLine = `[${timestamp}] [${component}] ${message}${data ? ' ' + JSON.stringify(data, null, 2) : ''}\n`;
    this.logStream.write(logLine);
  }

  error(component, message, error) {
    if (!this.enabled || !this.logStream) return;
    
    const timestamp = new Date().toISOString();
    const errorData = {
      message: error?.message,
      stack: error?.stack,
      code: error?.code,
      name: error?.name
    };
    
    const logLine = `[${timestamp}] [ERROR] [${component}] ${message}\n${JSON.stringify(errorData, null, 2)}\n`;
    this.logStream.write(logLine);
  }

  sanitizeData(data) {
    // Remove sensitive information from logged data
    const sanitized = { ...data };
    const sensitiveKeys = ['password', 'token', 'secret', 'key', 'credential'];
    
    for (const key in sanitized) {
      if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
        sanitized[key] = this.sanitizeData(sanitized[key]);
      }
    }
    
    return sanitized;
  }

  close() {
    if (this.logStream) {
      this.logStream.end();
      this.logStream = null;
    }
  }

  getLogPath() {
    return this.logFile;
  }

  isInteractiveMode() {
    // Check if we're in interactive mode by looking at process arguments
    const args = process.argv;
    return args.includes('interactive') || args.includes('x');
  }

  static getInstance() {
    if (!DebugLogger.instance) {
      DebugLogger.instance = new DebugLogger();
    }
    return DebugLogger.instance;
  }
}

// Export singleton instance
module.exports = DebugLogger.getInstance();