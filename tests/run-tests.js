// tests/run-tests.js
const { cleanupTestData } = require('./test-setup');

async function runTestSuite(testModule) {
  try {
    await testModule();
    return true;
  } catch (error) {
    console.error(`Test suite failed:`, error);
    return false;
  }
}

async function runTests() {
  console.log('Starting database tests...\n');
  let allPassed = true;

  // Run each test suite sequentially
  const testSuites = [
    { name: 'Core Database', module: './database-core.test' },
    { name: 'CRUD Operations', module: './crud-operations.test' },
    { name: 'Query Operators', module: './query-operators.test' },
    { name: 'Indexing', module: './indexing.test' }
  ];

  for (const suite of testSuites) {
    console.log(`\n=== ${suite.name} ===`);
    try {
      const testModule = require(suite.module);
      const passed = await runTestSuite(testModule);
      if (!passed) {
        allPassed = false;
      }
    } catch (error) {
      console.error(`Failed to run ${suite.name}:`, error);
      allPassed = false;
    }
  }

  console.log('\n=== FINAL RESULTS ===');
  if (allPassed) {
    console.log('🎉 All test suites passed!');
  } else {
    console.log('❌ Some test suites failed');
    process.exit(1);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  runTests().catch(error => {
    console.error('Test runner failed:', error);
    process.exit(1);
  });
}

module.exports = runTests;