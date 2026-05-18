class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

function sendApiError(res, error) {
  const status = error instanceof ApiError ? error.status : 500;
  const message = error instanceof ApiError ? error.message : 'Server error.';
  return res.status(status).json({
    success: false,
    message,
    details: error instanceof ApiError ? error.details : undefined,
  });
}

module.exports = {
  ApiError,
  sendApiError,
};
