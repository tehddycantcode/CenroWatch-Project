// Upload / remove the signed closure document on a case.
//
// Its own endpoint rather than a field on the status PATCH, because the signed
// form comes back from the CENRO head or a receiving department DAYS after the
// work is finished. Folding it into the closing transition would mean a case
// cannot be closed until the paperwork returns.

const asyncHandler = require('../utils/asyncHandler');
const service = require('../services/closureCertificate.service');
const storage = require('../services/storage');
const HttpError = require('../utils/httpError');

// Which key the reloaded record is returned under, matching the existing staff
// endpoints so the clients need no special case.
const PAYLOAD_KEY = { complaint: 'complaint', wildlife: 'turnover', request: 'request' };

function upload(kind) {
  return asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(422, 'Attach the signed document (PDF or image).');
    // Minted HERE from the uploaded file, never read from the body: otherwise a
    // caller could post any string and point the record at an arbitrary path.
    const storedPath = await storage.save('certificates', req.file);
    const record = await service.setCertificate(kind, req.user.user_id, req.params.id, storedPath, {
      ipAddress: req.ip,
    });
    res.status(201).json({
      success: true,
      message: 'Signed closure document attached. The resident can now download it.',
      data: { [PAYLOAD_KEY[kind]]: await storage.signFiles(record) },
    });
  });
}

function remove(kind) {
  return asyncHandler(async (req, res) => {
    const record = await service.clearCertificate(kind, req.user.user_id, req.params.id, {
      ipAddress: req.ip,
    });
    res.json({
      success: true,
      message: 'Signed closure document removed.',
      data: { [PAYLOAD_KEY[kind]]: await storage.signFiles(record) },
    });
  });
}

module.exports = {
  uploadComplaint: upload('complaint'),
  uploadWildlife: upload('wildlife'),
  uploadRequest: upload('request'),
  removeComplaint: remove('complaint'),
  removeWildlife: remove('wildlife'),
  removeRequest: remove('request'),
};
