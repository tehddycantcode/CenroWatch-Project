// Wraps an async route handler so any rejected promise is forwarded to the
// centralized error handler. (Express 5 forwards async errors natively, but
// this keeps intent explicit and stays portable.)
module.exports = function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
