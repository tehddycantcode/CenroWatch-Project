// The "Other" catch-all category, and how a resident's typed detail reaches
// staff.
//
// Complaint.complaint_type and EnvironmentalRequest.request_type are FOREIGN
// KEYS into the admin-managed category tables, so a value the resident types
// cannot be stored there - it would break the key and let residents invent
// categories. The typed detail is folded into the description instead, as its
// first line, so it is the first thing staff read. The queue still shows only
// "Other"; this line is the earliest point at which anyone learns what was
// actually reported.
//
// COUPLING, DELIBERATELY IN ONE PLACE: detection keys off the seeded category
// names. If an Administrator renames "Other" or "Other_Service" in the
// Categories screen, the specify box stops appearing. Keeping that string here
// rather than in five forms means there is one line to change when it happens.
//
// Pure, import-free, and module.exports for the same reason as pushDecision.js
// and backAction.js: it keeps the only testable part of this within reach of a
// plain node jest with no babel step.

// Exact matches, not a prefix: an Administrator adding "Other_Waste" has
// created a real category with its own meaning, not a prompt to type something.
const OTHER_NAMES = ['other', 'other_service'];

// What the resident may type, and the server's own description limit
// (validators: 10-5000 characters). The combined text has to respect the
// latter, or the API answers 422 and the resident sees a confusing error about
// a field they never touched.
const OTHER_DETAIL_MAX = 100;
const DESCRIPTION_MAX = 5000;

function isOtherCategory(name) {
  if (!name) return false;
  return OTHER_NAMES.includes(String(name).trim().toLowerCase());
}

/**
 * Fold the typed detail into the description as its first line.
 * Returns the description unchanged when there is nothing to add.
 */
function withOtherDetail(description, specify) {
  const detail = String(specify || '').trim();
  if (!detail) return description;
  return `Other: ${detail}\n\n${description}`;
}

module.exports = {
  OTHER_DETAIL_MAX,
  DESCRIPTION_MAX,
  isOtherCategory,
  withOtherDetail,
};
