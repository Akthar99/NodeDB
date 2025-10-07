// tests/crud-operations.test.js
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
    toHaveLength: (expected) => {
      if (value.length !== expected) {
        throw new Error(`Expected length ${value.length} to be ${expected}`);
      }
    },
    toEqual: (expected) => {
      if (JSON.stringify(value) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(value)} to equal ${JSON.stringify(expected)}`);
      }
    }
  };
}

async function runCRUDTests() {
  console.log('CRUD Operations Tests');
  
  await test('should insert document', async () => {
    await cleanupTestData();
    const db = new Database({
      name: 'testdb',
      storagePath: TEST_DB_PATH
    });
    await db.connect();
    const users = db.collection('users');

    const doc = { name: 'John Doe', age: 30, email: 'john@example.com' };
    const result = await users.insert(doc);

    expect(result._id).toBeDefined();
    expect(result.name).toBe('John Doe');
    expect(result._createdAt).toBeDefined();
    expect(result._updatedAt).toBeDefined();
    
    await db.disconnect();
  });

  await test('should insert multiple documents', async () => {
    const db = new Database({
      name: 'testdb',
      storagePath: TEST_DB_PATH
    });
    await db.connect();
    const users = db.collection('users');

    const documents = [
      { name: 'User 1', age: 25 },
      { name: 'User 2', age: 30 },
      { name: 'User 3', age: 35 }
    ];

    const results = await users.insertMany(documents);
    expect(results).toHaveLength(3);
    expect(results[0]._id).toBeDefined();
    expect(results[1]._id).toBeDefined();
    expect(results[2]._id).toBeDefined();
    
    await db.disconnect();
  });

  await test('should find all documents', async () => {
    const db = new Database({
      name: 'testdb',
      storagePath: TEST_DB_PATH
    });
    await db.connect();
    const users = db.collection('users');

    await users.insert({ name: 'User 1' });
    await users.insert({ name: 'User 2' });

    const results = await users.find();
    expect(results).toHaveLength(2);
    
    await db.disconnect();
  });

  await test('should find documents with query', async () => {
    const db = new Database({
      name: 'testdb',
      storagePath: TEST_DB_PATH
    });
    await db.connect();
    const users = db.collection('users');

    await users.insert({ name: 'John', age: 25 });
    await users.insert({ name: 'Jane', age: 30 });
    await users.insert({ name: 'Bob', age: 25 });

    const results = await users.find({ age: 25 });
    expect(results).toHaveLength(2);
    expect(results[0].name).toBe('John');
    expect(results[1].name).toBe('Bob');
    
    await db.disconnect();
  });

  await test('should count documents', async () => {
    const db = new Database({
      name: 'testdb',
      storagePath: TEST_DB_PATH
    });
    await db.connect();
    const users = db.collection('users');

    await users.insert({ name: 'John', age: 25 });
    await users.insert({ name: 'Jane', age: 30 });
    await users.insert({ name: 'Bob', age: 25 });

    const count = await users.count();
    expect(count).toBe(3);

    const countAge25 = await users.count({ age: 25 });
    expect(countAge25).toBe(2);
    
    await db.disconnect();
  });

  console.log(`\n  Results: ${passedCount}/${testCount} tests passed`);
  return passedCount === testCount;
}

// Run if this file is executed directly
if (require.main === module) {
  runCRUDTests().then(success => {
    if (!success) {
      process.exit(1);
    }
  }).catch(error => {
    console.error('Tests failed:', error);
    process.exit(1);
  });
}

module.exports = runCRUDTests;