const rateLimit = require('express-rate-limit');

const windowMs = (Number(process.env.RATE_LIMIT_WINDOW_MINUTES) || 15) * 60 * 1000;

// Applied to every request
const globalLimiter = rateLimit({
  windowMs,
  max: Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please try again later.' },
});

// Applied only to /api/auth/* — much stricter, to slow down credential
// stuffing / brute force attempts against login and password reset.
const authLimiter = rateLimit({
  windowMs,
  max: Number(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many authentication attempts. Please try again later.' },
});

module.exports = { globalLimiter, authLimiter };
