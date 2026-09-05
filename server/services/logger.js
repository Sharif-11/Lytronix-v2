const fs = require('fs');
const path = require('path');
const winston = require('winston');

const LOG_DIR = path.join(__dirname, '..', 'logs');
fs.mkdirSync(LOG_DIR, { recursive: true });

// Central application logger. `http` carries request-access lines (piped in
// from morgan in server.js); everything else (order requests, status
// transitions, courier booking/webhooks, SMS attempts, AI extraction) is
// logged explicitly at the call site via logger.info/warn/error below.
const logger = winston.createLogger({
  // Default 'http' (not 'info') so HTTP access lines piped in from morgan
  // (server.js) actually reach the transports — winston's npm levels treat
  // 'http' as lower priority than 'info', so an 'info' ceiling would silently
  // drop every access-log line. Override with LOG_LEVEL=info to quiet them.
  level: process.env.LOG_LEVEL || 'http',
  levels: winston.config.npm.levels, // error(0) warn(1) info(2) http(3) verbose debug silly
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: path.join(LOG_DIR, 'error.log'), level: 'error' }),
    new winston.transports.File({ filename: path.join(LOG_DIR, 'combined.log') }),
  ],
});

// Console output: human-readable, colorized, and skipped entirely in tests.
if (process.env.NODE_ENV !== 'test') {
  logger.add(
    new winston.transports.Console({
      level: process.env.LOG_LEVEL || 'http',
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: 'HH:mm:ss' }),
        winston.format.printf(({ level, message, timestamp, ...meta }) => {
          const rest = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
          return `${timestamp} ${level}: ${message}${rest}`;
        })
      ),
    })
  );
}

module.exports = logger;
