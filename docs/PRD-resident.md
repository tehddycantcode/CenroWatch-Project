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

**Email confirmation is a soft gate.** A Resident whose email address is not yet
confirmed can sign in and file reports normally. The only capability withheld is
**password reset**, because mailing a reset link to an unproven address is the actual
risk. Confirmation is a six-digit code; an unconfirmed Resident may also correct a
mistyped address themselves.

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
- Plots report markers by barangay; markers can be inspected and the map zoomed.
- Carries **zero personal data** — no reporter name, contact number, email or address.
- Endangered wildlife coordinates are deliberately fuzzed (see §5).

### 2.3 Reports feed — `/feed`

- Heading "Environmental Reports".
- Lists recent reports with their tracking reference, type, barangay, status and date.
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

On success the account is created as a `Resident` and the person is signed in.

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
complaint." This is the key difference from the anonymous route, where it is optional.

On success the Resident receives a `CMP-YYYY-NNNNN` tracking reference.

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

**Anonymous means anonymous.** A report filed through `/report-anonymous` carries no
reporter identity at all. The tracking reference shown at submission is the only way to
follow it.

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
7. **An unconfirmed email does not block signing in or filing reports.** It blocks
   password reset only.
8. **A "not found" tracking result for an unknown reference is correct.** References are
   `CMP-YYYY-NNNNN` with a five-digit sequence.
