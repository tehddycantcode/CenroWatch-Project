# CENROWATCH — Product Requirements (Resident & Public scope)

**System:** CENROWATCH — environmental reporting and case management for the City
Environment and Natural Resources Office (CENRO), Cabuyao City, Laguna, Philippines.

**Scope of this document:** everything a member of the public or a registered Resident
can reach — the public pages (no sign-in) and the Resident workspace (`/resident/*`).
The CENRO Staff and Administrator consoles are covered in `PRD-staff-admin.md`.

**Deployed under test:** web app `https://cenrowatch-project.pages.dev`,
API `https://cenrowatch-project-production.up.railway.app/api/v1`.

---

## 1. Who can reach what

| Surface | Sign-in required |
|---|---|
| Landing page, public map, reports feed, wildlife education, privacy notice | No |
| Anonymous complaint reporting (`/report-anonymous`) | No |
| Public report tracking (`/track`) | No |
| Register / Login / Forgot password | No |
| Resident dashboard, the three report forms, My Reports, Profile (`/resident/*`) | **Yes** — `Resident` role |

Public registration only ever creates a `Resident`. Staff and Administrator accounts
cannot be created from inside the running app.

**The mobile app offers the same three signed-out surfaces**, reached from its sign-in
screen rather than a header: create an account, **report anonymously** (no account), and
**check a report's status** by reference number. The last two were web-only until
2026-09-28, while the app's own privacy notice already told residents they could report
anonymously — the copy shipped before the feature did.

**Email confirmation is REQUIRED before filing a report.** A Resident whose address
is not yet confirmed can sign in, browse, and see reports they filed earlier, but
`POST` on all three report kinds answers **403** until they enter the six-digit code.
Password reset is still withheld too, for the original reason: mailing a reset link
to an unproven address is the real risk. An unconfirmed Resident may correct a
mistyped address themselves.

This was deliberately a *soft* gate until 2026-09-28, and the change is worth stating
plainly because it makes the funnel longer: register → sign in → confirm → file, four
steps before a first report, where it used to be two. The trade was accepted so that
every report has a reachable reporter. Two things soften it: the confirm-code field is
rendered on the report form itself, not only on the dashboard, so the refusal and its
fix are on one screen; and **anonymous reporting needs no account and is never gated**,
so nobody is left unable to report at all.

---

## 2. Public pages (no sign-in)

### 2.1 Landing page — `/`

- Introduces CENROWATCH and states that it covers all 18 barangays of Cabuyao City.
- Shows live summary statistics drawn from public data.
- Offers three primary entry points, which are **distinct destinations**:
  - **File a Report** — the account-based route. A signed-out visitor is taken to
    registration; a signed-in Resident is taken straight to the complaint form.
  - **Report Anonymously** — the public, no-account route (`/report-anonymous`).
  - **View Heat Map** — the public map.
- Also links to report tracking and the wildlife education page.

### 2.2 Public map — `/map`

- Renders a map of Cabuyao (MapLibre canvas with MapTiler / OpenStreetMap attribution).
- Has **two views**, switched by a control at the top left of the map. The map is
  zoomable and pannable in both, and keeps its position when the view is switched:
  - **Heat map** — the default, and what the landing page's "View Heat Map" button
    and the "Heat Map" nav link lead to. Shows complaint **density** as coloured
    blobs with a Low/High legend. It plots no individual pins, so there is nothing
    to click. This is the intended default, **not a defect**.
  - **Markers** — individual pins with a popup each: complaints (red, or amber when
    priority) and wildlife sightings (green, or purple when endangered). A popup
    shows the tracking reference, type, barangay and status, and nothing else.
- Carries **zero personal data** — no reporter name, contact number, email or address.
- Endangered wildlife coordinates are deliberately fuzzed (see §5), which is why the
  Markers legend calls that pin's location approximate.

### 2.3 Reports feed — `/feed`

- Heading "Environmental Reports".
- Lists recent reports with their tracking reference, type, barangay, status and date.
- A **"Filter by status"** dropdown narrows the list, with a "N of M reports" count
  beside it. Its options are built from the statuses actually present in the feed,
  so a status nobody has used yet does not appear.
- A **complaint row is a link** to `/track?id=<reference>`, which is the only public
  per-report view there is (§2.4). **Wildlife rows are deliberately not links** —
  public tracking is mounted for complaints only, so a `WLD-` link would always
  resolve to "not found".
- There is deliberately **no `/reports/:id` route**. A per-report public page would
  be a second surface to keep clear of personal data, and `/track` already answers
  "what is happening with this report". A request for `/reports/<anything>` correctly
  renders the 404 page.
- Same privacy rule: no personal data.

### 2.4 Report tracking — `/track`

- Heading "Track a Report".
- A single reference field, whose placeholder shows the required format: `CMP-2026-00001`.
- Entering a **valid existing reference** shows that report's current status and history.
- References are `CMP-YYYY-NNNNN`, `REQ-YYYY-NNNNN` or `WLD-YYYY-NNNNN` — always a
  four-digit year and a **five-digit** sequence.
- An unknown or malformed reference shows a "not found" result. This is correct
  behaviour, not a defect.
- Tracking works for a report in **any** status, not only pending ones.

### 2.5 Wildlife education — `/wildlife`

- Headings "Cabuyao's Wildlife", "Found wildlife? Here's what to do", and
  "Species you might encounter".
- Informational content only: guidance on encountering wildlife and a species gallery.
- It is **not** a reporting form. Its call to action leads to the wildlife turnover
  form, which requires a Resident account (see §4.1).

### 2.6 Anonymous complaint — `/report-anonymous`

The whistleblower route: file an environmental complaint with no account and no identity.

Fields:

| Field | Required | Notes |
|---|---|---|
| Complaint type | Yes | Dropdown of currently **active** categories |
| Barangay | Yes | One of Cabuyao's 18 barangays |
| Description | Yes | 10–5000 characters |
| Location | No | Optional map pin or "Use my location" |
| Photo | **No** | Optional for anonymous reports |
| Privacy acknowledgement | Yes | Must be ticked to submit |

- On success the page shows a confirmation **and a tracking reference number**, which is
  the only way an anonymous reporter can follow the case afterwards.
- The complaint type is validated **referentially** against the categories table: the
  chosen category must exist and still be active. A category an Administrator has
  retired remains valid on reports that already use it but cannot be chosen for a new
  one, and submitting it returns "Invalid complaint type."

---

## 3. Registration and sign-in

### 3.1 Register — `/register`

Fields: first name, last name, email, contact number (**optional**), barangay, password,
confirm password. The password must be at least 8 characters and contain a letter and a
number; the confirmation must match.

On success the account is created as a `Resident` and the person is sent to
**`/login`**, **not** signed in. The response deliberately sets no session cookie, so
this is enforced by the server rather than by the client navigating politely. The
sign-in screen names the address the confirmation code was emailed to, so arriving
there does not read as a failure.

(The response body still contains a `token` field, which no client reads. It is kept
so that mobile builds installed before this change do not crash writing `undefined`
to the keychain *after* creating the account — see `tests/registerNoSession.test.js`.
It can be removed once every installed build has updated.)

### 3.2 Sign in — `/login`

Email and password, with a "remember me" choice that is carried in the session itself.

- Wrong credentials return "Invalid email or password."
- A deactivated account returns "This account has been deactivated." — a different,
  more specific message.
- Login attempts are rate limited: failed attempts only, 30 per 15 minutes per IP.

### 3.3 Forgot password — `/forgot-password`

Submitting an address always reports the same outcome, whether or not it is registered —
the response must not reveal which addresses exist. A reset link is only actually sent to
an account that is active **and** has a confirmed email address.

---

## 4. Resident workspace (`/resident/*`, sign-in required)

### 4.1 Dashboard — `/resident/dashboard`

- Greets the signed-in Resident by first name: "Good day, {first name}".
- Four figures: **Total Reports**, **Active**, **Resolved**, **Wildlife Cases**, each a
  real number.
- A "What would you like to do?" section linking to the three report forms.
- A "Recent reports" list.

### 4.2 File a complaint — `/resident/report-complaint`

| Field | Required | Notes |
|---|---|---|
| Complaint type | Yes | Active categories only |
| Barangay | Yes | |
| Description | Yes | 10–5000 characters |
| Date issue was observed | No | Cannot be in the future |
| Location | No | Optional pin |
| **Photo** | **Yes** | At least one photo, as evidence |

**The photo is mandatory for a signed-in Resident** and is enforced on the server as well
as in the form — a submission without one is refused with "A photo is required to file a
complaint." That holds **even when the report is filed anonymously**: the rule is not
conditional on the anonymity flag, deliberately, because a rule that reads a body field
is one any client can switch off by sending that field. The `/report-anonymous` route,
which is a different endpoint and needs no account, is where the photo is optional — so
a whistleblower with no safe way to photograph anything still has a path.

**A signed-in Resident may tick "file this report anonymously."** That stores
`user_id = NULL`, so the consequences are permanent and are spelled out in the form: the
report never appears in My Reports, no receipt or status message is sent, and no audit
row records who filed it — there is nothing stored to link it back with, even on request.
The audit row also stores no IP address, because an anonymous report's IP would otherwise
match the same resident's `USER_LOGIN` row in the log an Administrator can already read.

On success the Resident receives a `CMP-YYYY-NNNNN` tracking reference. For an anonymous
report that reference is the only handle that exists, and it resolves through the
**public** tracker (`/track`), not the resident one — the authenticated lookup answers
403 on a report with no owner.

### 4.3 Report a wildlife turnover — `/resident/report-wildlife`

Fields: species (chosen from a list, or typed if not listed), species category (optional,
e.g. Reptile / Bird / Mammal), animal condition (Healthy, Injured, Sick, Dead), barangay,
description, location (optional), photo (optional — it helps identify the species).

On success the Resident receives a `WLD-YYYY-NNNNN` reference. Species flagged as
endangered are given priority handling by CENRO.

### 4.4 Request a service — `/resident/request-service`

Fields: service type (e.g. Garbage Hauling, Creek / River Cleaning, Seedling
Distribution, Environmental Education), barangay, description, quantity (optional),
preferred date (optional), supporting document (optional — image or PDF).

On success the Resident receives a `REQ-YYYY-NNNNN` reference.

### 4.5 My Reports — `/resident/my-reports`

- Heading "My Reports".
- Lists every report the signed-in Resident has filed — complaints, wildlife turnovers
  and service requests — with reference, type, status and date.
- Opening one goes to `/resident/track/:trackingId`, showing its full detail, current
  status and status history.

### 4.6 Profile — `/resident/profile`

The Resident's own details, including their email confirmation state and the ability to
change their password. Changing the password ends sessions on other devices.

---

## 5. Cross-cutting requirements

**Privacy (R.A. 10173).** Public, unauthenticated endpoints return **zero** personal
data. No reporter name, contact number, email or address detail appears in any public
payload — the map, the feed and the tracking result included. Contact numbers, reporter
names and address details are encrypted at rest.

**Anonymous means anonymous.** A report is anonymous either because it came through
`/report-anonymous` (no account involved) or because a signed-in Resident ticked "file
anonymously" — and the two are stored identically: `user_id = NULL`, no reporter columns,
an audit row with no performer and **no IP address**. Staff and Administrators see
"Anonymous" because there is genuinely nothing to show, not because the interface hides
it. The tracking reference shown at submission is the only way to follow it, and it
resolves through the public tracker only.

**Known limitation: photo metadata is not stripped.** Uploads are stored as received, so
an image may still carry EXIF GPS coordinates and the device it was taken on. The forms
warn about this where anonymity is offered, but the pipeline does not yet remove it — a
required photo is the main remaining way an anonymous report could identify its filer.

**Endangered species protection.** Coordinates of endangered wildlife are shifted by
approximately 0.001 degrees (about 110 m) on public endpoints, in a direction derived
from the record's reference, so the point is fuzzed but stable across requests.

**Uploaded files are not public.** A photo attached to a report is served only to a
caller holding a valid, unexpired signature for that exact file, valid one hour.

**Status notifications.** When CENRO changes a report's status, the Resident who filed it
is notified by email.

---

## 6. Deliberate constraints — correct behaviour, not defects

These are design decisions. A test asserting the opposite is testing a product that does
not exist.

1. **"File a Report" leads to registration when signed out.** It is the account-based
   funnel. The anonymous route is the separate "Report Anonymously" button beside it.
2. **Wildlife turnover reporting requires a Resident account.** `/wildlife` is an
   education page, not a form. Only *complaints* have an anonymous route.
3. **Service requests require a Resident account.** There is no anonymous service request.
4. **A resident complaint cannot be filed without a photo.** Evidence is mandatory.
5. **A retired complaint category cannot be selected for a new report**, even though it
   remains valid on older reports that already reference it.
6. **Report categories cannot be renamed** — only retired and replaced. The name is the
   key every report stores, and it also appears in exported PDFs and audit entries that
   cannot be rewritten.
7. **An unconfirmed email DOES block filing a report**, on all three kinds, with a
   **403**. It also still blocks password reset. It does *not* block signing in, nor
   reading reports filed earlier, nor the anonymous route — which needs no account and
   is therefore never gated. (This reversed on 2026-09-28; it used to say the opposite,
   and a test written against the old wording would now fail correctly.)
8. **A "not found" tracking result for an unknown reference is correct.** References are
   `CMP-YYYY-NNNNN` with a five-digit sequence.
