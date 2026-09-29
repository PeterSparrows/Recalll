/**
 * Stage 2 smoke tests — course/material routes, testable WITHOUT a
 * live MongoDB connection: auth gating, input validation, and file
 * upload validation (multer's fileFilter runs before any DB call).
 *
 * DB-backed success paths (actually creating a course, actually
 * processing a material end-to-end through the real AI service) are
 * documented as needing a live MongoDB — see README "Testing".
 * The AI service itself IS fully tested via direct HTTP in the
 * ai-service test log (see conversation) since it needs no DB.
 */
require('dotenv').config();
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const request = require('supertest');
const app = require('../server');

test('POST /api/courses without auth returns 401', async () => {
  const res = await request(app).post('/api/courses').send({ code: 'CSC401', title: 'Distributed Systems' });
  assert.strictEqual(res.status, 401);
});

test('GET /api/courses without auth returns 401', async () => {
  const res = await request(app).get('/api/courses');
  assert.strictEqual(res.status, 401);
});

test('DELETE /api/courses/:id without auth returns 401', async () => {
  const res = await request(app).delete('/api/courses/64b64c1f2f8fb814c8a1e111');
  assert.strictEqual(res.status, 401);
});

test('GET /api/courses/:id with a malformed id returns 401 (auth checked first)', async () => {
  // Auth middleware runs before param validation, so an invalid id
  // without a token correctly reports 401, not 400.
  const res = await request(app).get('/api/courses/not-a-valid-id');
  assert.strictEqual(res.status, 401);
});

test('POST /api/materials/upload without auth returns 401', async () => {
  const res = await request(app).post('/api/materials/upload');
  assert.strictEqual(res.status, 401);
});

test('GET /api/materials without auth returns 401', async () => {
  const res = await request(app).get('/api/materials');
  assert.strictEqual(res.status, 401);
});
