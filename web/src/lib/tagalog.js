// Tagalog companions for the resident-facing copy that has to be understood
// correctly, not just read: status stages, timeline steps, the report kinds,
// and the guidance on the report forms.
//
// This is NOT an i18n system. There is no locale switch and no lookup at the
// call site - English stays the primary label and the Tagalog sits beside or
// beneath it, so a resident who reads either one gets the same meaning. That
// keeps every component's logic untouched: nothing here can change what a
// status IS, only how it is explained.
//
// Deliberately partial. Staff and admin surfaces stay English (office users,
// and the system terms have no settled Tagalog), and short button labels stay
// English so they never wrap onto a second line on a phone.

// The three resident-facing lifecycle stages (see statusStage in lib/reports.js)
// plus the two terminal exceptions. Keyed by the English label those return.
export const STAGE_TL = {
  Submitted: 'Naisumite',
  'Under review': 'Sinusuri',
  Finished: 'Tapos na',
  Rejected: 'Tinanggihan',
  Deceased: 'Namatay',
};

// Timeline steps, per report kind - "Released" means a released animal for a
// wildlife turnover but a delivered service for a request, so one flat map
// would mistranslate it.
export const TIMELINE_TL = {
  complaint: {
    Submitted: 'Naisumite',
    'Under Review': 'Sinusuri',
    'In Progress': 'Isinasagawa',
    Resolved: 'Nalutas',
  },
  wildlife: {
    Submitted: 'Naisumite',
    'Under Review': 'Sinusuri',
    'In Progress': 'Inaasikaso',
    Completed: 'Natapos',
  },
  request: {
    Submitted: 'Naisumite',
    'Under Review': 'Sinusuri',
    Scheduled: 'Nakatakda',
    Released: 'Naibigay',
  },
};

export const KIND_TL = {
  complaint: 'Reklamo',
  wildlife: 'Ligaw na hayop',
  request: 'Kahilingan sa serbisyo',
};

// Resident dashboard: the three things someone comes here to do.
export const ACTION_TL = {
  '/resident/report-complaint': {
    title: 'Maghain ng reklamo',
    desc: 'Iligal na pagtatapon, pagsusunog, ingay, polusyon.',
  },
  '/resident/report-wildlife': {
    title: 'Pagsuko ng ligaw na hayop',
    desc: 'Iulat o isuko ang nasagip na hayop.',
  },
  '/resident/request-service': {
    title: 'Humiling ng serbisyo',
    desc: 'Punla, paghakot ng basura, paglilinis ng sapa.',
  },
};

export const STAT_TL = {
  'Total Reports': 'Kabuuang ulat',
  Active: 'Ginagawa pa',
  Resolved: 'Nalutas',
  'Wildlife Cases': 'Kaso ng hayop',
};

// Report-form field guidance. Each entry pairs with the English label/hint
// already on the field; the Tagalog is shown as a second line.
export const FORM_TL = {
  complaint_type: 'Uri ng reklamo',
  request_type: 'Uri ng serbisyong hinihiling',
  species_name: 'Pangalan ng hayop, kung alam mo',
  animal_condition: 'Kalagayan ng hayop',
  barangay: 'Piliin ang iyong barangay',
  description: 'Ano ang nangyari? Isama ang oras, amoy, o gaano na katagal.',
  observed_at: 'Kailan mo ito nakita?',
  location: 'Opsyonal: itakda kung saan ito nangyari.',
  photo: 'Maglakip ng kahit isang larawan bilang ebidensya.',
  document: 'Opsyonal: maglakip ng sulat o dokumento.',
  quantity: 'Ilan ang kailangan mo?',
  schedule: 'Kailan mo ito gusto?',
};

// Short bilingual lines used on empty states and page guidance.
export const COPY_TL = {
  noReports: 'Wala ka pang naisumiteng ulat.',
  legendIntro: 'Ano ang ibig sabihin ng bawat kulay',
  trackHint: 'Ipasok ang numero ng iyong ulat upang makita ang kalagayan nito.',
  updatesFromCenro: 'Mga update mula sa CENRO',
  progress: 'Kalagayan ng ulat',
  description: 'Paglalarawan',
  attachment: 'Nakalakip',
  cenroNotes: 'Paalala mula sa CENRO',
  anonymousHint:
    'Hindi hihingin ang iyong pangalan. Itago ang numero ng ulat upang masubaybayan mo ito.',
};
