// Display labels for the two descriptive species fields shown to residents:
// `indicator` (conservation standing) and `hazard` (danger to a person near the
// animal).
//
// These are SEPARATE fields on purpose and must never be collapsed into one
// badge: a Reticulated Python is Native but dangerous, and a Philippine Duck is
// Vulnerable but harmless.
//
// A DUPLICATE of web/src/lib/speciesLabels.js, deliberately: mobile is a
// separate app and cannot import from web/src (see mobile/AGENTS.md). Keep the
// two in sync - a safety label that disagrees between the phone and the website
// is worse than no label.

// Written out rather than run through humanize(), which would print
// "Powerful Bite Or Talons". These are read by someone standing near the animal,
// so each one is phrased as the warning rather than as an enum value.
const HAZARD_LABEL = {
  Venomous: 'Venomous',
  Aggressive: 'Can be aggressive',
  Disease_Risk: 'Disease risk',
  Powerful_Bite_Or_Talons: 'Powerful bite or talons',
};

// `None` is a real value, not a missing one: it means "no particular danger",
// which is not something to print a warning about.
const hasHazard = (hazard) => Boolean(hazard) && hazard !== 'None';

module.exports = { HAZARD_LABEL, hasHazard };
