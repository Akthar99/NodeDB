// tests/database-core.test.js
const Database = require('../database/Database');
const { TEST_DB_PATH, cleanupTestData } = require('./test-setup');

let testCount = 0;
let passedCount = 0;

async function test(name, testFn) {
  testCount++;
  try {
    await testFn();
    console.log(`  ✓ ${name}`);
    passedCount++;
  } catch (error) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${error.message}`);
    throw error;
  }
}

function expect(value) {
  return {
    toBe: (expected) => {
      if (value !== expected) {
        throw new Error(`Expected ${value} to be ${expected}`);
      }
    },
    toBeDefined: () => {
      if (value === undefined) {
        throw new Error(`Expected value to be defined`);
      }
    },
    toContain: (expected) => {
      if (!value.includes(expected)) {
        throw new Error(`Expected ${value} to contain ${expected}`);
      }
    }
  };
}

async function runCoreTests() {
  console.log('Core Database Tests');
  
  await test('should connect to database', async () => {
    await cleanupTestData();
    const db = new Database({
      name: 'testdb',
      storagePath: TEST_DB_PATH
    });
    await db.connect();
    expect(db.isConnected).toBe(true);
    await db.disconnect();
  });

  await test('should disconnect from database', async () => {
    const db = new Database({
      name: 'testdb',
      storagePath: TEST_DB_PATH
    });
    await db.connect();
    await db.disconnect();
    expect(db.isConnected).toBe(false);
  });

  await test('should create collection', async () => {
    const db = new Database({
      name: 'testdb',
      storagePath: TEST_DB_PATH
    });
    await db.connect();
    const collection = await db.createCollection('users');
    expect(collection).toBeDefined();
    expect(collection.name).toBe('users');
    await db.disconnect();
  });

  await test('should list collections', async () => {
    const db = new Database({
      name: 'testdb',
      storagePath: TEST_DB_PATH
    });
    await db.connect();
    await db.createCollection('users');
    await db.createCollection('products');
    
    const collections = await db.listCollections();
    expect(collections).toContain('users');
    expect(collections).toContain('products');
    await db.disconnect();
  });

  console.log(`\n  Results: ${passedCount}/${testCount} tests passed`);
  return passedCount === testCount;
}

// Run if this file is executed directly
if (require.main === module) {
  runCoreTests().then(success => {
    if (!success) {
      process.exit(1);
    }
  }).catch(error => {
    console.error('Tests failed:', error);
    process.exit(1);
  });
}

module.exports = runCoreTests;