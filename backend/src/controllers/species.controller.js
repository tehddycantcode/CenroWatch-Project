// Species catalogue controllers — thin HTTP layer over species.service.

const asyncHandler = require('../utils/asyncHandler');
const speciesService = require('../services/species.service');
const storage = require('../services/storage');

// Public: the species a resident may pick on the wildlife form, and the content
// behind the public species guide. Zero personal data, so it is safe
// unauthenticated (R.A. 10173).
const listActive = asyncHandler(async (req, res) => {
  const data = await speciesService.listActive();
  res.status(200).json({ success: true, data: await storage.signFiles(data) });
});

module.exports = { listActive };
