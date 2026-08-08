// Plain-language privacy notice shown before a resident consents.
//
// R.A. 10173 requires consent to be INFORMED, so the checkbox on its own is
// not enough: this is what the resident can actually read first. Every claim
// here describes what the system really does. If the data flows change, this
// text has to change with them.
//
// Mobile cannot import from web/src, so mobile/src/lib/privacy.js carries a
// copy. Keep the two in sync (see mobile/AGENTS.md).

export const PRIVACY_SUMMARY =
  'CENRO Cabuyao collects your name, email, and report details so staff can act on what you report and keep you updated. Your personal details are never shown on the public map or feed, and you can report anonymously instead.';

export const PRIVACY_UPDATED = 'August 2026';

export const PRIVACY_SECTIONS = [
  {
    title: 'Who is collecting your data',
    body: [
      'The City Environment and Natural Resources Office (CENRO) of Cabuyao City, Laguna, through the CENROWATCH system.',
    ],
  },
  {
    title: 'What we collect',
    body: [
      'When you create an account: your first and last name, email address, and password. Your contact number and barangay are optional.',
      'When you file a report: your description of the concern, the photo you attach, the barangay, and, if you choose to pin it, the location coordinates and address details.',
      'Your password is stored only as an encrypted hash. Nobody at CENRO can read it, including administrators.',
    ],
  },
  {
    title: 'Why we collect it',
    body: [
      'To receive your report, route it to the right CENRO staff, and act on it.',
      'To keep you updated: you are notified in the app and by email when the status of your report changes.',
      'To let CENRO see where environmental concerns are concentrated, so it can plan its response. These summaries count reports per barangay and never identify who filed them.',
    ],
  },
  {
    title: 'Who can see it',
    body: [
      'CENRO staff and administrators, who need it to act on your report and contact you about it.',
      'The public map, the reports feed, and the tracking page show ZERO personal information. They show only the type of report, its status, and the barangay. Your name, email, and contact number are never published.',
      'Exact locations of endangered species are deliberately blurred on public maps to discourage poaching.',
    ],
  },
  {
    title: 'How it is protected',
    body: [
      'Access is restricted by role, so a resident account cannot open another resident report.',
      'Every action taken on a record is written to an audit log, including who did it and when.',
      'Reports are retained as part of CENRO records. An administrator can archive a report to remove it from day to day use, but the record and its history are kept rather than destroyed.',
    ],
  },
  {
    title: 'Reporting without giving your identity',
    body: [
      'You can file a report anonymously and no identity is collected at all. You still get a reference number to follow it up.',
      'Because there is no contact information, CENRO cannot send you updates on an anonymous report and cannot ask you follow-up questions.',
    ],
  },
  {
    title: 'Your rights',
    body: [
      'Under the Data Privacy Act of 2012 (R.A. 10173) you may ask to see the personal data CENRO holds about you, have it corrected if it is wrong, object to how it is processed, or withdraw your consent.',
      'You can update your name, contact number, and barangay yourself from your profile at any time.',
      'To make any other request, contact CENRO Cabuyao. If you believe your rights have been violated, you may file a complaint with the National Privacy Commission.',
    ],
  },
];
