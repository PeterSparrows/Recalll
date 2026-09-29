const { WeakTopic } = require('../models');
const asyncHandler = require('../utils/asyncHandler');

// GET /api/weak-topics
const listWeakTopics = asyncHandler(async (req, res) => {
  const { status } = req.query; // optional: weak | improving | strong
  const filter = { user: req.user._id };
  if (status) filter.status = status;

  const topics = await WeakTopic.find(filter).sort({ accuracy: 1 });
  res.status(200).json({ success: true, data: { topics } });
});

module.exports = { listWeakTopics };
