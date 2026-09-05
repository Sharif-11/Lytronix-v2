const logger = require('../services/logger');

// Central error handler. Converts Mongoose validation/cast errors into clean
// 400 responses, and falls back to 500 for anything unexpected.
const errorHandler = (err, req, res, next) => {
  logger.error(err.message, { stack: err.stack, method: req.method, path: req.originalUrl });

  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({ message: messages.join('; ') });
  }

  if (err.name === 'CastError') {
    return res.status(400).json({ message: `Invalid ${err.path}: ${err.value}` });
  }

  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {}).join(', ');
    return res.status(409).json({ message: `Duplicate value for field: ${field}` });
  }

  const status = err.statusCode || 500;
  res.status(status).json({ message: err.message || 'Server error' });
};

module.exports = errorHandler;
