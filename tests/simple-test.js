// tests/simple-test.js
const Database = require('../database/Database');
const fs = require('fs').promises;
const path = require('path');

const TEST_DB_PATH = path.join(__dirname, '../test-data');

async function cleanup() {
  try {
    await fs.rm(TEST_DB_PATH, { recursive: true, force: true });
  } catch (error) {
    // Ignore cleanup errors
  }
}

async function runSimpleTests() {
  console.log('Running simple database tests...\n');
  let passed = 0;
  let failed = 0;

  async function test(name, testFn) {
    try {
      await testFn();
      console.log(`✓ ${name}`);
      passed++;
    } catch (error) {
      console.log(`✗ ${name}`);
      console.log(`  Error: ${error.message}`);
      failed++;
    }
  }

  // Test 1: Database connection
  await test('Database connection', async () => {
    await cleanup();
    const db = new Database({ 
      name: 'testdb', 
      storagePath: TEST_DB_PATH 
    });
    await db.connect();
    if (!db.isConnected) throw new Error('Database should be connected');
    await db.disconnect();
  });

  // Test 2: Create collection
  await test('Create collection', async () => {
    await cleanup();
    const db = new Database({ 
      name: 'testdb', 
      storagePath: TEST_DB_PATH 
    });
    await db.connect();
    const collection = await db.createCollection('users');
    if (!collection) throw new Error('Collection should be created');
    if (collection.name !== 'users') throw new Error('Collection name should be "users"');
    await db.disconnect();
  });

  // Test 3: Insert document
  await test('Insert document', async () => {
    await cleanup();
    const db = new Database({ 
      name: 'testdb', 
      storagePath: TEST_DB_PATH 
    });
    await db.connect();
    const users = db.collection('users');
    const result = await users.insert({ name: 'Test User', age: 25 });
    if (!result._id) throw new Error('Document should have ID');
    if (result.name !== 'Test User') throw new Error('Document should have correct name');
    await db.disconnect();
  });

  // Test 4: Find document
  await test('Find document', async () => {
    await cleanup();
    const db = new Database({ 
      name: 'testdb', 
      storagePath: TEST_DB_PATH 
    });
    await db.connect();
    const users = db.collection('users');
    await users.insert({ name: 'Test User', age: 25 });
    const results = await users.find({ age: 25 });
    if (results.length !== 1) throw new Error('Should find 1 document');
    if (results[0].name !== 'Test User') throw new Error('Should find correct document');
    await db.disconnect();
  });

  // Test 5: Update document
  await test('Update document', async () => {
    await cleanup();
    const db = new Database({ 
      name: 'testdb', 
      storagePath: TEST_DB_PATH 
    });
    await db.connect();
    const users = db.collection('users');
    await users.insert({ name: 'Test User', age: 25 });
    await users.update({ name: 'Test User' }, { $set: { age: 30 } });
    const results = await users.find({ age: 30 });
    if (results.length !== 1) throw new Error('Should find updated document');
    if (results[0].age !== 30) throw new Error('Age should be updated to 30');
    await db.disconnect();
  });

  // Test 6: Delete document
  await test('Delete document', async () => {
    await cleanup();
    const db = new Database({ 
      name: 'testdb', 
      storagePath: TEST_DB_PATH 
    });
    await db.connect();
    const users = db.collection('users');
    await users.insert({ name: 'Test User', age: 25 });
    await users.delete({ name: 'Test User' });
    const results = await users.find();
    if (results.length !== 0) throw new Error('Should have no documents after deletion');
    await db.disconnect();
  });

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  
  if (failed > 0) {
    process.exit(1);
  }
}

// Run tests
runSimpleTests().catch(console.error);