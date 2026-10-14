import { AlertTriangle } from 'lucide-react';
import { FORM_TL } from '@/lib/tagalog';

// What a resident is told to expect before sending a service request: that some
// services cost money, that approval takes time, and roughly when they will hear
// back. Shown on the form AND summarised in the confirmation dialog, so the
// expectation is set before they commit rather than discovered afterwards.
//
// The copy states expectations ("most", "usually"), NOT guarantees, on purpose:
// a flat "we reply within 24 hours" would be a promise the office cannot keep
// for every request, and a promise in user-facing copy is a feature commitment
// (see CLAUDE.md). Keep the three points in step with the mobile twin,
// mobile/src/components/RequestDisclaimer.js — the two apps cannot share a file.
export const DISCLAIMER_POINTS = [
  ['Payment', 'Some requests may require payment. Any fee depends on the volume and distance, and is confirmed with you before the service is scheduled.'],
  ['Processing time', 'Most requests are completed within 3-5 working days after approval, depending on the service.'],
  ['Expected reply', 'Expect an initial response within 24-48 hours of submitting.'],
];

export default function RequestDisclaimer() {
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
        <p className="text-sm font-semibold text-amber-900">Please read before submitting</p>
      </div>
      <div className="mt-2 space-y-1.5">
        {DISCLAIMER_POINTS.map(([term, desc]) => (
          <p key={term} className="text-sm leading-snug text-amber-900">
            <span className="font-semibold">{term}:</span> {desc}
          </p>
        ))}
      </div>
      <p className="mt-2 text-xs text-amber-800">{FORM_TL.request_disclaimer}</p>
    </div>
  );
}
