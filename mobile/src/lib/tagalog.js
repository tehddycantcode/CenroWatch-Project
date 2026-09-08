// Tagalog companions for the resident-facing copy that has to be understood
// correctly, not just read: status stages, timeline steps, the report kinds,
// and the guidance on the report forms.
//
// DUPLICATE OF web/src/lib/tagalog.js. Mobile cannot import from web/src
// (see AGENTS.md), so the two copies must be kept in sync by hand. Everything
// below the header is intentionally byte-identical to the web copy - if you
// change a string here, change it there too.
//
// This is NOT an i18n system. There is no locale switch and no lookup at the
// call site - English stays the primary label and the Tagalog sits beside or
// beneath it, so a resident who reads either one gets the same meaning. That
// keeps every component's logic untouched: nothing here can change what a
// status IS, only how it is explained.
//
// REGISTER: everyday conversational Tagalog, the way a Cabuyao resident would
// actually say it - NOT the formal register of a government memo. Deliberately
// avoided: isinasagawa, nakatakda, maglakip, kahilingan, upang, kabuuang.
// Loanwords that are genuinely the everyday word (status, report, iskedyul)
// are kept, because "kalagayan" and "iulat" read as stiffer than the English.
//
// Deliberately partial. Staff and admin surfaces stay English (office users,
// and the system terms have no settled Tagalog), and short button labels stay
// English so they never wrap onto a second line on a phone.

// The three resident-facing lifecycle stages (see statusStage in lib/reports.js)
// plus the two terminal exceptions. Keyed by the English label those return.
export const STAGE_TL = {
  Submitted: 'Naipasa na',
  'Under review': 'Tinitingnan na',
  Finished: 'Tapos na',
  Rejected: 'Hindi tinanggap',
  Deceased: 'Namatay',
};

// Timeline steps, per report kind - "Released" means a released animal for a
// wildlife turnover but a delivered service for a request, so one flat map
// would mistranslate it.
export const TIMELINE_TL = {
  complaint: {
    Submitted: 'Naipasa na',
    'Under Review': 'Tinitingnan na',
    Approved: 'Tinanggap na',
    'In Progress': 'Ginagawa na',
    Resolved: 'Naayos na',
  },
  wildlife: {
    Submitted: 'Naipasa na',
    'Under Review': 'Tinitingnan na',
    'In Progress': 'Inaasikaso na',
    Completed: 'Tapos na',
  },
  request: {
    Submitted: 'Naipasa na',
    'Under Review': 'Tinitingnan na',
    Scheduled: 'May iskedyul na',
    Released: 'Naibigay na',
  },
};

export const KIND_TL = {
  complaint: 'Reklamo',
  wildlife: 'Ligaw na hayop',
  request: 'Hiling na serbisyo',
};

// Resident dashboard: the three things someone comes here to do. Keyed by
// report kind, not by route - web routes by path and mobile by screen name,
// and the kind is the one identifier both already carry.
export const ACTION_TL = {
  complaint: {
    title: 'Mag-report ng reklamo',
    desc: 'Basurang itinapon kahit saan, sunog, ingay, polusyon.',
  },
  wildlife: {
    title: 'Mag-report ng ligaw na hayop',
    desc: 'I-report o dalhin sa CENRO ang hayop na nailigtas mo.',
  },
  request: {
    title: 'Mag-request ng serbisyo',
    desc: 'Punla, hakot ng basura, linis ng sapa.',
  },
};

export const STAT_TL = {
  'Total Reports': 'Lahat ng ulat',
  Active: 'Ginagawa pa',
  Resolved: 'Tapos na',
  'Wildlife Cases': 'Ligaw na hayop',
};

// Report-form field guidance. Each entry pairs with the English label/hint
// already on the field; the Tagalog is shown as a second line.
export const FORM_TL = {
  complaint_type: 'Anong klaseng reklamo?',
  request_type: 'Anong serbisyo ang kailangan mo?',
  species_name: 'Anong hayop? Kung alam mo.',
  animal_condition: 'Kumusta ang lagay ng hayop?',
  barangay: 'Piliin ang barangay mo',
  description: 'Ano ang nangyari? Ilagay ang oras, amoy, o gaano na katagal.',
  observed_at: 'Kailan mo ito nakita?',
  location: 'Pwedeng laktawan. Ituro sa mapa kung saan ito nangyari.',
  photo: 'Maglagay ng kahit isang litrato bilang patunay.',
  document: 'Pwedeng laktawan. Pwede kang maglagay ng sulat o dokumento.',
  quantity: 'Ilan ang kailangan mo?',
  schedule: 'Kailan mo ito gusto?',
};

// Short bilingual lines used on empty states and page guidance.
export const COPY_TL = {
  noReports: 'Wala ka pang naipapasang ulat.',
  legendIntro: 'Ano ang ibig sabihin ng bawat kulay',
  trackHint: 'Ilagay ang numero ng ulat mo para makita ang status nito.',
  updatesFromCenro: 'Mga update mula sa CENRO',
  notifications: 'Mga abiso',
  noNotifications: 'Wala ka pang abiso. Sasabihan ka namin kapag may bago sa ulat mo.',
  confirmEmail: 'Kumpirmahin ang email mo',
  confirmEmailWhy: 'Dito ipapadala ng CENRO ang update sa ulat mo.',
  wrongAddress: 'Mali ang address? Palitan mo.',
  progress: 'Status ng ulat',
  description: 'Detalye',
  attachment: 'Kalakip na file',
  cenroNotes: 'Paalala mula sa CENRO',
  anonymousHint:
    'Hindi hihingin ang pangalan mo. Itago ang numero ng ulat para ma-check mo ito mamaya.',
};
