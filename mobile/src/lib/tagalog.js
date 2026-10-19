// Resident-facing copy in Tagalog: status stages, timeline steps, the report
// kinds, and the guidance on the report forms.
//
// DUPLICATE OF web/src/lib/tagalog.js. Mobile cannot import from web/src
// (see AGENTS.md), so the two copies must be kept in sync by hand. Everything
// below the header is intentionally byte-identical to the web copy - if you
// change a string here, change it there too.
//
// This is NOT an i18n system. There is no locale switch and no lookup at the
// call site. Two policies, and the difference between them matters:
//
//   1. INSTRUCTIONAL copy (form hints, empty states, page guidance) is ONE
//      Filipino line. The English sentence is gone, not demoted: a hint
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
// REGISTER: polite, plain Filipino (magalang at malinaw). This replaced an
// earlier "casual Taglish" register on 2026-10-19, after a defense panelist
// flagged it as impolite. The rules, all from that panel note:
//   - No "mo", "ka" or "ikaw". The possessive is "iyong" ("ang iyong ulat"),
//     as the panelist asked; elsewhere the sentence is built without a
//     second-person pronoun at all.
//   - A request starts with "Paki-" (Pakipili, Pakisulat, Pakilarawan), never a
//     bare command like "Isulat ang nangyari".
//   - The standard word over an English or colloquial one: palatandaan (not
//     landmark), kalagayan (not lagay), uri ng hayop (not species), tanggapan
//     (not office), larawan (not litrato), maaari (not pwede).
//   - No dismissive "na lang" ("Ilarawan mo na lang"). Where "only" is meant,
//     the word is "lamang".
//   - Where the English speaks in the resident's own voice (the turnover
//     options: "I will bring the animal..."), so does the Tagalog.
// "po" is left out on purpose: the panelist's own rewrites did not use it.
// The panelist also asked that Filipino majors review this copy, not just an AI
// translation. Until that review is recorded, treat every line as a draft.
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
    Completed: 'Tapos na',
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
    title: 'Maghain ng reklamo',
    desc: 'Ilegal na pagtatapon at pagsusunog ng basura, ingay, polusyon.',
  },
  wildlife: {
    title: 'Mag-ulat ng ligaw na hayop',
    desc: 'Iulat o dalhin sa CENRO ang hayop na iyong nailigtas.',
  },
  request: {
    title: 'Humiling ng serbisyo',
    desc: 'Punla, paghakot ng basura, paglilinis ng sapa.',
  },
};

export const STAT_TL = {
  'Total Reports': 'Lahat ng ulat',
  Active: 'Ginagawa pa',
  Resolved: 'Tapos na',
  'Wildlife Cases': 'Ligaw na hayop',
};

// Report-form field guidance. Each entry IS the hint under the field - one
// Filipino line, no English twin. The English label above it stays.
export const FORM_TL = {
  complaint_type: 'Pakipili ang uri ng reklamo',
  request_type: 'Pakipili ang serbisyong kailangan',
  request_disclaimer:
    'Maaaring may bayad ang ilang serbisyo, depende sa dami at layo; ipaaalam muna ito sa iyo bago itakda ang serbisyo. Karaniwang natatapos ito sa loob ng 3-5 araw ng trabaho matapos maaprubahan, depende sa uri ng serbisyo. Asahan ang unang tugon sa loob ng 24-48 oras matapos itong maipasa.',
  type_other: 'Pakisulat kung ano ito',
  species_name: 'Pakipili ang uri ng hayop',
  turnover_method: 'Pakipili kung paano makararating ang hayop sa CENRO',
  // In the resident's own voice, like the English option labels these sit
  // under ("I will bring the animal...", "Please send CENRO staff..."), so
  // neither line needs a "you" at all.
  turnover_walkin: 'Ako mismo ang magdadala ng hayop sa tanggapan ng CENRO.',
  turnover_pickup: 'Hihilingin ko sa CENRO na kunin ang hayop. Maaaring hindi ito magawa kaagad.',
  // Deliberately does NOT translate the escape clause of the English above it.
  // That sentence sends someone to a different radio button, and a Tagalog
  // paraphrase that drifted would be a safety instruction that disagrees with
  // itself. The English carries it; this covers the containment advice. Plain
  // commands here, not "Paki-": a safety warning should not read as optional.
  walkin_safety:
    'Dalhin lamang ang hayop kung ligtas itong gawin. Huwag itong hawakan nang walang proteksyon sa kamay. Kung maaari, ilagay ito sa matibay na kahon o lalagyang may butas para sa hangin, takpan, panatilihing tahimik, at ilayo sa mga bata at alagang hayop.',
  animal_condition: 'Pakipili ang kalagayan ng hayop',
  barangay: 'Pakipili ang barangay',
  // Shared by the complaint, wildlife and service-request forms, so it asks for
  // the situation rather than "what happened" - a seedling request has no
  // incident to describe.
  description: 'Pakilarawan nang malinaw ang sitwasyon',
  observed_at: 'Pakipili ang petsa kung kailan ito napansin',
  location: 'Pakituro sa mapa ang lugar, o magbigay ng palatandaan nito',
  location_found: 'Pakituro sa mapa kung saan nakita ang hayop',
  location_service: 'Pakituro sa mapa kung saan kailangan ang serbisyo',
  address_details: 'Pakisulat ang kalye o purok, o magbigay ng palatandaan ng lugar',
  // Shown when GPS puts the reporter outside the city. The point is still
  // pinned - this tells them why the map will not follow it. Mobile only.
  locationOutside: 'Nasa labas ng Cabuyao ang iyong lokasyon. Pakituro sa mapa ang tamang lugar sa loob ng Cabuyao.',
  photo: 'Pakilagay ng larawan. Maaaring higit sa isa.',
  // No longer used by any form - every upload is required since 2026-10-12.
  // Kept so an older bundle referencing it does not render `undefined`.
  photo_optional: 'Pakilagay ng larawan. Maaaring higit sa isa.',
  document: 'Pakilagay ng larawan o dokumento. Maaaring higit sa isa.',
  quantity: 'Pakisulat kung ilan (hindi sapilitan)',
  schedule: 'Pakipili ang nais na petsa (hindi sapilitan)',
  species_filter: 'Pakisulat ang pangalan ng hayop, hal. "sawa"',
  species_none: 'Walang katugmang hayop. Pakipili ang "Other" at ilarawan ito.',
  species_group_common: 'Karaniwang nakikita',
  species_group_endangered: 'Protektado o nanganganib na uri',
  species_other: 'Wala sa pagpipilian? Pakilarawan ang uri ng hayop.',
  species_also_called: 'Tinatawag ding',
  species_found_in: 'Karaniwang makikita sa',
  species_handling: 'Pakibasa muna ito bago lumapit sa hayop.',
  species_protected:
    'Ito ay protektadong uri ng hayop. Uunahing suriin ang ulat na ito, at hindi ipakikita ang eksaktong lokasyon nito sa pampublikong mapa.',
};

// Empty states, page guidance and the submit confirmation.
export const COPY_TL = {
  noReports: 'Wala pang naipapasang ulat.',
  noReportsInTab: 'Wala pang ulat sa uring ito.',
  // Follows noReports on the dashboard, where the three actions sit above it.
  startHint: 'Pakipili ang nais gawin sa itaas para makapagsimula.',
  legendIntro: 'Ano ang ibig sabihin ng bawat kulay',
  trackHint: 'Pakilagay ang numero ng iyong ulat para makita ang katayuan nito.',
  updatesFromCenro: 'Mga update mula sa CENRO',
  notifications: 'Mga abiso',
  // Describes the screen, not a delivery promise: what reaches this list is
  // decided by the server, and an anonymous report never appears here at all.
  noNotifications: 'Wala pang abiso. Dito lalabas ang mga ito kapag may bagong update sa iyong ulat.',
  confirmEmail: 'Pakikumpirma ang iyong email',
  confirmEmailWhy: 'Dito ipadadala ng CENRO ang mga update tungkol sa iyong ulat.',
  wrongAddress: 'Mali ang address? Pakipalitan dito.',
  // Mobile only - the web reset page has no Tagalog line.
  forgotPassword: 'Nakalimutan ang password?',
  forgotPasswordWhy: 'Pakilagay ang iyong email at magpapadala kami ng link para makagawa ng bagong password.',
  // Deliberately says "kung" (if) - the server answers the same way whether or
  // not the address has an account, and this line must not contradict that.
  forgotPasswordSent:
    'Kung may account na nakarehistro sa email na ito, nakapagpadala na kami ng link. Pakitingnan din ang spam folder.',
  // RESET_TTL_MINUTES is 60 and the token is single-use (auth.service.js).
  forgotPasswordOpens:
    'Magbubukas ang link sa iyong browser, at doon mapapalitan ang iyong password. Magagamit lamang ito nang isang beses at sa loob ng isang oras.',
  progress: 'Katayuan ng ulat',
  description: 'Detalye',
  attachment: 'Kalakip na file',
  cenroNotes: 'Mga tala mula sa CENRO',
  signedDocument: 'Nilagdaang dokumento',
  downloadCopy: 'I-download ang kopya ng iyong ulat (PDF)',
  anonymousHint:
    'Hindi hihingin ang iyong pangalan. Pakitago ang numero ng ulat para matingnan ang katayuan nito sa ibang pagkakataon.',
  // The confirmation every signed-in report form asks before sending. Only for
  // a report filed under the resident's own name: an anonymous one never
  // appears in My Reports, and its form says so in its own (English) dialog.
  submitTitle: 'Ipadala na sa CENRO?',
  submitBody: 'Matatanggap agad ito ng CENRO, at masusubaybayan ang katayuan nito sa My Reports.',
  submitConfirm: 'Ipadala',
  submitCancel: 'Hindi pa',
};
