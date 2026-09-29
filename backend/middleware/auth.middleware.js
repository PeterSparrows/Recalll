const { verifyAccessToken } = require('../utils/tokens');
const { User } = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

/**
 * Requires a valid Bearer access token. Attaches req.user (without
 * password_hash) on success.
 */
const requireAuth = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    throw new ApiError(401, 'Authentication required. Provide a Bearer access token.');
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw new ApiError(401, 'Access token expired. Refresh your session.');
    }
    throw new ApiError(401, 'Invalid access token.');
  }

  if (payload.type !== 'access') {
    throw new ApiError(401, 'Invalid token type.');
  }

  const user = await User.findById(payload.sub);
  if (!user) {
    throw new ApiError(401, 'User for this token no longer exists.');
  }

  req.user = user;
  next();
});

module.exports = { requireAuth };
