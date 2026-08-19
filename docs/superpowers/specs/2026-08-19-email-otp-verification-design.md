# Email OTP Verification for Resident Registration - Design

Date: 2026-08-19
Status: Approved (brainstormed with user; soft gate + self-service email correction)

## Problem

`register()` in `backend/src/services/auth.service.js` creates the account and
returns a JWT immediately. The address is never checked, and nothing in the
system can repair a wrong one:

1. A resident cannot change their own email. `updateProfile` says so outright:
   "Email and role are intentionally NOT editable here."
2. An Admin cannot change it either. `updateUserRules` in
   `backend/src/validators/admin.validators.js` accepts role, is_active, names,
   contact number and barangay - there is no email field.
3. Password reset mails to that same address, as does every status update.
4. `sendMail` never throws and never reports failure; it returns
   `{ sent: false }` and logs to the server console.

So a resident who mistypes their address at registration is permanently locked
out and nobody ever finds out. They cannot fix it, staff cannot fix it, the
Admin cannot fix it, password reset is dead, and every status email is
discarded in silence.

Note what this problem is NOT. Anonymous reporting already exists
(`POST /complaints/anonymous`), so verification is not a spam gate - somebody
who wants to file junk does not need an account. The case for this feature is
deliverability and account recovery, and it should be argued that way in the
manuscript.

## Goals

- Catch a mistyped email at the moment it is still correctable.
- Give an unverified resident a self-service route to the correct address.
- Refuse password reset on an unverified address, so a reset link can never be
  mailed somewhere the account owner cannot read.
- Leave the system fully usable while unverified, so the evaluation survey can
  never be blocked by email delivery.

## Non-goals

- Blocking login or report submission on verification (explicitly rejected
  during brainstorming - see Decisions).
- SMS OTP. Contact number is optional and no SMS gateway is configured.
- Verification for Admin-created staff/admin accounts (see Decisions).
- Changing a VERIFIED email. That stays locked, as today.
- Fixing the `authLimiter` IP-keying problem found along the way (see Risks).

## Design

### 1. Data model

New model, mirroring the proven `PasswordResetToken`:

```prisma
model EmailVerificationToken {
  id         Int       @id @default(autoincrement())
  user_id    Int
  code_hash  String    @db.VarChar(64)   // sha256 hex - deliberately NOT unique
  email      String    @db.VarChar(255)  // the address this code was sent to
  expires_at DateTime
  used_at    DateTime?
  attempts   Int       @default(0)
  created_at DateTime  @default(now())

  user User @relation(fields: [user_id], references: [user_id])

  @@index([user_id])
}
```

And on `User`: `email_verified_at DateTime?` (null means unverified).

Two deliberate departures from `PasswordResetToken`:

- **`code_hash` is not `@unique`.** A six-digit code has only 10^6 values;
  across enough users two would eventually collide and a unique constraint
  would reject a legitimate code. Lookup is by `user_id`, then hash compare.
- **The target address is stored on the token.** Because an unverified user may
  change their address, a code must be bound to the address it was mailed to.
  Without this, a code mailed to the old address could verify the new one.

### 2. Backend service

New `backend/src/services/emailVerification.service.js`. `auth.service.js` is
already ~300 lines and this is a separable concern.

| Function | Behaviour |
|---|---|
| `sendVerificationCode(userId, ctx)` | Delete prior unused codes for the user; mint six digits; store sha256 with a 10-minute TTL and the target email; mail it. Refuses inside a 60-second cooldown measured from the newest token's `created_at`. |
| `verifyCode(userId, code, ctx)` | Take the newest unused, unexpired token for the user. Increment `attempts` first. Refuse past 5 attempts. On match stamp `User.email_verified_at`, set `used_at`, delete siblings. |
| `changeUnverifiedEmail(userId, email, ctx)` | Refuse if already verified; refuse if the address is taken; update `User.email`; delete outstanding codes; send a fresh one. |

Constants: `CODE_TTL_MINUTES = 10`, `RESEND_COOLDOWN_SECONDS = 60`,
`MAX_ATTEMPTS = 5`.

The six digits come from `crypto.randomInt(0, 1000000)` zero-padded to six
characters - not `Math.random()`.

**Changing the address bypasses the resend cooldown.** The cooldown exists to
stop one mailbox being flooded; a new address has received nothing yet, and
making a resident who just fixed a typo wait 60 seconds punishes the exact
recovery this feature is for.

**An email change does not end the session.** `authenticate` loads the user
from the database by `payload.sub` and never trusts the token's `email` claim,
so the existing JWT keeps working and `req.user.email` reflects the new address
on the very next request. No token re-issue and no forced re-login.

### 3. Endpoints

All three are authenticated, because the soft gate means the user already holds
a token. Added to `backend/src/routes/auth.routes.js`, so they inherit
`authLimiter`.

- `POST /auth/verify-email` - body `{ code }`
- `POST /auth/resend-verification` - no body
- `PATCH /auth/email` - body `{ email }`, unverified accounts only

Validators go in `backend/src/validators/auth.validators.js`:
`verifyEmailRules` (6 numeric characters) and `changeEmailRules` (isEmail +
normalizeEmail, matching `registerRules`).

### 4. Registration and login

`register()` calls `sendVerificationCode` after creating the user. It must
never throw on a mail failure - the account is created either way, and the
resident can use Resend. The returned token and user are unchanged, so both
clients keep working without modification on this path.

`login()` is untouched. An unverified resident signs in normally.

`PUBLIC_USER_FIELDS` gains `email_verified_at` so both clients can render the
banner. This is the only change to the shape both clients already consume.

### 5. Password reset interaction

`requestPasswordReset` gains a third branch. Today it distinguishes an active
account (mint and mail a link) from everything else (mail an explanation, with
reason `inactive` or `no_account`). Unverified accounts join the second branch
with a new reason `unverified`, and `notifyPasswordResetUnavailable` gains
matching copy telling the reader to sign in and confirm their address.

This preserves the existing anti-enumeration property: the API response is
identical in every case and the explanation travels only by email.

**Precedence when an account is both deactivated and unverified: deactivated
wins.** It is the harder block, and telling someone to go and confirm an
address that will still not let them reset would waste their time.

New audit action: `PASSWORD_RESET_UNVERIFIED`.

### 6. Web

- `web/src/components/resident/VerifyEmailBanner.jsx` - renders only when
  `user.email_verified_at == null`. Six-digit input, Verify, Resend with a
  visible cooldown, and a "Wrong address? Change it" toggle revealing an inline
  email field.
- Mounted in `web/src/components/resident/ResidentLayout.jsx` above the page
  body, so it follows the resident everywhere rather than only the dashboard.
- `web/src/lib/api.js` gains `authApi.verifyEmail`, `authApi.resendVerification`
  and `authApi.changeEmail`.
- On success it calls the existing `updateUser` from `AuthContext` with the
  refreshed user, so the banner disappears without a reload.

No new route. A banner keeps the diff small and puts the action where the
resident already is.

### 7. Mobile

- `mobile/src/components/VerifyEmailCard.js` - the same three actions, built
  from the existing `TextField` and `Button` components.
- Rendered in `mobile/src/screens/resident/DashboardScreen.js` directly beneath
  the hero. Dashboard only: `ScreenHeader` is shared with the report forms,
  where a banner would fight the form for attention.
- `mobile/src/api/client.js` gains the same three calls.
- Bilingual per the standing rule, with strings added to BOTH `tagalog.js`
  copies so they stay byte-identical.

### 8. Dev fallback when mail is unconfigured

`sendMail` returns `{ sent: false }` when `EMAIL_USER`/`EMAIL_PASS` are absent,
so a fresh `docker compose up` would mint accounts nobody could verify. When
`isConfigured()` is false, `sendVerificationCode` logs the code to the server
console:

```
[verify] mail disabled - code for juan@example.com is 418203
```

Never when mail IS configured. This matches the dev-fallback philosophy already
in `mailer.js` and keeps the Docker path usable out of the box.

### 9. Audit logging

Per the project rule that every mutation writes an AuditLog:
`EMAIL_VERIFY_SENT`, `EMAIL_VERIFIED`, `EMAIL_CHANGE_UNVERIFIED`,
`PASSWORD_RESET_UNVERIFIED`. The code itself is never written to the log.

## Decisions taken during brainstorming

1. **OTP, not a magic link.** The mobile app uses a dependency-light custom
   navigator with no deep-link handling, so a link would work on web and dead
   end on the phone. A six-digit code behaves identically on both.
2. **Soft gate, not a hard gate.** A hard gate puts email delivery on the
   critical path for all 100 survey respondents. The account stays usable;
   verification is enforced only where its absence causes real harm, which is
   account recovery.
3. **Self-service correction while unverified.** Without it, OTP only DETECTS
   the typo and the resident is still stuck - the original dead end survives.
   Once verified, the address locks again exactly as today.
4. **Admin-created accounts are pre-verified.** The Admin types a known address
   and sets the password, so `email_verified_at` is stamped at creation.
   Otherwise a new staff member is locked out of password reset on day one.

## Security notes

State these accurately in the manuscript rather than overclaiming:

- **Hashing a six-digit code is defence-in-depth, not the control.** sha256 of
  10^6 possibilities is brute-forceable offline in seconds if the database
  leaks. The real protections are the 10-minute TTL, single use, and the
  5-attempt cap. The hash is stored so a casual DB read does not hand over a
  live code.
- Attempts are incremented BEFORE the comparison, so a crash or disconnect
  mid-verify cannot be used to retry for free.
- The response to a wrong code does not reveal whether a code exists, is
  expired, or is simply wrong - one message covers all three, matching the
  constant-message approach already used by `login`.

## Risks and findings outside this scope

**`authLimiter` is keyed by IP at 10 requests per 15 minutes.** If survey
respondents register from one barangay hall's Wi-Fi they share a public IP, and
the 11th resident is refused registration entirely. This is already true before
this feature; verification worsens it (register + verify + a possible resend is
three requests each). It needs its own decision - most likely a raised
`AUTH_RATE_LIMIT_MAX` for the survey window - and is deliberately not folded
into this work.

## Testing

This feature adds the backend's first automated tests, because it is auth code:
a wrong comparison in `verifyCode` silently accepts any code, and it is exactly
what an IT-expert evaluator will probe under the Security criterion.

- **New:** Jest in `backend/`, with unit tests over `emailVerification.service`
  covering a correct code, a wrong code, an expired code, a reused code, the
  attempt cap, the resend cooldown, and the rule that changing the address
  invalidates the previous code.
- Web: `npm run build`.
- Mobile: `npx expo export --platform android`.
- Manual end-to-end: register, read the code from the mail or the dev log,
  verify, confirm the banner clears on both clients, and confirm that password
  reset is refused before verification and permitted after.
