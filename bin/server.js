// bin/server.js !/usr/bin/env node


const DatabaseServer = require('../server/Server');
const { Command } = require('commander');
const pkg = require('../package.json');

const program = new Command();

program
  .name('db-server')
  .version(pkg.version)
  .description('High-performance Node.js database server')
  .option('-p, --port <number>', 'Port to listen on', '8080')
  .option('-h, --host <string>', 'Host to bind to', 'localhost')
  .option('-d, --data <path>', 'Data storage path', './data')
  .option('--no-cluster', 'Disable clustering')
  .option('-w, --workers <number>', 'Number of worker processes')
  .option('--max-memory <mb>', 'Maximum memory usage (MB)', '1024')
  .option('--no-cache', 'Disable query caching')
  .option('--cache-size <number>', 'Cache size limit', '1000')
  .option('--no-compression', 'Disable compression')
  .parse(process.argv);

const options = program.opts();

// Start server
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
  console.log('\nReceived SIGINT, shutting down gracefully...');
  await server.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  await server.stop();
  process.exit(0);
});

server.start().catch(console.error);