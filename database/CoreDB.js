// database/CoreDB.js
const fs = require('fs').promises;
const path = require('path');
const { EventEmitter } = require('events');

class CoreDB extends EventEmitter {
  constructor(options = {}) {
    super();
    this.name = options.name || 'mydatabase';
    this.storagePath = options.storagePath || './data';
    this.collections = new Map();
    this.indexes = new Map();
    this.isConnected = false;
    
    // Configuration
    this.autoCompact = options.autoCompact !== false;
    this.compactThreshold = options.compactThreshold || 1000;
    this.writeQueue = [];
    this.isWriting = false;
  }

  async connect() {
    try {
      // Create storage directories sequentially
      await fs.mkdir(this.storagePath, { recursive: true });
      await fs.mkdir(path.join(this.storagePath, 'collections'), { recursive: true });
      await fs.mkdir(path.join(this.storagePath, 'indexes'), { recursive: true });
      
      // Load existing collections
      await this.loadCollections();
      this.isConnected = true;
      
      this.emit('connected');
      console.log(`Database "${this.name}" connected successfully`);
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  async disconnect() {
    // Process any remaining writes
    await this.processWriteQueue();
    this.isConnected = false;
    this.emit('disconnected');
    console.log(`Database "${this.name}" disconnected`);
  }

  async loadCollections() {
    try {
      const collectionsPath = path.join(this.storagePath, 'collections');
      const files = await fs.readdir(collectionsPath);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const collectionName = path.basename(file, '.json');
          await this.loadCollection(collectionName);
        }
      }
    } catch (error) {
      // Directory might not exist yet or be empty
      console.log('No existing collections found or directory empty');
    }
  }

  async loadCollection(collectionName) {
    const filePath = path.join(this.storagePath, 'collections', `${collectionName}.json`);
    try {
      const data = await fs.readFile(filePath, 'utf8');
      const documents = JSON.parse(data);
      
      // Create a proper Map for the collection
      const collectionMap = new Map();
      documents.forEach(doc => {
        if (doc && doc._id) {
          collectionMap.set(doc._id, doc);
        }
      });
      
      this.collections.set(collectionName, collectionMap);
      console.log(`Loaded collection "${collectionName}" with ${collectionMap.size} documents`);
    } catch (error) {
      // Create new collection as Map
      console.log(`Creating new collection "${collectionName}"`);
      this.collections.set(collectionName, new Map());
    }
  }

async saveCollection(collectionName) {
    const collection = this.collections.get(collectionName);
    if (!collection) {
        console.log(`Collection "${collectionName}" not found for saving`);
        return;
    }

    let documents = [];
    
    // Handle different collection types
    if (collection instanceof Map) {
        documents = Array.from(collection.values());
    } else if (collection.documents && collection.documents instanceof Map) {
        // This is a Collection instance
        documents = Array.from(collection.documents.values());
    } else if (Array.isArray(collection)) {
        documents = collection;
    } else {
        console.error(`Invalid collection type for "${collectionName}":`, typeof collection);
        return;
    }

    const filePath = path.join(this.storagePath, 'collections', `${collectionName}.json`);
    
    try {
        await fs.writeFile(filePath, JSON.stringify(documents, null, 2));
        console.log(`Saved collection "${collectionName}" with ${documents.length} documents`);
    } catch (error) {
        console.error(`Failed to save collection "${collectionName}":`, error);
    }
}

  async queueWrite(operation) {
    this.writeQueue.push(operation);
    if (!this.isWriting) {
      await this.processWriteQueue();
    }
  }

  async processWriteQueue() {
    if (this.isWriting || this.writeQueue.length === 0) return;
    
    this.isWriting = true;
    
    while (this.writeQueue.length > 0) {
      const operation = this.writeQueue.shift();
      try {
        await operation();
      } catch (error) {
        console.error('Write operation failed:', error);
      }
    }
    
    this.isWriting = false;
  }
}

module.exports = CoreDB;