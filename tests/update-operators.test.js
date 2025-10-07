// tests/update-operators.test.js
const Database = require('../database/Database');
const { TEST_DB_PATH, cleanupTestData } = require('./test-setup');

describe('Update Operators', () => {
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

    await users.insert({
      name: 'John Doe',
      age: 25,
      scores: [80, 90],
      address: {
        city: 'New York',
        country: 'USA'
      }
    });
  });

  afterEach(async () => {
    await db.disconnect();
    await cleanupTestData();
  });

  test('should use $set operator', async () => {
    await users.update(
      { name: 'John Doe' },
      { $set: { age: 26, city: 'Boston' } }
    );

    const user = await users.findOne({ name: 'John Doe' });
    expect(user.age).toBe(26);
    expect(user.city).toBe('Boston');
  });

  test('should use $unset operator', async () => {
    await users.update(
      { name: 'John Doe' },
      { $unset: { age: '' } }
    );

    const user = await users.findOne({ name: 'John Doe' });
    expect(user.age).toBeUndefined();
  });

  test('should use $inc operator', async () => {
    await users.update(
      { name: 'John Doe' },
      { $inc: { age: 5 } }
    );

    const user = await users.findOne({ name: 'John Doe' });
    expect(user.age).toBe(30);
  });

  test('should use $push operator', async () => {
    await users.update(
      { name: 'John Doe' },
      { $push: { scores: 95 } }
    );

    const user = await users.findOne({ name: 'John Doe' });
    expect(user.scores).toHaveLength(3);
    expect(user.scores).toContain(95);
  });

  test('should update nested fields', async () => {
    await users.update(
      { name: 'John Doe' },
      { $set: { 'address.city': 'Los Angeles' } }
    );

    const user = await users.findOne({ name: 'John Doe' });
    expect(user.address.city).toBe('Los Angeles');
    expect(user.address.country).toBe('USA');
  });

  test('should handle upsert', async () => {
    const result = await users.update(
      { name: 'Jane Smith' },
      { $set: { age: 30 } },
      { upsert: true }
    );

    expect(result.upsertedCount).toBe(1);

    const user = await users.findOne({ name: 'Jane Smith' });
    expect(user.age).toBe(30);
  });
});