// examples/server-demo.js
const DBClient = require('../client/DBClient');

async function demo() {
  const client = new DBClient('http://localhost:8080');

  try {
    // HTTP API examples
    console.log('=== HTTP API Demo ===');
    
    // Create collection
    await client.createCollection('users');
    console.log('Created users collection');

    // Insert documents
    await client.insert('users', {
      name: 'John Doe',
      email: 'john@example.com',
      age: 30
    });

    // Find documents
    const results = await client.find('users', { age: { $gte: 25 } });
    console.log('Found users:', results);

    // WebSocket examples
    console.log('\n=== WebSocket Demo ===');
    await client.connectWebSocket();
    
    // Subscribe to changes
    await client.subscribe('users');
    
    // Real-time query
    const wsResults = await client.wsFind('users', {});
    console.log('WebSocket query results:', wsResults);

  } catch (error) {
    console.error('Demo error:', error);
  } finally {
    client.close();
  }
}

demo();