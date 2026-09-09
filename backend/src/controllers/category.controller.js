// Report-category controllers — thin HTTP layer over category.service.

const asyncHandler = require('../utils/asyncHandler');
const categoryService = require('../services/category.service');

// Public: the categories a resident may pick on a report form. Zero personal
// data, so it is safe unauthenticated (R.A. 10173).
const listActive = asyncHandler(async (req, res) => {
  const categories = await categoryService.listActive();
  res.status(200).json({ success: true, data: categories });
});

// Admin: everything, including retired categories and how many reports use each.
const listAll = asyncHandler(async (req, res) => {
  const categories = await categoryService.listAll();
  res.json({ success: true, data: categories });
});

const createType = asyncHandler(async (req, res) => {
  const category = await categoryService.createType(req.params.kind, req.user.user_id, req.body, { ipAddress: req.ip });
  res.status(201).json({ success: true, message: 'Category created.', data: { category } });
});

const updateType = asyncHandler(async (req, res) => {
  const category = await categoryService.updateType(req.params.kind, req.user.user_id, req.params.id, req.body, { ipAddress: req.ip });
  res.json({ success: true, message: 'Category updated.', data: { category } });
});

module.exports = { listActive, listAll, createType, updateType };
