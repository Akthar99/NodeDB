// tests/query-operators.test.js
const Database = require('../database/Database');
const { TEST_DB_PATH, cleanupTestData } = require('./test-setup');
const TestRunner = require('./test-runner');

const runner = new TestRunner();

function runQueryTests() {
  runner.describe('Query Operators', () => {
    let db;
    let products;

    runner.test('should use $gt operator', async () => {
      await cleanupTestData();
      db = new Database({
        name: 'testdb',
        storagePath: TEST_DB_PATH
      });
      await db.connect();
      products = db.collection('products');

      await products.insertMany([
        { name: 'Laptop', price: 1000, category: 'electronics' },
        { name: 'Phone', price: 500, category: 'electronics' },
        { name: 'Book', price: 20, category: 'education' }
      ]);

      const results = await products.find({ price: { $gt: 200 } });
      runner.expect(results).toHaveLength(2); // Laptop, Phone
      
      await db.disconnect();
    });

    runner.test('should use $in operator', async () => {
      db = new Database({
        name: 'testdb',
        storagePath: TEST_DB_PATH
      });
      await db.connect();
      products = db.collection('products');

      await products.insertMany([
        { name: 'Laptop', category: 'electronics' },
        { name: 'Phone', category: 'electronics' },
        { name: 'Book', category: 'education' }
      ]);

      const results = await products.find({ 
        category: { $in: ['electronics', 'education'] } 
      });
      runner.expect(results).toHaveLength(3); // Laptop, Phone, Book
      
      await db.disconnect();
    });

    runner.test('should query arrays', async () => {
      db = new Database({
        name: 'testdb',
        storagePath: TEST_DB_PATH
      });
      await db.connect();
      products = db.collection('products');

      await products.insertMany([
        { name: 'Chair', tags: ['office', 'comfort'] },
        { name: 'Desk', tags: ['office'] },
        { name: 'Lamp', tags: ['home'] }
      ]);

      const results = await products.find({ tags: 'office' });
      runner.expect(results).toHaveLength(2); // Chair, Desk
      
      await db.disconnect();
    });
  });
}

// Run if this file is executed directly
if (require.main === module) {
  runQueryTests().then(() => {
    runner.summary();
  });
}

module.exports = runQueryTests;