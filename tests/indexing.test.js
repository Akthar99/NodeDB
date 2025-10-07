// tests/indexing.test.js
const Database = require('../database/Database');
const { TEST_DB_PATH, cleanupTestData } = require('./test-setup');
const TestRunner = require('./test-runner');

const runner = new TestRunner();

function runIndexingTests() {
  runner.describe('Indexing', () => {
    let db;
    let users;

    runner.test('should create index', async () => {
      await cleanupTestData();
      db = new Database({
        name: 'testdb',
        storagePath: TEST_DB_PATH
      });
      await db.connect();
      users = db.collection('users');

      await users.insert({ name: 'John', email: 'john@example.com' });
      
      const indexName = await users.createIndex(['email']);
      runner.expect(indexName).toBeDefined();

      const indexes = await db.getIndexes('users');
      runner.expect(indexes).toHaveLength(1);
      runner.expect(indexes[0].fields).toEqual(['email']);
      
      await db.disconnect();
    });

    runner.test('should create compound index', async () => {
      db = new Database({
        name: 'testdb',
        storagePath: TEST_DB_PATH
      });
      await db.connect();
      users = db.collection('users');

      await users.insert({ name: 'John', age: 25 });
      
      const indexName = await users.createIndex(['name', 'age']);
      runner.expect(indexName).toBeDefined();

      const indexes = await db.getIndexes('users');
      runner.expect(indexes[0].fields).toEqual(['name', 'age']);
      
      await db.disconnect();
    });
  });
}

// Run if this file is executed directly
if (require.main === module) {
  runIndexingTests().then(() => {
    runner.summary();
  });
}

module.exports = runIndexingTests;