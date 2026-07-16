# Idempotency Audit - Decision Record

Date: 2026-07-16
Status: Decided with user - no code change; this document is the deliverable.

## Question

Does CENROWATCH need idempotency, and does it have it?

## What idempotency means here

Repeating the same operation must have the same effect as performing it once:
no duplicate records, no duplicate emails/notifications, no shifted
timestamps. It matters most where a client may retry a request whose response
was lost (network blip, double click, refresh after an error).

## Audit findings: what the system already has

1. **Status updates (highest-traffic mutation, all three report kinds).**
   Each staff service computes `changed = newStatus !== existing.status` and
   only writes a StatusHistory row, sends the resident email, and creates the
   in-app notification when the status actually changed
   (`backend/src/services/staff.complaint.service.js` lines 189-244; the same
   guard exists in `staff.wildlife.service.js` and `staff.request.service.js`).
   Re-submitting "Resolved" also preserves the FIRST `resolved_at`
   (`existing.resolved_at || new Date()`). Repeats are side-effect-free
   no-ops; only the AuditLog records the repeated attempt, which is correct
   for an audit trail.
2. **Registration.** The unique email constraint makes a retried registration
   fail cleanly instead of duplicating an account.
3. **Password reset.** Tokens are single-use and hashed; requesting again
   invalidates prior tokens by design.
4. **Absolute-value PATCHes.** Mark-read, mark-all-read, user role/active
   edits, and settings updates all set a target value ("set to X"), so
   repeats are naturally idempotent.
5. **UI double-submit guard.** Every submit button on web and mobile disables
   while a request is in flight (Button `loading` -> `disabled` on both
   platforms), closing the double-click case.

## The one genuine gap

Report-creation POSTs (resident complaint/wildlife/service request, anonymous
report, staff walk-in) carry no idempotency key. The failure window: the
request reaches the server but the response is lost; the form shows an error;
the user submits again; two reports exist with two tracking IDs.

The proper fix would be: a nullable `client_request_id` VARCHAR(36) UNIQUE
column on Complaint, WildlifeTurnover, and EnvironmentalRequest (additive
migration); forms generate one UUID per form session and send it; on a
unique-constraint collision the backend returns the EXISTING report (same
tracking ID) instead of an error. Backend + web + mobile changes.

## Decision: document, do not implement (user-approved 2026-07-16)

Reasons:
- No payments or financial transactions - the classic hard requirement for
  idempotency keys does not exist in this system.
- The blast radius of a duplicate report is small and self-healing: staff
  triage already handles near-duplicates (mark one Rejected), and duplicate
  reports from residents are also a legitimate real-world occurrence the
  workflow must tolerate anyway.
- Low traffic on a local network makes the lost-response window rare.
- The fix spans a schema migration plus three clients - disproportionate to
  the risk for this deployment.

## Revisit triggers

Implement the `client_request_id` design above if any of these become true:
- The system takes payments or issues permits/fines (money or legal effect).
- Public internet deployment with meaningful traffic (lost responses stop
  being rare).
- Staff report a recurring duplicate-report problem in practice.
