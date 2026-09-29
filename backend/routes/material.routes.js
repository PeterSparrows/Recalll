const express = require('express');
const { param, query, body } = require('express-validator');
const validate = require('../middleware/validate.middleware');
const { requireAuth } = require('../middleware/auth.middleware');
const { uploadMaterialFile } = require('../middleware/upload.middleware');
const ctrl = require('../controllers/material.controller');

const router = express.Router();

router.use(requireAuth);

router.post(
  '/upload',
  uploadMaterialFile,
  [body('course_id').optional({ checkFalsy: true }).isMongoId().withMessage('Invalid course_id.')],
  validate,
  ctrl.uploadMaterial
);

router.get(
  '/',
  [
    query('course_id').optional().isMongoId(),
    query('status').optional().isIn(['uploaded', 'processing', 'analyzed', 'failed']),
  ],
  validate,
  ctrl.listMaterials
);

router.get('/:id', [param('id').isMongoId()], validate, ctrl.getMaterial);
router.get('/:id/chunks', [param('id').isMongoId()], validate, ctrl.getMaterialChunks);
router.delete('/:id', [param('id').isMongoId()], validate, ctrl.deleteMaterial);

module.exports = router;
