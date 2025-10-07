// tests/test-setup.js
const path = require('path');
const fs = require('fs').promises;

const TEST_DB_PATH = path.join(process.cwd(), 'test-data');

async function cleanupTestData() {
  try {
    // Check if directory exists before trying to delete
    try {
      await fs.access(TEST_DB_PATH);
    } catch {
      // Directory doesn't exist, nothing to clean up
      return;
    }
    
    // Remove test directory
    await fs.rm(TEST_DB_PATH, { recursive: true, force: true });
    
    // Small delay to ensure file system operations complete
    await new Promise(resolve => setTimeout(resolve, 100));
  } catch (error) {
    // Ignore cleanup errors
    console.log('Cleanup warning:', error.message);
  }
}

async function ensureTestDir() {
  await fs.mkdir(TEST_DB_PATH, { recursive: true });
}

module.exports = {
  TEST_DB_PATH,
  cleanupTestData,
  ensureTestDir
};