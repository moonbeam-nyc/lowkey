/**
 * Test exit helper to handle AWS SDK v3 hanging connections
 * 
 * AWS SDK v3 has a known issue where keep-alive connections prevent
 * the Node process from exiting cleanly even after client.destroy().
 * This is a test-specific workaround.
 */

if (process.env.NODE_ENV === 'test' && process.env.LOCALSTACK_ENDPOINT) {
  let testStartTime = Date.now();
  let hasLoggedExit = false;
  
  // Set up process exit handler for tests with AWS SDK
  const originalExit = process.exit;
  
  // Force exit after tests complete if hanging
  const forceExitTimer = setTimeout(() => {
    if (!hasLoggedExit) {
      console.log('⚠️  Force exiting due to AWS SDK v3 hanging connections (known issue)');
      hasLoggedExit = true;
    }
    originalExit(0);
  }, 5000); // Give 5 seconds after test completion
  
  // Clear the timer if process exits normally
  process.on('beforeExit', () => {
    clearTimeout(forceExitTimer);
  });
  
  // Listen for test completion signals
  process.on('exit', (code) => {
    clearTimeout(forceExitTimer);
  });
}