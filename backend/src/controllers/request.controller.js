const asyncHandler = require('../utils/asyncHandler');
const requestService = require('../services/request.service');
const storage = require('../services/storage');
const HttpError = require('../utils/httpError');
const { filesFrom, saveAll } = require('../utils/uploadFields');

const create = asyncHandler(async (req, res) => {
  // AN ATTACHMENT IS REQUIRED since 2026-10-12, and either kind satisfies it: a
  // photo of the place, or a document. Both go through DOC_MIME, so the only
  // difference is which column they land in - and a resident asking for a creek
  // clean-up has a photo rather than a letter, while one asking for a permit
  // has the opposite. Demanding a specific one would refuse half of them for
  // having the wrong sort of evidence.
  const photoFiles = filesFrom(req, 'photo', 'photos');
  const docFiles = filesFrom(req, 'document', 'documents');
  if (photoFiles.length === 0 && docFiles.length === 0) {
    throw new HttpError(400, 'Attach at least one photo or document showing what the request is about.');
  }

  const photos = await saveAll(storage, 'requests', photoFiles);
  const docs = await saveAll(storage, 'requests', docFiles);
  const request = await requestService.createRequest(req.user.user_id, req.body, docs.first, {
    ipAddress: req.ip,
    documentPaths: docs.all,
    photoPath: photos.first,
    photoPaths: photos.all,
  });
  res.status(201).json({ success: true, message: 'Service request submitted.', data: { request: await storage.signFiles(request) } });
});

const listMine = asyncHandler(async (req, res) => {
  const requests = await requestService.listMyRequests(req.user.user_id);
  res.json({ success: true, data: { requests: await storage.signFiles(requests) } });
});

const getByTracking = asyncHandler(async (req, res) => {
  const request = await requestService.getMyRequestByTracking(req.user.user_id, req.params.trackingId);
  res.json({ success: true, data: { request: await storage.signFiles(request) } });
});

module.exports = { create, listMine, getByTracking };
