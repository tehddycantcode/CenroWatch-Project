// Display labels and tones for the two descriptive species fields that are
// shown to residents: `indicator` (conservation standing) and `hazard` (danger
// to a person near the animal).
//
// These are SEPARATE fields on purpose and must never be collapsed into one
// badge: a Reticulated Python is Native but dangerous, and a Philippine Duck is
// Vulnerable but harmless. An older map keyed on display strings and carried
// 'Caution: Venomous' as if it were a conservation category; that is the bug
// this split exists to prevent.
//
// Lives here rather than on a page because both the public species guide and
// the resident wildlife form render them, and a safety label that disagrees
// between the two screens is worse than no label. Mobile keeps its own copy at
// mobile/src/lib/speciesLabels.js - a separate app cannot import from web/src.

export const INDICATOR_TONE = {
  Common: { bg: 'bg-slate-100', fg: 'text-slate-700' },
  Native: { bg: 'bg-emerald-100', fg: 'text-emerald-800' },
  Endemic: { bg: 'bg-purple-100', fg: 'text-purple-800' },
  Near_Threatened: { bg: 'bg-orange-100', fg: 'text-orange-800' },
  Vulnerable: { bg: 'bg-amber-100', fg: 'text-amber-800' },
  Endangered: { bg: 'bg-red-100', fg: 'text-red-800' },
  Critically_Endangered: { bg: 'bg-red-200', fg: 'text-red-900' },
};

export const HAZARD_TONE = { bg: 'bg-red-100', fg: 'text-red-800' };

// Written out rather than run through humanize(), which would print
// "Powerful Bite Or Talons". These are read by someone standing near the animal,
// so each one is phrased as the warning rather than as an enum value.
export const HAZARD_LABEL = {
  Venomous: 'Venomous',
  Aggressive: 'Can be aggressive',
  Disease_Risk: 'Disease risk',
  Powerful_Bite_Or_Talons: 'Powerful bite or talons',
};

export const BADGE = 'rounded px-2 py-0.5 text-xs font-semibold';

// `None` is a real value, not a missing one: it means "no particular danger",
// which is not something to print a red badge about.
export const hasHazard = (hazard) => Boolean(hazard) && hazard !== 'None';
