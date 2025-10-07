// database/Collection.js
const { v4: uuidv4 } = require('uuid');

class Collection {
  constructor(name, db) {
    this.name = name;
    this.db = db;
    this.documents = new Map(); // Ensure this is always a Map
    this.indexes = new Map();
  }

  generateId() {
    return uuidv4();
  }

  async insert(document) {
    if (!document._id) {
      document._id = this.generateId();
    }

    document._createdAt = new Date().toISOString();
    document._updatedAt = new Date().toISOString();

    // Ensure documents is a Map
    if (!(this.documents instanceof Map)) {
      this.documents = new Map();
    }

    this.documents.set(document._id, document);
    
    // Update indexes
    this.updateIndexes(document, 'insert');
    
    // Queue save operation
    await this.db.queueWrite(async () => {
      await this.db.saveCollection(this.name);
    });

    this.db.emit('documentInserted', { collection: this.name, document });
    return document;
  }

  async insertMany(documents) {
    const results = [];
    for (const doc of documents) {
      results.push(await this.insert(doc));
    }
    return results;
  }

  async find(query = {}, options = {}) {
    // Ensure documents is a Map and convert to array
    let results = [];
    if (this.documents instanceof Map) {
      results = Array.from(this.documents.values());
    } else if (Array.isArray(this.documents)) {
      results = this.documents;
    } else {
      console.error(`Invalid documents type in collection "${this.name}":`, typeof this.documents);
      return [];
    }
    
    // Apply query filters
    if (Object.keys(query).length > 0) {
      results = this.applyQuery(results, query);
    }

    // Apply sorting
    if (options.sort) {
      results = this.applySorting(results, options.sort);
    }

    // Apply pagination
    if (options.limit || options.skip) {
      results = this.applyPagination(results, options);
    }

    return results;
  }

  async findOne(query = {}) {
    const results = await this.find(query, { limit: 1 });
    return results[0] || null;
  }

  async update(query, update, options = {}) {
    const documents = await this.find(query);
    let updatedCount = 0;

    for (const doc of documents) {
      const originalDoc = { ...doc };
      
      if (options.upsert && documents.length === 0) {
        // Insert new document if upsert is true and no documents found
        await this.insert({ ...query, ...update });
        return { matchedCount: 0, modifiedCount: 1, upsertedCount: 1 };
      }

      // Apply update operations
      this.applyUpdateOperations(doc, update, options);
      
      doc._updatedAt = new Date().toISOString();
      
      // Update the document in the Map
      if (this.documents instanceof Map) {
        this.documents.set(doc._id, doc);
      }
      
      // Update indexes
      this.updateIndexes(doc, 'update', originalDoc);
      
      updatedCount++;
    }

    if (updatedCount > 0) {
      await this.db.queueWrite(async () => {
        await this.db.saveCollection(this.name);
      });

      this.db.emit('documentUpdated', { 
        collection: this.name, 
        query, 
        update, 
        updatedCount 
      });
    }

    return { matchedCount: documents.length, modifiedCount: updatedCount };
  }

  async delete(query) {
    const documentsToDelete = await this.find(query);
    const deletedIds = [];

    for (const doc of documentsToDelete) {
      if (this.documents instanceof Map) {
        this.documents.delete(doc._id);
      }
      deletedIds.push(doc._id);
      
      // Remove from indexes
      this.updateIndexes(doc, 'delete');
    }

    if (deletedIds.length > 0) {
      await this.db.queueWrite(async () => {
        await this.db.saveCollection(this.name);
      });

      this.db.emit('documentDeleted', { 
        collection: this.name, 
        query, 
        deletedCount: deletedIds.length 
      });
    }

    return { deletedCount: deletedIds.length };
  }

  async count(query = {}) {
    const results = await this.find(query);
    return results.length;
  }

  // ... rest of the Collection methods remain the same
  applyQuery(documents, query) {
    return documents.filter(doc => this.matchesQuery(doc, query));
  }

  matchesQuery(document, query) {
    for (const [key, value] of Object.entries(query)) {
      if (key.startsWith('$')) continue; // Skip operators for now
      
      if (!this.compareValues(document[key], value)) {
        return false;
      }
    }
    
    // Handle query operators
    return this.handleQueryOperators(document, query);
  }

  compareValues(docValue, queryValue) {
    if (queryValue === undefined || queryValue === null) {
      return docValue === queryValue;
    }

    // Handle regex
    if (queryValue instanceof RegExp) {
      return typeof docValue === 'string' && queryValue.test(docValue);
    }

    // Handle object queries (like { $gt: 10 })
    if (typeof queryValue === 'object' && !Array.isArray(queryValue)) {
      return this.handleComparisonOperators(docValue, queryValue);
    }

    // Handle arrays (IN operator)
    if (Array.isArray(queryValue)) {
      return queryValue.includes(docValue);
    }

    // Simple equality
    return docValue === queryValue;
  }

  handleComparisonOperators(docValue, queryObj) {
    for (const [operator, value] of Object.entries(queryObj)) {
      switch (operator) {
        case '$eq':
          if (docValue !== value) return false;
          break;
        case '$ne':
          if (docValue === value) return false;
          break;
        case '$gt':
          if (docValue <= value) return false;
          break;
        case '$gte':
          if (docValue < value) return false;
          break;
        case '$lt':
          if (docValue >= value) return false;
          break;
        case '$lte':
          if (docValue > value) return false;
          break;
        case '$in':
          if (!value.includes(docValue)) return false;
          break;
        case '$nin':
          if (value.includes(docValue)) return false;
          break;
        case '$regex':
          const regex = new RegExp(value);
          if (!regex.test(docValue)) return false;
          break;
      }
    }
    return true;
  }

  handleQueryOperators(document, query) {
    // Handle $and, $or, $nor operators
    if (query.$and) {
      return query.$and.every(condition => this.matchesQuery(document, condition));
    }
    
    if (query.$or) {
      return query.$or.some(condition => this.matchesQuery(document, condition));
    }
    
    if (query.$nor) {
      return !query.$nor.some(condition => this.matchesQuery(document, condition));
    }
    
    return true;
  }

  applySorting(documents, sort) {
    return documents.sort((a, b) => {
      for (const [field, direction] of Object.entries(sort)) {
        const aVal = a[field];
        const bVal = b[field];
        const sortOrder = direction === 1 || direction === 'asc' ? 1 : -1;

        if (aVal < bVal) return -1 * sortOrder;
        if (aVal > bVal) return 1 * sortOrder;
      }
      return 0;
    });
  }

  applyPagination(documents, options) {
    const skip = options.skip || 0;
    const limit = options.limit || documents.length;
    
    return documents.slice(skip, skip + limit);
  }

  applyUpdateOperations(document, update, options) {
    for (const [operator, values] of Object.entries(update)) {
      if (operator.startsWith('$')) {
        // Update operators
        switch (operator) {
          case '$set':
            Object.assign(document, values);
            break;
          case '$unset':
            Object.keys(values).forEach(key => {
              delete document[key];
            });
            break;
          case '$inc':
            Object.keys(values).forEach(key => {
              document[key] = (document[key] || 0) + values[key];
            });
            break;
          case '$push':
            Object.keys(values).forEach(key => {
              if (!Array.isArray(document[key])) {
                document[key] = [];
              }
              document[key].push(values[key]);
            });
            break;
        }
      } else if (operator === '_id') {
        // Skip _id updates
        continue;
      } else {
        // Simple assignment (replace operation)
        document[operator] = values;
      }
    }
  }

  updateIndexes(document, operation, originalDoc = null) {
    for (const [indexName, index] of this.db.indexes) {
      if (index.collection === this.name) {
        index.update(document, operation, originalDoc);
      }
    }
  }

  async createIndex(fields, options = {}) {
    const indexName = options.name || `${this.name}_${fields.join('_')}`;
    const Index = require('./Index');
    const index = new Index(indexName, this.name, fields, options, this.db);
    
    // Build initial index
    for (const doc of this.documents.values()) {
      index.update(doc, 'insert');
    }
    
    this.db.indexes.set(indexName, index);
    await index.save();
    
    return indexName;
  }

  async dropIndex(indexName) {
    const index = this.db.indexes.get(indexName);
    if (index && index.collection === this.name) {
      this.db.indexes.delete(indexName);
      await index.drop();
    }
  }
}

module.exports = Collection;