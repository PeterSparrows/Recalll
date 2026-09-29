/**
 * A structured, expected error we throw deliberately (e.g. "invalid
 * credentials", "course not found"). The global error middleware
 * distinguishes these from unexpected bugs and returns clean JSON
 * instead of leaking stack traces.
 */
class ApiError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = ApiError;
