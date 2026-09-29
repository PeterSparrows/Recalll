/**
 * Isolated tests for the upload middleware's validation logic
 * (extension/MIME matching, size limits, randomized filenames).
 * Mounted on a throwaway Express app with NO auth layer, so we're
 * testing multer's fileFilter/limits behavior directly — this needs
 * no database and exercises exactly the logic that guards uploads.
 */
require('dotenv').config();
const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const request = require('supertest');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { uploadMaterialFile } = require('../middleware/upload.middleware');
const { errorHandler } = require('../middleware/error.middleware');

function buildTestApp() {
  const app = express();
  app.post('/upload-test', uploadMaterialFile, (req, res) => {
    res.status(200).json({ success: true, filename: req.file.filename, size: req.file.size });
  });
  app.use(errorHandler);
  return app;
}

test('Accepts a valid .txt file with correct MIME type', async () => {
  const app = buildTestApp();
  const res = await request(app)
    .post('/upload-test')
    .attach('file', Buffer.from('Some study notes content.'), {
      filename: 'notes.txt',
      contentType: 'text/plain',
    });
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.filename.endsWith('.txt'));
  // Randomized filename must not equal the original name
  assert.notStrictEqual(res.body.filename, 'notes.txt');
});

test('Rejects a file with disallowed extension (.exe)', async () => {
  const app = buildTestApp();
  const res = await request(app)
    .post('/upload-test')
    .attach('file', Buffer.from('MZ...'), { filename: 'virus.exe', contentType: 'application/octet-stream' });
  assert.strictEqual(res.status, 400);
  assert.match(res.body.message, /Unsupported file extension/);
});

test('Rejects a file whose extension does not match its declared MIME type', async () => {
  const app = buildTestApp();
  // .pdf extension but claiming to be a plain text file — classic spoofing attempt
  const res = await request(app)
    .post('/upload-test')
    .attach('file', Buffer.from('not really a pdf'), { filename: 'fake.pdf', contentType: 'text/plain' });
  assert.strictEqual(res.status, 400);
  assert.match(res.body.message, /does not match its content type/);
});

test('Rejects a file exceeding the size limit', async () => {
  const app = buildTestApp();
  const oversized = Buffer.alloc(30 * 1024 * 1024); // 30MB, over the 25MB default limit
  const res = await request(app)
    .post('/upload-test')
    .attach('file', oversized, { filename: 'huge.txt', contentType: 'text/plain' });
  assert.strictEqual(res.status, 413);
  assert.match(res.body.message, /too large/i);
});

test('Rejects request with no file attached', async () => {
  const app = buildTestApp();
  const res = await request(app).post('/upload-test');
  assert.strictEqual(res.status, 400);
  assert.match(res.body.message, /No file was uploaded/);
});

test('Two uploads of the same original filename get different stored filenames', async () => {
  const app = buildTestApp();
  const res1 = await request(app)
    .post('/upload-test')
    .attach('file', Buffer.from('content A'), { filename: 'same.txt', contentType: 'text/plain' });
  const res2 = await request(app)
    .post('/upload-test')
    .attach('file', Buffer.from('content B'), { filename: 'same.txt', contentType: 'text/plain' });
  assert.notStrictEqual(res1.body.filename, res2.body.filename);
});
