const asyncHandler = require('../utils/asyncHandler');
const wildlifeService = require('../services/wildlife.service');
const storage = require('../services/storage');
const HttpError = require('../utils/httpError');
const { filesFrom, saveAll } = require('../utils/uploadFields');

const create = asyncHandler(async (req, res) => {
  // A PHOTO IS REQUIRED since 2026-10-12. It was optional before, which made
  // wildlife the one report kind that could arrive with nothing to look at -
  // and it is the kind where identification matters most, because the species
  // on the record decides priority review and whether the location is hidden on
  // the public map. Enforced here rather than in the validator so it cannot be
  // bypassed by a client that skips its own checks.
  const files = filesFrom(req, 'photo', 'photos');
  if (files.length === 0) {
    throw new HttpError(400, 'A photo is required. Attach one of the animal, taken from a safe distance.');
  }

  const { first: photoPath, all: photoPaths } = await saveAll(storage, 'wildlife', files);
  const turnover = await wildlifeService.createTurnover(req.user.user_id, req.body, photoPath, {
    ipAddress: req.ip,
    photoPaths,
  });
  res.status(201).json({ success: true, message: 'Wildlife turnover submitted.', data: { turnover: await storage.signFiles(turnover) } });
});

const listMine = asyncHandler(async (req, res) => {
  const turnovers = await wildlifeService.listMyTurnovers(req.user.user_id);
  res.json({ success: true, data: { turnovers: await storage.signFiles(turnovers) } });
});

const getByRef = asyncHandler(async (req, res) => {
  const turnover = await wildlifeService.getMyTurnoverByRef(req.user.user_id, req.params.referenceId);
  res.json({ success: true, data: { turnover: await storage.signFiles(turnover) } });
});

module.exports = { create, listMine, getByRef };
