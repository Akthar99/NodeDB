// examples/usage.js
const Database = require('../database/Database');

async function main() {
  // Create database instance
  const db = new Database({
    name: 'testdb',
    storagePath: './mydata'
  });

  try {
    // Connect to database
    await db.connect();

    // Get or create collection
    const users = db.collection('users');

    // Insert documents
    await users.insert({
      name: 'John Doe',
      email: 'john@example.com',
      age: 30,
      tags: ['admin', 'user']
    });

    await users.insert({
      name: 'Jane Smith',
      email: 'jane@example.com',
      age: 25,
      tags: ['user']
    });

    // Create index
    await users.createIndex(['email'], { unique: true });

    // Find documents
    const allUsers = await users.find();
    console.log('All users:', allUsers);

    // Query with conditions
    const youngUsers = await users.find({ age: { $lt: 30 } });
    console.log('Young users:', youngUsers);

    // Update documents
    await users.update(
      { name: 'John Doe' },
      { $set: { age: 31 } }
    );

    // Aggregation
    const pipeline = [
      { $match: { age: { $gte: 20 } } },
      { $group: { 
        _id: null, 
        averageAge: { $avg: '$age' },
        count: { $sum: 1 }
      }}
    ];

    const stats = await db.aggregate('users', pipeline);
    console.log('User statistics:', stats);

    // Event handling
    db.on('documentInserted', (data) => {
      console.log('Document inserted:', data);
    });

    db.on('documentUpdated', (data) => {
      console.log('Document updated:', data);
    });

  } catch (error) {
    console.error('Database error:', error);
  } finally {
    await db.disconnect();
  }
}

// Run example
main();