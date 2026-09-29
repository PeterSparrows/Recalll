const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { User, StudyStreak } = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require('../utils/tokens');
const { sendPasswordResetEmail, sendVerificationEmail } = require('../services/email.service');

const SALT_ROUNDS = 12;

function issueTokenPair(user) {
  const accessToken = signAccessToken(user._id);
  const refreshToken = signRefreshToken(user._id, user.refresh_token_version);
  return { accessToken, refreshToken };
}

function setRefreshCookie(res, refreshToken) {
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/api/auth',
  });
}

function generateHashedToken() {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
  return { rawToken, hashedToken };
}

// POST /api/auth/register
const register = asyncHandler(async (req, res) => {
  const { full_name, email, password, department, level, terms_accepted } = req.body;

  if (terms_accepted !== true) {
    throw new ApiError(400, 'You must accept the Terms and Conditions to create an account.');
  }

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    throw new ApiError(409, 'An account with this email already exists.');
  }

  const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

  const user = await User.create({
    full_name,
    email,
    password_hash,
    department: department || null,
    level: level || null,
    terms_accepted_at: new Date(),
  });
  // Every new user gets a streak record initialized at zero
  // Every new user gets a streak record initialized at zero
  await StudyStreak.create({ user: user._id });

  const { rawToken, hashedToken } = generateHashedToken();
  user.verification_token = hashedToken;
  user.verification_token_expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await user.save();
  await sendVerificationEmail(user.email, rawToken);

  const { accessToken, refreshToken } = issueTokenPair(user);

  res.status(201).json({
    success: true,
    message: 'Account created successfully.',
    data: { user: user.toSafeJSON(), accessToken },
  });
});

// POST /api/auth/login
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email: email.toLowerCase() }).select('+password_hash');
  if (!user) {
    throw new ApiError(401, 'Invalid email or password.');
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    throw new ApiError(401, 'Invalid email or password.');
  }

  const { accessToken, refreshToken } = issueTokenPair(user);
  setRefreshCookie(res, refreshToken);

  res.status(200).json({
    success: true,
    message: 'Logged in successfully.',
    data: { user: user.toSafeJSON(), accessToken },
  });
});

// POST /api/auth/refresh
const refresh = asyncHandler(async (req, res) => {
  const token = req.cookies?.refreshToken;
  if (!token) {
    throw new ApiError(401, 'No refresh token provided.');
  }

  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch (err) {
    throw new ApiError(401, 'Invalid or expired refresh token.');
  }

  if (payload.type !== 'refresh') {
    throw new ApiError(401, 'Invalid token type.');
  }

  const user = await User.findById(payload.sub);
  if (!user || user.refresh_token_version !== payload.ver) {
    // token version mismatch = it was invalidated by a logout/reset
    throw new ApiError(401, 'Refresh token no longer valid. Please log in again.');
  }

  const { accessToken, refreshToken } = issueTokenPair(user);
  setRefreshCookie(res, refreshToken);

  res.status(200).json({ success: true, data: { accessToken } });
});

// POST /api/auth/logout
const logout = asyncHandler(async (req, res) => {
  // Bump refresh_token_version so any outstanding refresh tokens (this
  // device or others) are invalidated. req.user is set by requireAuth.
  await User.findByIdAndUpdate(req.user._id, { $inc: { refresh_token_version: 1 } });
  res.clearCookie('refreshToken', { path: '/api/auth' });
  res.status(200).json({ success: true, message: 'Logged out successfully.' });
});

// POST /api/auth/forgot-password
const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email: email.toLowerCase() });

  // Always respond the same way whether or not the account exists,
  // so this endpoint can't be used to enumerate registered emails.
  const genericResponse = {
    success: true,
    message: 'If an account with that email exists, a reset link has been sent.',
  };

  if (!user) {
    return res.status(200).json(genericResponse);
  }

  const rawToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresMinutes = Number(process.env.RESET_TOKEN_EXPIRES_MINUTES) || 30;

  user.reset_token = hashedToken;
  user.reset_token_expires = new Date(Date.now() + expiresMinutes * 60 * 1000);
  await user.save();

  const emailResult = await sendPasswordResetEmail(user.email, rawToken);

  // If EMAIL_USER/EMAIL_PASS aren't configured, email.service logs a
  // warning and skips the real send rather than throwing — this keeps
  // local dev working without forcing SMTP setup. In that case only,
  // return the raw token directly so the reset flow is still testable
  // end-to-end without email. Once SMTP is configured this branch never
  // fires and the token is never exposed over the API.
  const devPayload =
    !emailResult.sent && emailResult.reason === 'not_configured' && process.env.NODE_ENV !== 'production'
      ? { devResetToken: rawToken, devNote: 'EMAIL_USER/EMAIL_PASS not set — see README "Setting up email". Returning token directly for local testing only.' }
      : {};

  res.status(200).json({ ...genericResponse, ...devPayload });
});

// POST /api/auth/reset-password
const resetPassword = asyncHandler(async (req, res) => {
  const { token, newPassword } = req.body;

  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  const user = await User.findOne({
    reset_token: hashedToken,
    reset_token_expires: { $gt: new Date() },
  }).select('+reset_token +reset_token_expires');

  if (!user) {
    throw new ApiError(400, 'Reset token is invalid or has expired.');
  }

  user.password_hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  user.reset_token = null;
  user.reset_token_expires = null;
  user.refresh_token_version += 1; // invalidate all existing sessions
  await user.save();

  res.status(200).json({ success: true, message: 'Password reset successfully. Please log in again.' });
});

// POST /api/auth/verify-email
const verifyEmail = asyncHandler(async (req, res) => {
  const { token } = req.body;
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  const user = await User.findOne({
    verification_token: hashedToken,
    verification_token_expires: { $gt: new Date() },
  }).select('+verification_token +verification_token_expires');

  if (!user) {
    throw new ApiError(400, 'Verification link is invalid or has expired.');
  }

  user.email_verified = true;
  user.verification_token = null;
  user.verification_token_expires = null;
  await user.save();

  res.status(200).json({ success: true, message: 'Email verified successfully.' });
});

// POST /api/auth/resend-verification
const resendVerification = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  if (user.email_verified) {
    return res.status(200).json({ success: true, message: 'Your email is already verified.' });
  }

  const { rawToken, hashedToken } = generateHashedToken();
  user.verification_token = hashedToken;
  user.verification_token_expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await user.save();
  await sendVerificationEmail(user.email, rawToken);

  res.status(200).json({ success: true, message: 'Verification email sent.' });
});

// GET /api/auth/me
// GET /api/auth/me
const getMe = asyncHandler(async (req, res) => {
  res.status(200).json({ success: true, data: { user: req.user.toSafeJSON() } });
});

module.exports = {
  register,
  login,
  refresh,
  logout,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendVerification,
  getMe,
};
