const express = require('express');
const { param, query } = require('express-validator');
const validate = require('../middleware/validate.middleware');
const { requireAuth } = require('../middleware/auth.middleware');
const ctrl = require('../controllers/revision.controller');

// Mounted at /api/revisions
const router = express.Router();
router.use(requireAuth);

router.get(
  '/',
  [query('status').optional().isIn(['pending', 'completed', 'skipped', 'overdue'])],
  validate,
  ctrl.listRevisions
);
router.patch('/:id/complete', [param('id').isMongoId()], validate, ctrl.completeRevision);
router.patch('/:id/skip', [param('id').isMongoId()], validate, ctrl.skipRevision);

module.exports = router;
