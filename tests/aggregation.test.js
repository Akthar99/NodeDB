// tests/indexing.test.js
const Database = require('../database/Database');
const { TEST_DB_PATH, cleanupTestData } = require('./test-setup');

describe('Indexing', () => {
  let db;
  let users;

  beforeEach(async () => {
    await cleanupTestData();
    db = new Database({
      name: 'testdb',
      storagePath: TEST_DB_PATH
    });
    await db.connect();
    users = db.collection('users');

    await users.insertMany([
      { name: 'John', email: 'john@example.com', age: 25 },
      { name: 'Jane', email: 'jane@example.com', age: 30 },
      { name: 'Bob', email: 'bob@example.com', age: 25 }
    ]);
  });

  afterEach(async () => {
    await db.disconnect();
    await cleanupTestData();
  });

  test('should create index', async () => {
    const indexName = await users.createIndex(['email']);
    expect(indexName).toBeDefined();

    const indexes = await db.getIndexes('users');
    expect(indexes).toHaveLength(1);
    expect(indexes[0].fields).toEqual(['email']);
  });

  test('should create unique index', async () => {
    await users.createIndex(['email'], { unique: true });

    // Try to insert duplicate email
    await expect(
      users.insert({ name: 'Duplicate', email: 'john@example.com' })
    ).rejects.toThrow();
  });

  test('should drop index', async () => {
    const indexName = await users.createIndex(['email']);
    
    let indexes = await db.getIndexes('users');
    expect(indexes).toHaveLength(1);

    await users.dropIndex(indexName);
    
    indexes = await db.getIndexes('users');
    expect(indexes).toHaveLength(0);
  });

  test('should create compound index', async () => {
    const indexName = await users.createIndex(['name', 'age']);
    expect(indexName).toBeDefined();

    const indexes = await db.getIndexes('users');
    expect(indexes[0].fields).toEqual(['name', 'age']);
  });
});