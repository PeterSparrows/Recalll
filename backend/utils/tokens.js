const jwt = require('jsonwebtoken');

/**
 * Signs a short-lived access token carrying the user id.
 */
function signAccessToken(userId) {
  return jwt.sign({ sub: userId.toString(), type: 'access' }, process.env.JWT_ACCESS_SECRET, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  });
}

/**
 * Signs a longer-lived refresh token. Includes a `ver` claim tied to
 * User.refresh_token_version so we can invalidate all refresh tokens
 * for a user (e.g. on logout-everywhere or password reset) by bumping
 * that counter in the DB.
 */
function signRefreshToken(userId, tokenVersion) {
  return jwt.sign(
    { sub: userId.toString(), type: 'refresh', ver: tokenVersion },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET);
}

function verifyRefreshToken(token) {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
};
