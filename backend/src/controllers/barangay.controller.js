// Barangay controllers — thin HTTP layer over barangay.service.

const asyncHandler = require('../utils/asyncHandler');
const barangayService = require('../services/barangay.service');

const list = asyncHandler(async (req, res) => {
  const barangays = await barangayService.listBarangays();
  res.status(200).json({ success: true, data: { barangays } });
});

module.exports = { list };
