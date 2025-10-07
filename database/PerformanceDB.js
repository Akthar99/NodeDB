// database/PerformanceDB.js
const Database = require('./Database');
const LRU = require('lru-cache');

class PerformanceDB extends Database {
  constructor(options = {}) {
    super(options);
    
    this.queryCache = new LRU({
      max: options.cacheSize || 1000,
      maxAge: options.cacheAge || 1000 * 60 * 5, // 5 minutes
    });
    
    this.stats = {
      cacheHits: 0,
      cacheMisses: 0,
      queries: 0
    };
  }

  getCacheKey(collectionName, query, options = {}) {
    return `${collectionName}:${JSON.stringify(query)}:${JSON.stringify(options)}`;
  }

  async find(collectionName, query = {}, options = {}) {
    this.stats.queries++;
    
    const cacheKey = this.getCacheKey(collectionName, query, options);
    const cached = this.queryCache.get(cacheKey);
    
    if (cached) {
      this.stats.cacheHits++;
      return cached;
    }
    
    this.stats.cacheMisses++;
    const results = await super.find(collectionName, query, options);
    
    // Only cache if results are not too large
    if (results.length < 1000) {
      this.queryCache.set(cacheKey, results);
    }
    
    return results;
  }

  async insert(collectionName, document) {
    const result = await super.insert(collectionName, document);
    this.invalidateCollectionCache(collectionName);
    return result;
  }

  async update(collectionName, query, update, options = {}) {
    const result = await super.update(collectionName, query, update, options);
    this.invalidateCollectionCache(collectionName);
    return result;
  }

  async delete(collectionName, query) {
    const result = await super.delete(collectionName, query);
    this.invalidateCollectionCache(collectionName);
    return result;
  }

  invalidateCollectionCache(collectionName) {
    for (const key of this.queryCache.keys()) {
      if (key.startsWith(`${collectionName}:`)) {
        this.queryCache.del(key);
      }
    }
  }

  getCacheStats() {
    return {
      ...this.stats,
      cacheSize: this.queryCache.length,
      cacheCount: this.queryCache.itemCount,
      hitRate: this.stats.queries > 0 ? 
        (this.stats.cacheHits / this.stats.queries) : 0
    };
  }

  clearCache() {
    this.queryCache.reset();
    this.stats.cacheHits = 0;
    this.stats.cacheMisses = 0;
    this.stats.queries = 0;
  }
}

module.exports = PerformanceDB;