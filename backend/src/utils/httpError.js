// Small helper to throw errors with an HTTP status code that the centralized
// errorHandler understands (it reads err.statusCode).
class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

module.exports = HttpError;
