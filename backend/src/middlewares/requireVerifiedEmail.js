// Requires a CONFIRMED email address. Use AFTER `authenticate`:
//   router.post('/', upload.single('photo'), requireVerifiedEmail, rules, validate, handler)
//
// Email confirmation used to be a SOFT gate - an unconfirmed resident could sign
// in and file reports normally, and the only thing withheld was a password reset.
// It is a hard gate on filing now. Reads are deliberately still open: an
// unconfirmed resident must keep seeing reports they filed before this existed.
//
// NOT SCOPED BY ROLE, on purpose. The check asserts a property of the CREDENTIAL
// - this address has been proven - rather than of the role. That costs nothing
// today, because every non-Resident is verified by construction (the backfill
// migration stamped existing rows; admin-created accounts and create-admin.js
// stamp at creation), so it is a no-op for them. Scoping it to 'Resident' would
// instead mean any future non-resident signup path silently bypasses the gate.
// Staff filing on someone's behalf go through POST /staff/complaints, which is a
// different router and is not gated.
//
// DELIBERATELY OUTSIDE THIS GATE: POST /complaints/anonymous, which is public and
// has no account to confirm, and every GET.
//
// It depends on `email_verified_at` being on req.user, which authenticate selects.
// tests/emailVerificationGate.test.js asserts that select, not just this rule -
// if the column is ever dropped to keep req.user lean, undefined is falsy and
// this would start refusing every request with no error to point at.
function requireVerifiedEmail(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Authentication required.' });
  }

  if (!req.user.email_verified_at) {
    // 403, not 422: the request is well-formed and the role is allowed: the
    // credential has an unmet precondition. Same shape as authorize.js.
    //
    // THIS SENTENCE HAS TO WORK ON ITS OWN. mobile/src/components/ErrorBanner.js
    // renders `message` verbatim, and an installed APK built before this change
    // has no UI for the refusal - so the message is the entire instruction. It
    // names the Home screen because VerifyEmailCard already lives there, which is
    // what makes the refusal actionable on a build that predates the gate.
    return res.status(403).json({
      success: false,
      message:
        'Confirm your email address before filing a report. Open the app\'s Home screen '
        + 'and enter the 6-digit code we emailed you, or tap Resend code.',
    });
  }

  return next();
}

module.exports = requireVerifiedEmail;
