// server/secure-server.js
const DatabaseServer = require('./Server');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

class SecureDatabaseServer extends DatabaseServer {
  constructor(options = {}) {
    super(options);
    this.securityMiddleware = [];
  }

  setupSecurity() {
    // Helmet for security headers
    this.httpServer.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      }
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100 // limit each IP to 100 requests per windowMs
    });
    this.httpServer.use(limiter);

    // CORS for specific origins only
    this.httpServer.use((req, res, next) => {
      const allowedOrigins = [
        'https://--------------------------------------------.com',
        'https://www.-----------------------------------------.com'
      ];
      const origin = req.headers.origin;
      
      if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
      }
      
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      
      if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
      }
      next();
    });
  }

  async start() {
    this.setupSecurity();
    return super.start();
  }
}

module.exports = SecureDatabaseServer;