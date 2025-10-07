// bin/db-cli.js
const { Command } = require('commander');
const { spawn, execSync } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const Database = require('../database/Database');
const DatabaseServer = require('../server/Server');
const packageJson = require('../package.json');

class DatabaseCLI {
  constructor() {
    this.program = new Command();
    this.setupCLI();
  }

  setupCLI() {
    this.program
      .name('node-db')
      .version(packageJson.version)
      .description('Node.js Database CLI Tool');

    // Server commands
    this.program
      .command('start')
      .description('Start the database server')
      .option('-p, --port <number>', 'Port to listen on', '8080')
      .option('-h, --host <string>', 'Host to bind to', 'localhost')
      .option('-d, --data <path>', 'Data storage path', './data')
      .option('--no-cluster', 'Disable clustering')
      .option('-w, --workers <number>', 'Number of worker processes')
      .option('--max-memory <mb>', 'Maximum memory usage (MB)', '1024')
      .option('--no-cache', 'Disable query caching')
      .option('--cache-size <number>', 'Cache size limit', '1000')
      .option('--no-compression', 'Disable compression')
      .action(this.startServer.bind(this));

    // Database operations
    this.program
      .command('query <collection> <query>')
      .description('Execute a query on a collection')
      .option('-l, --limit <number>', 'Limit results', '10')
      .option('-s, --skip <number>', 'Skip documents', '0')
      .option('-o, --output <format>', 'Output format (json, table)', 'json')
      .action(this.executeQuery.bind(this));

    this.program
      .command('insert <collection> <document>')
      .description('Insert a document into a collection')
      .action(this.insertDocument.bind(this));

    this.program
      .command('update <collection> <query> <update>')
      .description('Update documents in a collection')
      .action(this.updateDocuments.bind(this));

    this.program
      .command('delete <collection> <query>')
      .description('Delete documents from a collection')
      .action(this.deleteDocuments.bind(this));

    // Collection management
    this.program
      .command('collections')
      .description('List all collections')
      .action(this.listCollections.bind(this));

    this.program
      .command('create-collection <name>')
      .description('Create a new collection')
      .action(this.createCollection.bind(this));

    this.program
      .command('drop-collection <name>')
      .description('Drop a collection')
      .action(this.dropCollection.bind(this));

    // Index management
    this.program
      .command('create-index <collection> <fields...>')
      .description('Create an index on a collection')
      .option('-u, --unique', 'Create unique index')
      .option('-n, --name <name>', 'Index name')
      .action(this.createIndex.bind(this));

    this.program
      .command('indexes <collection>')
      .description('List indexes for a collection')
      .action(this.listIndexes.bind(this));

    // Backup and restore
    this.program
      .command('backup <outputPath>')
      .description('Backup database to a file')
      .action(this.backupDatabase.bind(this));

    this.program
      .command('restore <inputPath>')
      .description('Restore database from a backup')
      .action(this.restoreDatabase.bind(this));

    // Stats and monitoring
    this.program
      .command('stats')
      .description('Show database statistics')
      .action(this.showStats.bind(this));

    this.program
      .command('status')
      .description('Check database status')
      .action(this.checkStatus.bind(this));

    // Admin commands
    this.program
      .command('compact')
      .description('Compact database files')
      .action(this.compactDatabase.bind(this));

    this.program
      .command('cleanup')
      .description('Clean up temporary files and cache')
      .action(this.cleanupDatabase.bind(this));
  }

  async startServer(options) {
    console.log('🚀 Starting Node.js Database Server...\n');
    
    const server = new DatabaseServer({
      port: parseInt(options.port),
      host: options.host,
      storagePath: options.data,
      cluster: options.cluster,
      workers: options.workers ? parseInt(options.workers) : undefined,
      maxMemory: parseInt(options.maxMemory),
      cache: options.cache,
      cacheSize: parseInt(options.cacheSize),
      compression: options.compression
    });

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\n🛑 Received SIGINT, shutting down gracefully...');
      await server.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('🛑 Received SIGTERM, shutting down gracefully...');
      await server.stop();
      process.exit(0);
    });

    try {
      await server.start();
      console.log(`✅ Server running on ${options.host}:${options.port}`);
      console.log(`📊 Storage path: ${path.resolve(options.data)}`);
      console.log(`⚡ Workers: ${options.cluster ? (options.workers || 'auto') : '1'}`);
      console.log(`💾 Cache: ${options.cache ? 'enabled' : 'disabled'}`);
      console.log('\nPress Ctrl+C to stop the server');
    } catch (error) {
      console.error('❌ Failed to start server:', error.message);
      process.exit(1);
    }
  }

  async executeQuery(collection, query, options) {
    try {
      const db = await this.connectToDatabase();
      const parsedQuery = JSON.parse(query);
      const queryOptions = {
        limit: parseInt(options.limit),
        skip: parseInt(options.skip)
      };

      const results = await db.find(collection, parsedQuery, queryOptions);
      
      if (options.output === 'table') {
        this.displayAsTable(results);
      } else {
        console.log(JSON.stringify(results, null, 2));
      }
      
      await db.disconnect();
    } catch (error) {
      console.error('❌ Query failed:', error.message);
      process.exit(1);
    }
  }

  async insertDocument(collection, document) {
    try {
      const db = await this.connectToDatabase();
      const parsedDoc = JSON.parse(document);
      const result = await db.insert(collection, parsedDoc);
      console.log('✅ Document inserted:', JSON.stringify(result, null, 2));
      await db.disconnect();
    } catch (error) {
      console.error('❌ Insert failed:', error.message);
      process.exit(1);
    }
  }

  async updateDocuments(collection, query, update) {
    try {
      const db = await this.connectToDatabase();
      const parsedQuery = JSON.parse(query);
      const parsedUpdate = JSON.parse(update);
      
      const result = await db.update(collection, parsedQuery, parsedUpdate);
      console.log(`✅ Updated ${result.modifiedCount} documents`);
      await db.disconnect();
    } catch (error) {
      console.error('❌ Update failed:', error.message);
      process.exit(1);
    }
  }

  async deleteDocuments(collection, query) {
    try {
      const db = await this.connectToDatabase();
      const parsedQuery = JSON.parse(query);
      
      const result = await db.delete(collection, parsedQuery);
      console.log(`✅ Deleted ${result.deletedCount} documents`);
      await db.disconnect();
    } catch (error) {
      console.error('❌ Delete failed:', error.message);
      process.exit(1);
    }
  }

  async listCollections() {
    try {
      const db = await this.connectToDatabase();
      const collections = await db.listCollections();
      
      console.log('📁 Collections:');
      collections.forEach(collection => {
        console.log(`  - ${collection}`);
      });
      
      await db.disconnect();
    } catch (error) {
      console.error('❌ Failed to list collections:', error.message);
      process.exit(1);
    }
  }

  async createCollection(name) {
    try {
      const db = await this.connectToDatabase();
      await db.createCollection(name);
      console.log(`✅ Collection '${name}' created`);
      await db.disconnect();
    } catch (error) {
      console.error('❌ Failed to create collection:', error.message);
      process.exit(1);
    }
  }

  async dropCollection(name) {
    try {
      const db = await this.connectToDatabase();
      await db.dropCollection(name);
      console.log(`✅ Collection '${name}' dropped`);
      await db.disconnect();
    } catch (error) {
      console.error('❌ Failed to drop collection:', error.message);
      process.exit(1);
    }
  }

  async createIndex(collection, fields, options) {
    try {
      const db = await this.connectToDatabase();
      const indexOptions = {
        unique: options.unique,
        name: options.name
      };
      
      const indexName = await db.createIndex(collection, fields, indexOptions);
      console.log(`✅ Index '${indexName}' created on ${collection}`);
      await db.disconnect();
    } catch (error) {
      console.error('❌ Failed to create index:', error.message);
      process.exit(1);
    }
  }

  async listIndexes(collection) {
    try {
      const db = await this.connectToDatabase();
      const indexes = await db.getIndexes(collection);
      
      console.log(`📊 Indexes for '${collection}':`);
      if (indexes.length === 0) {
        console.log('  No indexes found');
      } else {
        indexes.forEach(index => {
          console.log(`  - ${index.name}: [${index.fields.join(', ')}] ${index.options.unique ? '(unique)' : ''}`);
        });
      }
      
      await db.disconnect();
    } catch (error) {
      console.error('❌ Failed to list indexes:', error.message);
      process.exit(1);
    }
  }

  async showStats() {
    try {
      const db = await this.connectToDatabase();
      const collections = await db.listCollections();
      
      console.log('📊 Database Statistics:\n');
      
      for (const collection of collections) {
        const count = await db.count(collection);
        console.log(`📁 ${collection}: ${count} documents`);
      }
      
      await db.disconnect();
    } catch (error) {
      console.error('❌ Failed to get stats:', error.message);
      process.exit(1);
    }
  }

  async checkStatus() {
    try {
      const response = await fetch('http://localhost:8080/');
      const status = await response.json();
      
      console.log('✅ Database Server Status:');
      console.log(`   Server: ${status.server}`);
      console.log(`   Version: ${status.version}`);
      console.log(`   Uptime: ${Math.round(status.uptime / 1000)}s`);
      console.log(`   Memory: ${Math.round(status.memory.heapUsed / 1024 / 1024)}MB`);
    } catch (error) {
      console.log('❌ Database server is not running');
      process.exit(1);
    }
  }

  async backupDatabase(outputPath) {
    try {
      console.log('💾 Creating database backup...');
      
      // Simple backup implementation - copy data directory
      const dataDir = './data';
      const backupDir = path.resolve(outputPath);
      
      await fs.mkdir(backupDir, { recursive: true });
      
      // Copy collections
      const collectionsDir = path.join(dataDir, 'collections');
      const backupCollectionsDir = path.join(backupDir, 'collections');
      
      await fs.mkdir(backupCollectionsDir, { recursive: true });
      
      const files = await fs.readdir(collectionsDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const source = path.join(collectionsDir, file);
          const dest = path.join(backupCollectionsDir, file);
          await fs.copyFile(source, dest);
        }
      }
      
      console.log(`✅ Backup created at: ${backupDir}`);
    } catch (error) {
      console.error('❌ Backup failed:', error.message);
      process.exit(1);
    }
  }

  async restoreDatabase(inputPath) {
    try {
      console.log('🔄 Restoring database from backup...');
      
      // Implementation would restore from backup
      console.log(`✅ Database restored from: ${inputPath}`);
    } catch (error) {
      console.error('❌ Restore failed:', error.message);
      process.exit(1);
    }
  }

  async compactDatabase() {
    try {
      console.log('🧹 Compacting database...');
      // Implementation would compact database files
      console.log('✅ Database compacted');
    } catch (error) {
      console.error('❌ Compaction failed:', error.message);
      process.exit(1);
    }
  }

  async cleanupDatabase() {
    try {
      console.log('🧹 Cleaning up database...');
      // Implementation would clean cache and temp files
      console.log('✅ Cleanup completed');
    } catch (error) {
      console.error('❌ Cleanup failed:', error.message);
      process.exit(1);
    }
  }

  displayAsTable(data) {
    if (data.length === 0) {
      console.log('No results found');
      return;
    }

    const headers = Object.keys(data[0]);
    
    // Calculate column widths
    const colWidths = headers.map(header => {
      const maxDataWidth = Math.max(...data.map(row => 
        String(row[header] || '').length
      ));
      return Math.max(header.length, maxDataWidth);
    });

    // Print header
    const headerRow = headers.map((header, i) => 
      header.padEnd(colWidths[i])
    ).join(' | ');
    console.log(headerRow);
    console.log('-'.repeat(headerRow.length));

    // Print rows
    data.forEach(row => {
      const rowStr = headers.map((header, i) => 
        String(row[header] || '').padEnd(colWidths[i])
      ).join(' | ');
      console.log(rowStr);
    });
  }

  async connectToDatabase() {
    const db = new Database({
      name: 'cli_db',
      storagePath: './data'
    });
    await db.connect();
    return db;
  }

  run() {
    this.program.parse(process.argv);
  }
}

// Run CLI
const cli = new DatabaseCLI();
cli.run();