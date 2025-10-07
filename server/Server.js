// server/Server.js
const http = require('http');
const WebSocket = require('ws');
const cluster = require('cluster');
const os = require('os');
const Database = require('../database/Database');
const { performance, PerformanceObserver } = require('perf_hooks');

class DatabaseServer {
  constructor(options = {}) {
    this.options = {
      port: options.port || 8080,
      host: options.host || 'localhost',
      storagePath: options.storagePath || './data',
      cluster: options.cluster !== false,
      workers: options.workers || os.cpus().length,
      maxMemory: options.maxMemory || 1024, // MB
      compression: options.compression !== false,
      cache: options.cache !== false,
      cacheSize: options.cacheSize || 1000,
      ...options
    };

    this.db = null;
    this.httpServer = null;
    this.wsServer = null;
    this.cache = new Map();
    this.stats = {
      requests: 0,
      cacheHits: 0,
      queries: 0,
      inserts: 0,
      updates: 0,
      deletes: 0,
      errors: 0,
      startTime: Date.now()
    };

    this.setupPerformanceMonitoring();
  }

  setupPerformanceMonitoring() {
    // Performance monitoring
    this.performanceObserver = new PerformanceObserver((items) => {
      items.getEntries().forEach((entry) => {
        console.log(`[PERF] ${entry.name}: ${entry.duration.toFixed(2)}ms`);
      });
    });
    this.performanceObserver.observe({ entryTypes: ['measure'] });

    // Memory monitoring
    setInterval(() => {
      const memoryUsage = process.memoryUsage();
      const usedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
      
      if (usedMB > this.options.maxMemory) {
        console.warn(`[WARN] High memory usage: ${usedMB}MB`);
        this.clearCache();
      }
    }, 10000);
  }

  async start() {
    if (this.options.cluster && cluster.isPrimary) {
      return this.startCluster();
    } else {
      return this.startWorker();
    }
  }

  startCluster() {
    console.log(`[CLUSTER] Master ${process.pid} is running`);
    console.log(`[CLUSTER] Starting ${this.options.workers} workers`);

    // Fork workers
    for (let i = 0; i < this.options.workers; i++) {
      cluster.fork();
    }

    cluster.on('exit', (worker, code, signal) => {
      console.log(`[CLUSTER] Worker ${worker.process.pid} died`);
      console.log(`[CLUSTER] Starting a new worker`);
      cluster.fork();
    });

    return Promise.resolve();
  }

  async startWorker() {
    try {
      // Initialize database
      this.db = new Database({
        name: 'server_db',
        storagePath: this.options.storagePath
      });

      await this.db.connect();
      console.log(`[WORKER ${process.pid}] Database connected`);

      // Create HTTP server
      this.httpServer = http.createServer(this.handleRequest.bind(this));
      
      // Create WebSocket server
      this.wsServer = new WebSocket.Server({ 
        server: this.httpServer,
        perMessageDeflate: this.options.compression
      });

      this.setupWebSocketHandlers();

      // Start listening
      await new Promise((resolve, reject) => {
        this.httpServer.listen(this.options.port, this.options.host, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      console.log(`[WORKER ${process.pid}] Server running on ${this.options.host}:${this.options.port}`);
      return this;
    } catch (error) {
      console.error(`[WORKER ${process.pid}] Failed to start:`, error);
      process.exit(1);
    }
  }

  setupWebSocketHandlers() {
    this.wsServer.on('connection', (ws, req) => {
      const clientId = this.generateClientId();
      console.log(`[WS] Client ${clientId} connected`);

      ws.clientId = clientId;
      ws.isAlive = true;

      ws.on('pong', () => {
        ws.isAlive = true;
      });

      ws.on('message', async (data) => {
        try {
          const message = JSON.parse(data);
          await this.handleWebSocketMessage(ws, message);
        } catch (error) {
          this.sendError(ws, 'Invalid message format');
        }
      });

      ws.on('close', () => {
        console.log(`[WS] Client ${clientId} disconnected`);
      });

      // Send welcome message
      this.sendMessage(ws, {
        type: 'connected',
        clientId,
        timestamp: Date.now()
      });
    });

    // Heartbeat for WebSocket connections
    setInterval(() => {
      this.wsServer.clients.forEach((ws) => {
        if (!ws.isAlive) {
          console.log(`[WS] Client ${ws.clientId} timeout, terminating`);
          return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000);
  }

  generateClientId() {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async handleRequest(req, res) {
    performance.mark('requestStart');
    this.stats.requests++;

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const path = url.pathname;
      const method = req.method;

      // Parse request body
      const body = await this.parseRequestBody(req);
      
      // Route the request
      const response = await this.routeRequest(method, path, body, req);
      
      // Send response
      res.setHeader('Content-Type', 'application/json');
      res.writeHead(200);
      res.end(JSON.stringify(response));

    } catch (error) {
      this.stats.errors++;
      console.error(`[HTTP] Request error:`, error);
      
      res.setHeader('Content-Type', 'application/json');
      res.writeHead(error.statusCode || 500);
      res.end(JSON.stringify({
        error: true,
        message: error.message,
        code: error.code
      }));
    }

    performance.mark('requestEnd');
    performance.measure('requestDuration', 'requestStart', 'requestEnd');
  }

  async parseRequestBody(req) {
    return new Promise((resolve, reject) => {
      if (req.method !== 'POST' && req.method !== 'PUT') {
        resolve({});
        return;
      }

      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });

      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch (error) {
          reject(new Error('Invalid JSON body'));
        }
      });

      req.on('error', reject);
    });
  }

  // server/Server.js - Update the routeRequest method to handle URL parameters
  async routeRequest(method, path, body, req) {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const pathname = url.pathname;
      const pathSegments = pathname.split('/').filter(segment => segment);
      
      // Parse URL parameters for GET requests
      if (method === 'GET') {
          const queryParam = url.searchParams.get('query');
          const optionsParam = url.searchParams.get('options');
          
          if (queryParam) {
              try {
                  body.query = JSON.parse(queryParam);
              } catch (e) {
                  console.warn('Invalid query parameter:', queryParam);
              }
          }
          
          if (optionsParam) {
              try {
                  body.options = JSON.parse(optionsParam);
              } catch (e) {
                  console.warn('Invalid options parameter:', optionsParam);
              }
          }
      }

      const routes = {
          'GET /': () => this.getServerInfo(),
          'GET /stats': () => this.getStats(),
          'GET /collections': () => this.getCollections(),
          'POST /collections': () => this.createCollection(body.name, body),
          'DELETE /collections/:name': () => this.dropCollection(pathSegments[1]),
          
          'GET /:collection': () => this.findDocuments(pathSegments[0], body),
          'POST /:collection': () => this.insertDocument(pathSegments[0], body),
          'PUT /:collection': () => this.updateDocuments(pathSegments[0], body),
          'DELETE /:collection': () => this.deleteDocuments(pathSegments[0], body),
          
          'GET /:collection/count': () => this.countDocuments(pathSegments[0], body),
          'POST /:collection/query': () => this.findDocuments(pathSegments[0], body), // POST for complex queries
          'POST /:collection/aggregate': () => this.aggregateDocuments(pathSegments[0], body),
          
          'POST /:collection/indexes': () => this.createIndex(pathSegments[0], body),
          'GET /:collection/indexes': () => this.getIndexes(pathSegments[0]),
          'DELETE /:collection/indexes/:name': () => this.dropIndex(pathSegments[0], pathSegments[2]),
      };

      // Build route key
      let routeKey = `${method} ${pathname}`;
      
      // Try exact match first
      let handler = routes[routeKey];
      
      // If no exact match, try pattern matching
      if (!handler) {
          for (const [route, handlerFn] of Object.entries(routes)) {
              const [routeMethod, routePath] = route.split(' ');
              const routeSegments = routePath.split('/').filter(segment => segment);
              
              if (routeMethod === method && pathSegments.length === routeSegments.length) {
                  let match = true;
                  for (let i = 0; i < routeSegments.length; i++) {
                      if (routeSegments[i].startsWith(':')) {
                          // This is a parameter, skip exact match
                          continue;
                      }
                      if (routeSegments[i] !== pathSegments[i]) {
                          match = false;
                          break;
                      }
                  }
                  if (match) {
                      handler = handlerFn;
                      break;
                  }
              }
          }
      }

      if (!handler) {
          throw { statusCode: 404, message: `Route not found: ${method} ${pathname}` };
      }

      return handler();
  }

  // HTTP API Handlers
  async getServerInfo() {
    return {
      server: 'Node.js Database Server',
      version: '1.0.0',
      worker: process.pid,
      uptime: Date.now() - this.stats.startTime,
      memory: process.memoryUsage(),
      connections: this.wsServer.clients.size
    };
  }

  async getStats() {
    return {
      ...this.stats,
      uptime: Date.now() - this.stats.startTime,
      cacheSize: this.cache.size,
      cacheHitRate: this.stats.requests > 0 ? (this.stats.cacheHits / this.stats.requests) : 0
    };
  }

  async getCollections() {
    const collections = await this.db.listCollections();
    return { collections };
  }

async createCollection(name, body) {
    if (!name && body && body.name) {
        name = body.name;
    }
    
    if (!name) {
        throw { statusCode: 400, message: 'Collection name is required' };
    }
    
    const collection = this.db.collection(name);
    await this.db.saveCollection(name);
    
    return { 
        success: true, 
        collection: name,
        message: `Collection '${name}' created`
    };
}

  async dropCollection(name) {
    await this.db.dropCollection(name);
    return { 
      success: true, 
      message: `Collection '${name}' dropped` 
    };
  }

  async findDocuments(collectionName, body) {
    this.stats.queries++;
    
    // Check cache for GET requests
    const cacheKey = `find:${collectionName}:${JSON.stringify(body)}`;
    if (this.options.cache && this.cache.has(cacheKey)) {
      this.stats.cacheHits++;
      return this.cache.get(cacheKey);
    }

    const collection = this.db.collection(collectionName);
    const results = await collection.find(body.query || {}, body.options || {});
    
    const response = { 
      collection: collectionName,
      count: results.length,
      results 
    };

    // Cache the result
    if (this.options.cache) {
      this.cache.set(cacheKey, response);
      this.manageCacheSize();
    }

    return response;
  }

  async insertDocument(collectionName, body) {
    this.stats.inserts++;
    
    const collection = this.db.collection(collectionName);
    let result;
    
    if (Array.isArray(body)) {
      result = await collection.insertMany(body);
    } else {
      result = await collection.insert(body);
    }

    // Invalidate cache for this collection
    this.invalidateCollectionCache(collectionName);

    // Broadcast change via WebSocket
    this.broadcast({
      type: 'documentInserted',
      collection: collectionName,
      document: result,
      timestamp: Date.now()
    });

    return { 
      success: true, 
      collection: collectionName,
      result 
    };
  }

  async updateDocuments(collectionName, body) {
    this.stats.updates++;
    
    const collection = this.db.collection(collectionName);
    const result = await collection.update(
      body.query || {}, 
      body.update || {}, 
      body.options || {}
    );

    // Invalidate cache for this collection
    this.invalidateCollectionCache(collectionName);

    // Broadcast change via WebSocket
    this.broadcast({
      type: 'documentsUpdated',
      collection: collectionName,
      query: body.query,
      update: body.update,
      result,
      timestamp: Date.now()
    });

    return { 
      success: true, 
      collection: collectionName,
      result 
    };
  }

  async deleteDocuments(collectionName, body) {
    this.stats.deletes++;
    
    const collection = this.db.collection(collectionName);
    const result = await collection.delete(body.query || {});

    // Invalidate cache for this collection
    this.invalidateCollectionCache(collectionName);

    // Broadcast change via WebSocket
    this.broadcast({
      type: 'documentsDeleted',
      collection: collectionName,
      query: body.query,
      result,
      timestamp: Date.now()
    });

    return { 
      success: true, 
      collection: collectionName,
      result 
    };
  }

  async countDocuments(collectionName, body) {
    const collection = this.db.collection(collectionName);
    const count = await collection.count(body.query || {});
    
    return { 
      collection: collectionName,
      count 
    };
  }

  async aggregateDocuments(collectionName, body) {
    const results = await this.db.aggregate(collectionName, body.pipeline || []);
    
    return { 
      collection: collectionName,
      count: results.length,
      results 
    };
  }

  async createIndex(collectionName, body) {
    const indexName = await this.db.createIndex(
      collectionName, 
      body.fields, 
      body.options || {}
    );
    
    return { 
      success: true, 
      collection: collectionName,
      index: indexName 
    };
  }

  async getIndexes(collectionName) {
    const indexes = await this.db.getIndexes(collectionName);
    
    return { 
      collection: collectionName,
      indexes 
    };
  }

  async dropIndex(collectionName, indexName) {
    await this.db.dropIndex(indexName);
    
    return { 
      success: true, 
      collection: collectionName,
      message: `Index '${indexName}' dropped` 
    };
  }

  // WebSocket Handlers
  async handleWebSocketMessage(ws, message) {
    const { type, id, collection, ...data } = message;

    const handlers = {
      'subscribe': () => this.handleSubscribe(ws, collection),
      'unsubscribe': () => this.handleUnsubscribe(ws, collection),
      'find': () => this.handleWebSocketFind(ws, id, collection, data),
      'insert': () => this.handleWebSocketInsert(ws, id, collection, data),
      'update': () => this.handleWebSocketUpdate(ws, id, collection, data),
      'delete': () => this.handleWebSocketDelete(ws, id, collection, data)
    };

    const handler = handlers[type];
    if (!handler) {
      return this.sendError(ws, `Unknown message type: ${type}`);
    }

    try {
      await handler();
    } catch (error) {
      this.sendError(ws, error.message, id);
    }
  }

  async handleSubscribe(ws, collection) {
    if (!ws.subscriptions) {
      ws.subscriptions = new Set();
    }
    ws.subscriptions.add(collection);
    this.sendMessage(ws, {
      type: 'subscribed',
      collection,
      timestamp: Date.now()
    });
  }

  async handleUnsubscribe(ws, collection) {
    if (ws.subscriptions) {
      ws.subscriptions.delete(collection);
    }
    this.sendMessage(ws, {
      type: 'unsubscribed',
      collection,
      timestamp: Date.now()
    });
  }

  async handleWebSocketFind(ws, id, collection, data) {
    const results = await this.findDocuments(collection, data);
    this.sendMessage(ws, {
      type: 'findResult',
      id,
      collection,
      results: results.results,
      count: results.count,
      timestamp: Date.now()
    });
  }

  async handleWebSocketInsert(ws, id, collection, data) {
    const result = await this.insertDocument(collection, data);
    this.sendMessage(ws, {
      type: 'insertResult',
      id,
      collection,
      result: result.result,
      timestamp: Date.now()
    });
  }

  async handleWebSocketUpdate(ws, id, collection, data) {
    const result = await this.updateDocuments(collection, data);
    this.sendMessage(ws, {
      type: 'updateResult',
      id,
      collection,
      result: result.result,
      timestamp: Date.now()
    });
  }

  async handleWebSocketDelete(ws, id, collection, data) {
    const result = await this.deleteDocuments(collection, data);
    this.sendMessage(ws, {
      type: 'deleteResult',
      id,
      collection,
      result: result.result,
      timestamp: Date.now()
    });
  }

  // Utility Methods
  sendMessage(ws, message) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  sendError(ws, message, id = null) {
    this.sendMessage(ws, {
      type: 'error',
      id,
      message,
      timestamp: Date.now()
    });
  }

  broadcast(message, collection = null) {
    this.wsServer.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        if (!collection || (client.subscriptions && client.subscriptions.has(collection))) {
          this.sendMessage(client, message);
        }
      }
    });
  }

  invalidateCollectionCache(collectionName) {
    // Remove all cache entries for this collection
    for (const key of this.cache.keys()) {
      if (key.startsWith(`find:${collectionName}:`)) {
        this.cache.delete(key);
      }
    }
  }

  manageCacheSize() {
    if (this.cache.size > this.options.cacheSize) {
      // Remove oldest entries (first 10% of cache)
      const keysToRemove = Array.from(this.cache.keys())
        .slice(0, Math.floor(this.options.cacheSize * 0.1));
      
      keysToRemove.forEach(key => this.cache.delete(key));
    }
  }

  clearCache() {
    this.cache.clear();
    console.log('[CACHE] Cache cleared');
  }

  async stop() {
    console.log('Shutting down server...');
    
    if (this.wsServer) {
      this.wsServer.clients.forEach(client => client.close());
    }
    
    if (this.httpServer) {
      this.httpServer.close();
    }
    
    if (this.db) {
      await this.db.disconnect();
    }
    
    if (this.performanceObserver) {
      this.performanceObserver.disconnect();
    }
    
    console.log('Server stopped');
  }
}

module.exports = DatabaseServer;