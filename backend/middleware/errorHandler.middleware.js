/**
 * Global error handling middleware
 */
export const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;
  let status = err.status || 500;

  // Log error for dev inspection
  console.error(`[Error] ${err.name || 'Error'}: ${err.message}`);

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = `Resource not found. Invalid ID format: ${err.value}`;
    error = new Error(message);
    status = 404;
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const message = 'Duplicate field value entered. Please use another value.';
    error = new Error(message);
    status = 400;
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map((val) => val.message).join(', ');
    error = new Error(message);
    status = 400;
  }

  // JWT Errors
  if (err.name === 'JsonWebTokenError') {
    const message = 'Invalid token. Please log in again.';
    error = new Error(message);
    status = 401;
  }

  if (err.name === 'TokenExpiredError') {
    const message = 'Your token has expired. Please log in again.';
    error = new Error(message);
    status = 401;
  }

  res.status(status).json({
    success: false,
    status,
    message: error.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

export default errorHandler;
