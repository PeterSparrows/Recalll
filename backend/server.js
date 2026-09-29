require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const mongoSanitize = require('express-mongo-sanitize');

const connectDB = require('./config/db');
const { globalLimiter } = require('./middleware/rateLimiter.middleware');
const { errorHandler, notFoundHandler } = require('./middleware/error.middleware');

const authRoutes = require('./routes/auth.routes');
const courseRoutes = require('./routes/course.routes');
const materialRoutes = require('./routes/material.routes');
const quizRoutes = require('./routes/quiz.routes');
const attemptRoutes = require('./routes/attempt.routes'); // nested under /api/quizzes/:quizId/attempts
const attemptActionsRoutes = require('./routes/attemptActions.routes'); // top-level /api/attempts/*
const resultRoutes = require('./routes/result.routes');
const weakTopicRoutes = require('./routes/weakTopic.routes');
const revisionRoutes = require('./routes/revision.routes');
const streakRoutes = require('./routes/streak.routes');
const analyticsRoutes = require('./routes/analytics.routes');
const notificationRoutes = require('./routes/notification.routes');
const userRoutes = require('./routes/user.routes');
const dashboardRoutes = require('./routes/dashboard.routes');

const app = express();

// --- Security & parsing middleware -----------------------------------
app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  })
);
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(mongoSanitize()); // strips $ and . keys from req.body/query/params to block NoSQL injection

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

app.use(globalLimiter);

// --- Health check -------------------------------------------------------
app.get('/api/health', (req, res) => {
  res.status(200).json({ success: true, message: 'API is healthy', timestamp: new Date().toISOString() });
});

// --- Routes ---------------------------------------------------------------
app.use('/api/auth', authRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/materials', materialRoutes);
app.use('/api/quizzes', quizRoutes);
app.use('/api/quizzes/:quizId/attempts', attemptRoutes); // start attempt, retry-wrong
app.use('/api/attempts', attemptActionsRoutes); // get/save-answer/submit
app.use('/api/results', resultRoutes);
app.use('/api/weak-topics', weakTopicRoutes);
app.use('/api/revisions', revisionRoutes);
app.use('/api/streak', streakRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/users', userRoutes);
app.use('/api/dashboard', dashboardRoutes);

// --- 404 + error handling (must be last) -----------------------------
app.use(notFoundHandler);
app.use(errorHandler);

// --- Boot ------------------------------------------------------------------
const PORT = process.env.PORT || 5000;

async function start() {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`[server] Listening on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
  });

  if (process.env.DAILY_REMINDER_ENABLED !== 'false') {
    const cron = require('node-cron');
    const { runDailyReminderJob } = require('./jobs/dailyReminder.job');
    const schedule = process.env.DAILY_REMINDER_CRON || '0 8 * * *';

    cron.schedule(schedule, () => {
      runDailyReminderJob().catch((err) => console.error('[daily-reminder] Job crashed:', err));
    });
    console.log(`[server] Daily reminder job scheduled: "${schedule}"`);
  }
}

// Only auto-start when run directly (not when imported by tests)
if (require.main === module) {
  start();
}

module.exports = app;
