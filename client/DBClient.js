// client/DBClient.js
class DBClient {
  constructor(baseURL = 'http://localhost:8080') {
    this.baseURL = baseURL;
    this.ws = null;
    this.messageId = 0;
    this.pendingRequests = new Map();
  }

async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    
    try {
        const config = {
            method: options.method || 'GET',
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        };

        // Only add body for methods that support it
        if (options.body && (config.method === 'POST' || config.method === 'PUT' || config.method === 'DELETE')) {
            config.body = JSON.stringify(options.body);
        }

        const response = await fetch(url, config);

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
        }

        return await response.json();
    } catch (error) {
        console.error(`Request failed for ${url}:`, error);
        throw error;
    }
}

  // Collection operations
  async listCollections() {
    return this.request('/collections');
  }

async createCollection(name) {
    return this.request('/collections', {
        method: 'POST',
        body: { name }
    });
}

  async dropCollection(name) {
    return this.request(`/collections/${name}`, { method: 'DELETE' });
  }

  // Document operations
async find(collection, query = {}, options = {}) {
    return this.request(`/${collection}`, {
        method: 'GET',
        body: { query, options }
    });
}

async insert(collection, document) {
    return this.request(`/${collection}`, {
        method: 'POST',
        body: document
    });
}

  async update(collection, query, update, options = {}) {
    return this.request(`/${collection}`, {
      method: 'PUT',
      body: { query, update, options }
    });
  }

  async delete(collection, query) {
    return this.request(`/${collection}`, {
      method: 'DELETE',
      body: { query }
    });
  }

async count(collection, query = {}) {
    return this.request(`/${collection}/count`, {
        method: 'GET',
        body: { query }
    });
}
  async aggregate(collection, pipeline) {
    return this.request(`/${collection}/aggregate`, {
      method: 'POST',
      body: { pipeline }
    });
  }

  // WebSocket operations
  connectWebSocket() {
    return new Promise((resolve, reject) => {
      const wsUrl = this.baseURL.replace('http', 'ws');
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        resolve();
      };

      this.ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        
        if (message.id && this.pendingRequests.has(message.id)) {
          const { resolve, reject } = this.pendingRequests.get(message.id);
          this.pendingRequests.delete(message.id);

          if (message.type === 'error') {
            reject(new Error(message.message));
          } else {
            resolve(message);
          }
        }
      };

      this.ws.onerror = (error) => {
        reject(error);
      };

      this.ws.onclose = () => {
        console.log('WebSocket disconnected');
      };
    });
  }

  async wsRequest(type, collection, data = {}) {
    if (!this.ws) {
      await this.connectWebSocket();
    }

    return new Promise((resolve, reject) => {
      const id = this.messageId++;
      const message = { type, id, collection, ...data };

      this.pendingRequests.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(message));
    });
  }

  // WebSocket operations
  async subscribe(collection) {
    return this.wsRequest('subscribe', collection);
  }

  async unsubscribe(collection) {
    return this.wsRequest('unsubscribe', collection);
  }

  async wsFind(collection, query = {}, options = {}) {
    return this.wsRequest('find', collection, { query, options });
  }

  async wsInsert(collection, document) {
    return this.wsRequest('insert', collection, document);
  }

  async wsUpdate(collection, query, update, options = {}) {
    return this.wsRequest('update', collection, { query, update, options });
  }

  async wsDelete(collection, query) {
    return this.wsRequest('delete', collection, { query });
  }

  close() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

module.exports = DBClient;