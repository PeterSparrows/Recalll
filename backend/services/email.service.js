const nodemailer = require('nodemailer');

/**
 * Email service. Two send paths, tried in this order:
 *
 * 1. Brevo's HTTP API (BREVO_API_KEY set) — sends over plain HTTPS
 *    (port 443), so it works on hosts that block outbound SMTP ports
 *    25/465/587, which several free-tier platforms do (Render's free
 *    web services are one example). This is the recommended path for
 *    any hosted deployment.
 * 2. SMTP via Nodemailer (EMAIL_USER/EMAIL_PASS set) — works locally
 *    and on hosts that don't block SMTP ports, e.g. Gmail SMTP for
 *    local dev, or Brevo's own SMTP relay when not deploying to a
 *    port-restricted host.
 *
 * If neither is configured, sendMail() logs to the console instead of
 * throwing — this keeps local dev working without forcing everyone to
 * set up email just to run the app, while still exercising the real
 * code path once either is configured.
 */
let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    return null;
  }

  transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: Number(process.env.EMAIL_PORT) || 587,
    secure: Number(process.env.EMAIL_PORT) === 465, // true for 465, false for 587 (STARTTLS)
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  return transporter;
}

async function sendViaBrevoApi({ to, subject, html, text }) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'api-key': process.env.BREVO_API_KEY,
    },
    body: JSON.stringify({
      sender: { name: 'Recall', email: process.env.EMAIL_FROM },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text || html.replace(/<[^>]+>/g, ''),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Brevo API responded ${res.status}: ${body.slice(0, 300)}`);
  }

  return res.json();
}

async function sendMail({ to, subject, html, text }) {
  // Path 1: Brevo HTTP API — preferred whenever configured, since it
  // works over plain HTTPS and isn't affected by a host blocking
  // outbound SMTP ports.
  if (process.env.BREVO_API_KEY && process.env.EMAIL_FROM) {
    try {
      await sendViaBrevoApi({ to, subject, html, text });
      return { sent: true, via: 'brevo_api' };
    } catch (err) {
      console.error('[email] Brevo API send failed:', err.message);
      return { sent: false, reason: err.message };
    }
  }

  // Path 2: SMTP via Nodemailer
  const t = getTransporter();

  if (!t) {
    // Neither configured — don't crash the request, just make it
    // obvious in the logs so a developer notices during local dev.
    console.warn(`[email] No email method configured (BREVO_API_KEY or EMAIL_USER/EMAIL_PASS) — skipping real send.\n  To: ${to}\n  Subject: ${subject}`);
    return { sent: false, reason: 'not_configured' };
  }

  try {
    await t.sendMail({
      from: process.env.EMAIL_FROM || `"Recall" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      text: text || html.replace(/<[^>]+>/g, ''),
      html,
    });
    return { sent: true, via: 'smtp' };
  } catch (err) {
    // Email failures should not break the request they're attached to
    // (e.g. a failed reset email shouldn't 500 the forgot-password
    // endpoint) — log it and let the caller decide what to do.
    console.error('[email] SMTP send failed:', err.message);
    return { sent: false, reason: err.message };
  }
}

function sendPasswordResetEmail(toEmail, resetToken) {
  const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/login.html?reset_token=${resetToken}`;
  return sendMail({
    to: toEmail,
    subject: 'Reset your Recall password',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Reset your password</h2>
        <p>You requested a password reset for your Recall account. Click below to choose a new password — this link expires in ${process.env.RESET_TOKEN_EXPIRES_MINUTES || 30} minutes.</p>
        <p><a href="${resetUrl}" style="display:inline-block; padding:12px 24px; background:#f5a623; color:#14100a; text-decoration:none; border-radius:24px; font-weight:600;">Reset password</a></p>
        <p style="color:#888; font-size:13px;">If you didn't request this, you can safely ignore this email.</p>
      </div>`,
  });
}

function sendVerificationEmail(toEmail, verificationToken) {
  const verifyUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email.html?token=${verificationToken}`;
  return sendMail({
    to: toEmail,
    subject: 'Verify your Recall account',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Welcome to Recall</h2>
        <p>Confirm this is your email address to finish setting up your account.</p>
        <p><a href="${verifyUrl}" style="display:inline-block; padding:12px 24px; background:#f5a623; color:#14100a; text-decoration:none; border-radius:24px; font-weight:600;">Verify email</a></p>
        <p style="color:#888; font-size:13px;">If you didn't create a Recall account, you can safely ignore this email.</p>
      </div>`,
  });
}

function sendDailyReminderEmail(toEmail, fullName, { streak, goalMinutes }) {
  const dashboardUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard.html`;
  const streakLine = streak > 0
    ? `You're on a ${streak}-day streak — don't lose it.`
    : `A fresh study session today gets a new streak started.`;
  return sendMail({
    to: toEmail,
    subject: streak > 0 ? `Keep your ${streak}-day streak alive` : "Haven't studied today yet?",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Hi ${fullName || 'there'},</h2>
        <p>${streakLine} Your goal today is ${goalMinutes} minutes.</p>
        <p><a href="${dashboardUrl}" style="display:inline-block; padding:12px 24px; background:#f5a623; color:#14100a; text-decoration:none; border-radius:24px; font-weight:600;">Open Recall</a></p>
      </div>`,
  });
}

module.exports = { sendMail, sendPasswordResetEmail, sendVerificationEmail, sendDailyReminderEmail };
