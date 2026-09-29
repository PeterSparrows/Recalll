const { Course, Material } = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

// POST /api/courses
const createCourse = asyncHandler(async (req, res) => {
  const { code, title, description } = req.body;

  const course = await Course.create({
    user: req.user._id,
    code,
    title,
    description: description || '',
  });

  res.status(201).json({ success: true, message: 'Course created.', data: { course } });
});

// GET /api/courses
const listCourses = asyncHandler(async (req, res) => {
  const { status } = req.query; // optional filter: active | archived
  const filter = { user: req.user._id };
  if (status) filter.status = status;

  const courses = await Course.find(filter).sort({ createdAt: -1 });

  // Attach a material count per course so the UI doesn't need N extra requests
  const counts = await Material.aggregate([
    { $match: { user: req.user._id, course: { $ne: null } } },
    { $group: { _id: '$course', count: { $sum: 1 } } },
  ]);
  const countMap = new Map(counts.map((c) => [c._id.toString(), c.count]));

  const withCounts = courses.map((c) => ({
    ...c.toObject(),
    material_count: countMap.get(c._id.toString()) || 0,
  }));

  res.status(200).json({ success: true, data: { courses: withCounts } });
});

// GET /api/courses/:id
const getCourse = asyncHandler(async (req, res) => {
  const course = await Course.findOne({ _id: req.params.id, user: req.user._id });
  if (!course) throw new ApiError(404, 'Course not found.');
  res.status(200).json({ success: true, data: { course } });
});

// PATCH /api/courses/:id  (rename / update description)
const updateCourse = asyncHandler(async (req, res) => {
  const { title, description, code } = req.body;

  const course = await Course.findOne({ _id: req.params.id, user: req.user._id });
  if (!course) throw new ApiError(404, 'Course not found.');

  if (title !== undefined) course.title = title;
  if (description !== undefined) course.description = description;
  if (code !== undefined) course.code = code;

  await course.save();
  res.status(200).json({ success: true, message: 'Course updated.', data: { course } });
});

// PATCH /api/courses/:id/archive
const archiveCourse = asyncHandler(async (req, res) => {
  const course = await Course.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    { status: 'archived' },
    { new: true }
  );
  if (!course) throw new ApiError(404, 'Course not found.');
  res.status(200).json({ success: true, message: 'Course archived.', data: { course } });
});

// PATCH /api/courses/:id/unarchive
const unarchiveCourse = asyncHandler(async (req, res) => {
  const course = await Course.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    { status: 'active' },
    { new: true }
  );
  if (!course) throw new ApiError(404, 'Course not found.');
  res.status(200).json({ success: true, message: 'Course unarchived.', data: { course } });
});

// DELETE /api/courses/:id
// Deleting a course must NOT delete its materials — only unlink them,
// per the spec. We do this in two steps rather than a Mongo
// transaction because a single-node dev MongoDB may not have a
// replica set (required for multi-document transactions); the README
// notes this tradeoff and how to make it transactional in production.
const deleteCourse = asyncHandler(async (req, res) => {
  const course = await Course.findOne({ _id: req.params.id, user: req.user._id });
  if (!course) throw new ApiError(404, 'Course not found.');

  await Material.updateMany({ course: course._id, user: req.user._id }, { $set: { course: null } });
  await course.deleteOne();

  res.status(200).json({ success: true, message: 'Course deleted. Its materials were kept and unlinked.' });
});

module.exports = {
  createCourse,
  listCourses,
  getCourse,
  updateCourse,
  archiveCourse,
  unarchiveCourse,
  deleteCourse,
};
