// Resident-facing copy in Tagalog: status stages, timeline steps, the report
// kinds, and the guidance on the report forms.
//
// This is NOT an i18n system. There is no locale switch and no lookup at the
// call site. Two policies, and the difference between them matters:
//
//   1. INSTRUCTIONAL copy (form hints, empty states, page guidance) is ONE
//      casual Taglish line. The English sentence is gone, not demoted: a hint
//      that says the same thing twice makes a phone screen twice as long and
//      tells the reader that one of the two is the "real" one. Field LABELS and
//      button text stay short English, so they never wrap on a phone.
//   2. STATUS vocabulary (STAGE_TL, TIMELINE_TL) KEEPS its English companion.
//      Those keys are Prisma enum values that are translated nowhere else - a
//      staff member's screen, the status email and the printed PDF all say
//      "Resolved". A resident who only ever saw "Naayos na" would lose the
//      shared word the moment they phone the office. Do not drop the English
//      from the badge, the legend or the timeline.
//
// REGISTER: everyday conversational Tagalog, the way a Cabuyao resident would
// actually say it - NOT the formal register of a government memo. Deliberately
// avoided: isinasagawa, nakatakda, maglakip, kahilingan, upang, kabuuang.
// Loanwords that are genuinely the everyday word (status, report, litrato,
// landmark, iskedyul) are kept, because "kalagayan" and "iulat" read as stiffer
// than the English.
//
// Deliberately partial. Staff and admin surfaces stay English (office users,
// and the system terms have no settled Tagalog).

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

// Report-form field guidance. Each entry IS the hint under the field - one
// Taglish line, no English twin. The English label above it stays.
export const FORM_TL = {
  complaint_type: 'Pumili ng klase ng reklamo',
  request_type: 'Pumili ng serbisyo',
  type_other: 'Isulat kung ano ito',
  species_name: 'Pumili ng hayop',
  turnover_method: 'Dadalhin mo ba, o hihilingin mong sunduin ng CENRO?',
  turnover_walkin: 'Ikaw mismo ang magdadala sa CENRO office.',
  turnover_pickup: 'Hihilingin mong sunduin ito ng CENRO. Hindi ito garantisadong agad.',
  animal_condition: 'Pumili ng lagay ng hayop',
  barangay: 'Pumili ng barangay',
  description: 'Isulat ang nangyari',
  observed_at: 'Pumili ng petsa',
  location: 'Ituro sa mapa o isulat ang landmark',
  location_found: 'Ituro sa mapa kung saan mo nakita',
  location_service: 'Ituro sa mapa kung saan kailangan',
  address_details: 'Isulat ang kalye, purok, o landmark',
  photo: 'Maglagay ng litrato, pwedeng marami',
  // No longer used by any form - every upload is required since 2026-10-12.
  // Kept so an older bundle referencing it does not render `undefined`.
  photo_optional: 'Maglagay ng litrato, pwedeng marami',
  document: 'Litrato o dokumento, pwedeng marami',
  quantity: 'Isulat kung ilan (opsyonal)',
  schedule: 'Pumili ng petsa (opsyonal)',
  species_filter: 'I-type ang pangalan ng hayop, hal. "sawa"',
  species_none: 'Walang tugma. Piliin ang "Other" at ilarawan ang hayop',
  species_group_common: 'Karaniwang nakikita',
  species_group_endangered: 'Protektado o endangered',
  species_other: 'Wala sa listahan? Ilarawan mo na lang',
  species_also_called: 'Tinatawag ding',
  species_found_in: 'Karaniwang makikita sa',
  species_handling: 'Basahin ito bago lumapit sa hayop.',
  species_protected: 'Protektadong species ito. Mapupunta ang ulat na ito sa priority review, at nakatago ang eksaktong lokasyon nito sa public map.',
};

// Short Taglish lines used on empty states and page guidance.
export const COPY_TL = {
  noReports: 'Wala ka pang naipapasang ulat.',
  noReportsInTab: 'Wala pang ulat sa klaseng ito.',
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
  signedDocument: 'Nilagdaang dokumento',
  downloadCopy: 'I-download ang kopya ng ulat mo (PDF)',
  anonymousHint:
    'Hindi hihingin ang pangalan mo. Itago ang numero ng ulat para ma-check mo ito mamaya.',
};
