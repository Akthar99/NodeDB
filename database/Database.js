// database/Database.js
const CoreDB = require('./CoreDB');
const Collection = require('./Collection');
const path = require('path');
const fs = require('fs').promises;

class Database extends CoreDB {
  constructor(options = {}) {
    super(options);
  }

collection(name) {
    if (!this.collections.has(name)) {
        // Initialize as a proper Collection instance
        const Collection = require('./Collection');
        const collection = new Collection(name, this);
        this.collections.set(name, collection);
        return collection;
    }
    
    const collectionData = this.collections.get(name);
    
    // If it's already a Collection instance, return it
    if (collectionData instanceof require('./Collection')) {
        return collectionData;
    }
    
    // Otherwise, create a new Collection wrapper
    const Collection = require('./Collection');
    const collection = new Collection(name, this);
    
    // If we have existing data (Map), transfer it to the collection
    if (collectionData instanceof Map) {
        collection.documents = collectionData;
    } else if (Array.isArray(collectionData)) {
        // Convert array to Map
        const documentsMap = new Map();
        collectionData.forEach(doc => {
            if (doc && doc._id) {
                documentsMap.set(doc._id, doc);
            }
        });
        collection.documents = documentsMap;
    }
    
    // Replace the raw data with the Collection instance
    this.collections.set(name, collection);
    
    return collection;
}


  async createCollection(name) {
    // Ensure the collection exists as a proper Map
    if (!this.collections.has(name)) {
      this.collections.set(name, new Map());
    }
    
    const collection = this.collection(name);
    await this.saveCollection(name);
    return collection;
  }

  async dropCollection(name) {
    if (this.collections.has(name)) {
      this.collections.delete(name);
      
      // Remove collection file
      const filePath = path.join(this.storagePath, 'collections', `${name}.json`);
      try {
        await fs.unlink(filePath);
      } catch (error) {
        // File might not exist
      }
      
      // Remove associated indexes
      for (const [indexName, index] of this.indexes) {
        if (index.collection === name) {
          this.indexes.delete(indexName);
          await index.drop();
        }
      }
      
      this.emit('collectionDropped', { name });
    }
  }

  async listCollections() {
    return Array.from(this.collections.keys());
  }

  async createIndex(collectionName, fields, options = {}) {
    const collection = this.collection(collectionName);
    return await collection.createIndex(fields, options);
  }

  async dropIndex(indexName) {
    const index = this.indexes.get(indexName);
    if (index) {
      const collection = this.collection(index.collection);
      await collection.dropIndex(indexName);
    }
  }

  async getIndexes(collectionName) {
    const indexes = [];
    for (const [name, index] of this.indexes) {
      if (index.collection === collectionName) {
        indexes.push({
          name: index.name,
          fields: index.fields,
          options: index.options
        });
      }
    }
    return indexes;
  }

  // Aggregation pipeline (basic)
async aggregate(collectionName, pipeline) {
    const collection = this.collection(collectionName);
    let results = Array.from(collection.documents.values());

    for (const stage of pipeline) {
        const [operator, value] = Object.entries(stage)[0];
        
        switch (operator) {
            case '$match':
                results = collection.applyQuery(results, value);
                break;
            case '$group':
                results = this.applyGroupStage(results, value);
                break;
            case '$sort':
                results = collection.applySorting(results, value);
                break;
            case '$limit':
                results = results.slice(0, value);
                break;
            case '$skip':
                results = results.slice(value);
                break;
            case '$project':
                results = this.applyProjectStage(results, value);
                break;
            default:
                console.warn(`Unknown aggregation operator: ${operator}`);
        }
    }

    return results;
}

applyGroupStage(documents, group) {
    const groups = new Map();
    const _id = group._id;
    
    for (const doc of documents) {
        const groupKey = this.getGroupKey(doc, _id);
        
        if (!groups.has(groupKey)) {
            groups.set(groupKey, { _id: groupKey });
        }
        
        const groupDoc = groups.get(groupKey);
        
        // Apply accumulation operators
        for (const [field, accumulator] of Object.entries(group)) {
            if (field !== '_id') {
                const [operator, fieldPath] = Object.entries(accumulator)[0];
                
                // Ensure fieldPath is a string
                if (typeof fieldPath === 'string') {
                    const value = this.getNestedValue(doc, fieldPath);
                    this.applyAccumulator(groupDoc, field, operator, value);
                } else {
                    console.warn('Invalid field path in aggregation:', fieldPath);
                }
            }
        }
    }
    
    return Array.from(groups.values());
}

  getGroupKey(doc, idSpec) {
    if (typeof idSpec === 'string') {
      return doc[idSpec];
    } else if (idSpec === null) {
      return null;
    } else {
      // Handle complex _id with multiple fields
      const key = {};
      for (const [alias, field] of Object.entries(idSpec)) {
        key[alias] = this.getNestedValue(doc, field);
      }
      return JSON.stringify(key);
    }
  }

applyAccumulator(groupDoc, field, operator, value) {
    // Initialize accumulator if it doesn't exist
    if (!groupDoc[field]) {
        // Initialize based on operator type
        switch (operator) {
            case '$sum':
                groupDoc[field] = 0;
                break;
            case '$avg':
                groupDoc[field] = { sum: 0, count: 0 };
                break;
            case '$min':
                groupDoc[field] = value !== undefined ? value : Infinity;
                break;
            case '$max':
                groupDoc[field] = value !== undefined ? value : -Infinity;
                break;
            case '$push':
                groupDoc[field] = [];
                break;
            default:
                groupDoc[field] = 0;
        }
    }

    switch (operator) {
        case '$sum':
            groupDoc[field] += value || 0;
            break;
        case '$avg':
            if (typeof groupDoc[field] === 'object' && groupDoc[field].sum !== undefined) {
                groupDoc[field].sum += value || 0;
                groupDoc[field].count++;
                // Calculate average on the fly
                groupDoc[field] = groupDoc[field].sum / groupDoc[field].count;
            }
            break;
        case '$min':
            if (value !== undefined && value < groupDoc[field]) {
                groupDoc[field] = value;
            }
            break;
        case '$max':
            if (value !== undefined && value > groupDoc[field]) {
                groupDoc[field] = value;
            }
            break;
        case '$push':
            if (Array.isArray(groupDoc[field])) {
                groupDoc[field].push(value);
            }
            break;
    }
}

  applyProjectStage(documents, projection) {
    return documents.map(doc => {
      const projected = {};
      
      for (const [field, value] of Object.entries(projection)) {
        if (value === 1 || value === true) {
          projected[field] = this.getNestedValue(doc, field);
        } else if (typeof value === 'string') {
          projected[field] = this.getNestedValue(doc, value);
        } else if (typeof value === 'object') {
          // Handle expression projections
          projected[field] = this.evaluateProjectionExpression(doc, value);
        }
      }
      
      return projected;
    });
  }

  evaluateProjectionExpression(doc, expression) {
    // Simple expression evaluation
    if (expression.$concat) {
      return expression.$concat.map(field => this.getNestedValue(doc, field)).join('');
    }
    
    return null;
  }

  getNestedValue(obj, path) {
    // Ensure path is a string
    if (typeof path !== 'string') {
        console.error('Invalid path type in getNestedValue:', typeof path, path);
        return undefined;
    }
    
    return path.split('.').reduce((current, key) => {
        return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
}
}

module.exports = Database;