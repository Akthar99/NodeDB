// tests/persistence.test.js
const Database = require('../database/Database');
const { TEST_DB_PATH, cleanupTestData } = require('./test-setup');

describe('Persistence', () => {
  test('should persist data between connections', async () => {
    // First connection
    let db = new Database({
      name: 'persistence_test',
      storagePath: TEST_DB_PATH
    });
    await db.connect();
    
    const users = db.collection('users');
    await users.insert({ name: 'John', age: 25 });
    await users.insert({ name: 'Jane', age: 30 });
    
    await db.disconnect();

    // Second connection
    db = new Database({
      name: 'persistence_test',
      storagePath: TEST_DB_PATH
    });
    await db.connect();
    
    const users2 = db.collection('users');
    const allUsers = await users2.find();
    
    expect(allUsers).toHaveLength(2);
    expect(allUsers[0].name).toBe('John');
    expect(allUsers[1].name).toBe('Jane');

    await db.disconnect();
  });

  test('should persist indexes between connections', async () => {
    let db = new Database({
      name: 'index_persistence_test',
      storagePath: TEST_DB_PATH
    });
    await db.connect();
    
    const users = db.collection('users');
    await users.insert({ name: 'John', email: 'john@example.com' });
    await users.createIndex(['email'], { unique: true });
    
    await db.disconnect();

    // Reconnect
    db = new Database({
      name: 'index_persistence_test',
      storagePath: TEST_DB_PATH
    });
    await db.connect();
    
    const indexes = await db.getIndexes('users');
    expect(indexes).toHaveLength(1);
    expect(indexes[0].fields).toEqual(['email']);

    // Test that unique constraint still works
    const users2 = db.collection('users');
    await expect(
      users2.insert({ name: 'Duplicate', email: 'john@example.com' })
    ).rejects.toThrow();

    await db.disconnect();
  });
});