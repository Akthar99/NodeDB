// database/Index.js
const fs = require('fs').promises;
const path = require('path');

class Index {
  constructor(name, collection, fields, options, db) {
    this.name = name;
    this.collection = collection;
    this.fields = fields;
    this.options = options;
    this.db = db;
    this.unique = options.unique || false;
    this.sparse = options.sparse || false;
    this.indexData = new Map();
  }

  getIndexKey(document) {
    const keyParts = this.fields.map(field => {
      const value = this.getNestedValue(document, field);
      return value !== undefined ? JSON.stringify(value) : null;
    });

    // If sparse and any field is null/undefined, return null
    if (this.sparse && keyParts.some(part => part === null)) {
      return null;
    }

    return keyParts.join('|');
  }

  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

  update(document, operation, originalDoc = null) {
    const key = this.getIndexKey(document);
    const originalKey = originalDoc ? this.getIndexKey(originalDoc) : null;

    switch (operation) {
      case 'insert':
        if (key !== null) {
          if (this.unique && this.indexData.has(key)) {
            throw new Error(`Duplicate key error for index: ${this.name}`);
          }
          
          if (!this.indexData.has(key)) {
            this.indexData.set(key, new Set());
          }
          this.indexData.get(key).add(document._id);
        }
        break;

      case 'update':
        if (originalKey !== key) {
          // Remove from old key
          if (originalKey !== null && this.indexData.has(originalKey)) {
            this.indexData.get(originalKey).delete(document._id);
            if (this.indexData.get(originalKey).size === 0) {
              this.indexData.delete(originalKey);
            }
          }
          
          // Add to new key
          if (key !== null) {
            if (this.unique && this.indexData.has(key)) {
              throw new Error(`Duplicate key error for index: ${this.name}`);
            }
            
            if (!this.indexData.has(key)) {
              this.indexData.set(key, new Set());
            }
            this.indexData.get(key).add(document._id);
          }
        }
        break;

      case 'delete':
        if (key !== null && this.indexData.has(key)) {
          this.indexData.get(key).delete(document._id);
          if (this.indexData.get(key).size === 0) {
            this.indexData.delete(key);
          }
        }
        break;
    }
  }

  find(query) {
    const key = this.getIndexKey(query);
    return key !== null ? Array.from(this.indexData.get(key) || []) : [];
  }

  async save() {
    const indexPath = path.join(this.db.storagePath, 'indexes', `${this.name}.json`);
    const serializableData = Array.from(this.indexData.entries()).map(([key, ids]) => ({
      key,
      ids: Array.from(ids)
    }));
    
    await fs.writeFile(indexPath, JSON.stringify(serializableData, null, 2));
  }

  async load() {
    const indexPath = path.join(this.db.storagePath, 'indexes', `${this.name}.json`);
    try {
      const data = await fs.readFile(indexPath, 'utf8');
      const loadedData = JSON.parse(data);
      
      this.indexData = new Map();
      loadedData.forEach(({ key, ids }) => {
        this.indexData.set(key, new Set(ids));
      });
    } catch (error) {
      // Index file doesn't exist, start fresh
      this.indexData = new Map();
    }
  }

  async drop() {
    const indexPath = path.join(this.db.storagePath, 'indexes', `${this.name}.json`);
    try {
      await fs.unlink(indexPath);
    } catch (error) {
      // File might not exist
    }
  }
}

module.exports = Index;