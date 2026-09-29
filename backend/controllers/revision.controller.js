const { RevisionSchedule } = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { recordStudyActivity } = require('../services/streak.service');
const { StudySession } = require('../models');

// GET /api/revisions
const listRevisions = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const filter = { user: req.user._id };
  if (status) filter.status = status;

  const revisions = await RevisionSchedule.find(filter).sort({ scheduled_date: 1 });
  res.status(200).json({ success: true, data: { revisions } });
});

// PATCH /api/revisions/:id/complete
const completeRevision = asyncHandler(async (req, res) => {
  const revision = await RevisionSchedule.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    { status: 'completed' },
    { new: true }
  );
  if (!revision) throw new ApiError(404, 'Revision session not found.');

  await recordStudyActivity(req.user._id);
  await StudySession.create({
    user: req.user._id,
    activity_type: 'revision',
    duration_minutes: 15, // nominal — a real timer isn't wired to revision sessions yet
    session_date: new Date(),
  });

  res.status(200).json({ success: true, message: 'Revision marked complete.', data: { revision } });
});

// PATCH /api/revisions/:id/skip
const skipRevision = asyncHandler(async (req, res) => {
  const revision = await RevisionSchedule.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    { status: 'skipped' },
    { new: true }
  );
  if (!revision) throw new ApiError(404, 'Revision session not found.');
  res.status(200).json({ success: true, message: 'Revision skipped.', data: { revision } });
});

module.exports = { listRevisions, completeRevision, skipRevision };
