# CENROWATCH — Product Requirements (CENRO Staff module)

**System:** CENROWATCH — environmental reporting and case management for the City
Environment and Natural Resources Office (CENRO), Cabuyao City, Laguna, Philippines.

**Scope of this document:** the CENRO Staff workspace at `/staff/*` — the queues, the
report detail views, the status workflow, and walk-in logging. The Administrator console
is covered in `PRD-staff-admin.md`; the public and Resident surfaces in `PRD-resident.md`.

**Deployed under test:** web app `https://cenrowatch-project.pages.dev`,
API `https://cenrowatch-project-production.up.railway.app/api/v1`.

---

## 1. Who reaches this module

`/staff/*` is open to the **`CENRO_Staff`** and **`Admin`** roles. Admin is a superset —
an Administrator sees the same queues, and the Administrator console reuses these very
queue pages for its all-reports views. A `Resident` or a signed-out visitor is sent to
sign in.

This is enforced in the web router and again on every API route. Sessions are an
HttpOnly cookie; cookie-authenticated writes additionally require an `X-Requested-With`
header.

---

## 2. The three queues share one pattern

Complaints, wildlife turnovers and service requests each have a queue page built from the
same component, so all three behave identically:

- A **status filter** listing that report kind's statuses, plus an all-statuses option.
- A **search box** placeholdered "Search ID or text…" with a Search button, matching a
  tracking reference or free text.
- **Pagination at 20 rows per page**, with a "Showing N of M" summary line and
  Previous / Next controls showing "Page X of Y". The pager only appears when there is
  more than one page.
- Applying a filter or a search resets to page 1.
- A friendly empty state when nothing matches.
- Clicking a row opens that report's detail page.

### 2.1 Complaints queue — `/staff/complaints`

Heading "Complaints", subtitle "Triage and resolve resident environmental complaints".

Columns: **Tracking**, **Type**, **Barangay**, **Reporter**, **Submitted**, **Status**.

- Tracking cells are `CMP-YYYY-NNNNN` in monospace, and may carry a **PRIORITY** badge or
  a **WALK-IN** badge (the latter when the report was logged at the office rather than
  filed by a resident).
- Reporter shows the resident's name, or the italic word **Anonymous** for a
  whistleblower report — there is no identity to show, by design.
- Submitted shows a relative time ("3 days ago") with the exact date on hover.
- Status shows the status badge, plus a red **SLA** badge when that report has breached
  its deadline.
- With the status filter set to `Pending`, every visible row reads Pending and no
  Resolved or Rejected row remains.

### 2.2 Wildlife turnovers queue — `/staff/wildlife`

Heading "Wildlife Turnovers"; the subtitle states that endangered species take priority.
Rows show a `WLD-YYYY-NNNNN` reference and the species name. Opening a row goes to
`/staff/wildlife/WLD-…`.

### 2.3 Service requests queue — `/staff/requests`

Heading "Service Requests"; the subtitle mentions approving and scheduling resident
service requests. Rows show a `REQ-YYYY-NNNNN` reference and the request type. Opening a
row goes to `/staff/requests/REQ-…`.

---

## 3. Report detail

### 3.1 Complaint detail — `/staff/complaints/:trackingId`

Sections a staff member needs before going out to a site:

- **Description** — the reported text.
- **Location** — a latitude/longitude pair (Cabuyao coordinates begin `14.` and `121.`),
  a rendered map (MapLibre canvas with MapTiler / OpenStreetMap attribution), the
  computed **distance from the CENRO office** in km or m, and a **Directions** link
  pointing at Google Maps with both an origin and a destination.
- **Reporter** — name and contact details. For an anonymous report this reads Anonymous.
  A walk-in report is marked with a **Walk-in report** badge.
- **Attachment** — the photo or document filed with the report.
- **Status history** — every transition so far.
- An **Archived** badge when the report has been archived.

The office coordinates driving the distance come from the `cenro_office_lat` /
`cenro_office_lng` system settings. When an Administrator has not set them, the office
distance is simply absent — that is a normal state, not an error.

### 3.2 Wildlife turnover detail — `/staff/wildlife/:reference`

Shows the species, animal condition, current status and status history, plus
**chain-of-custody photos**, which staff can add to and remove from as the animal is
handled. Endangered species are flagged for priority.

### 3.3 Service request detail — `/staff/requests/:reference`

Shows the request type, the requesting resident, the current status, any requested
quantity and preferred date, and its status history.

---

## 4. The status workflow

The central action of the module, available on every report's detail page.

The update form offers:

- **Update status** — a dropdown of that report kind's statuses, shown in readable form.
- Resource-specific fields where the status calls for them (for example resolution notes,
  or a destination when a wildlife turnover is transferred).
- **Note to resident** — an optional free-text note, hinted "Included in the
  status-change email".
- A **Save update** button.

On submit:

1. The page confirms success and the displayed status changes.
2. A new entry appears in **Status history**, recording the transition and the note.
3. An `AuditLog` row is written naming the action, the staff member and the time.
4. The SLA deadline is recomputed.
5. The resident who filed the report is emailed — and the note above is included in it.

### 4.1 Status sets

| Kind | Statuses |
|---|---|
| Complaint | `Pending`, `Under_Review`, `Approved`, `In_Progress`, `Resolved`, `Rejected` |
| Service request | `Pending`, `Approved`, `Scheduled`, `Completed`, `Rejected` |
| Wildlife turnover | `Pending_Review`, `Priority_Review`, `Under_Care`, `Released`, `Transferred`, `Deceased` |

### 4.2 SLA rules

**The SLA clock starts at `Approved`, not at submission.** `Under_Review` is triage
*before* acceptance — a complaint sitting there has no deadline yet. A report is
**overdue** when its status is still open and its deadline has passed, which is what
raises the red SLA badge in the queue and feeds the "SLA past due" figure on the
dashboard.

---

## 5. Log a walk-in report — `/staff/log-walkin`

Not every report arrives through the app. This is how a staff member records one that
came to the office in person or by another channel, filing it on the resident's behalf.

Heading "Log a Walk-in Report". Fields:

| Field | Required | Notes |
|---|---|---|
| Complaint type | Yes | Active categories only |
| Barangay | Yes | |
| Description | Yes | "What did the resident report?" |
| Received via | Yes | `Walk_In`, `Email`, `Phone_Call`, `Facebook_Messenger`, `Logbook_Record` |
| Reporter name | No | Optional |
| Reporter contact | No | Optional — phone or email |
| Date issue was observed | No | Defaults to today; cannot be in the future |
| Location | No | Optional pin |
| Photo | No | Optional evidence |

On success the page confirms "Walk-in complaint logged" and the complaint joins the
queue, marked with a **WALK-IN** badge.

The reporter name and contact are **encrypted at rest** and are only decrypted for a
reader the API has already authorised.

---

## 6. Staff dashboard — `/staff/dashboard`

The landing page after a staff member signs in.

- Greets the signed-in user by first name: "Good day, {first name}".
- Figures, each a real number rather than a placeholder or dash:
  **Awaiting acknowledgement**, **SLA past due**, **All reports**, **Priority wildlife**.
- A **Recent activity** section.
- Navigation into the complaints, wildlife and service request queues.

---

## 7. Cross-cutting requirements

**Auditability.** Every mutation a staff member makes writes an `AuditLog` row naming the
action, the actor and the time. Audit history is append-only.

**Encrypted personal data.** Reporter names, reporter contacts and address details are
encrypted at rest with AES-256-GCM and decrypted only for an authorised reader.

**Attachments are not public.** A report's photo or document is served only to a caller
holding a valid, unexpired signature for that exact file, valid for one hour. An unsigned
request is refused.

**Notifications.** A status change emails the resident who filed the report. The optional
staff note is carried in that email.

---

## 8. Deliberate constraints — correct behaviour, not defects

These are design decisions. A test asserting the opposite is testing a product that does
not exist.

1. **Anonymous complaints show "Anonymous" and no contact details.** There is no hidden
   identity a staff member could reveal — none was ever collected.
2. **A retired complaint category cannot be chosen for a new walk-in report**, though it
   remains valid on reports that already reference it.
3. **Report categories cannot be renamed**, only retired and replaced. The name is the key
   every report stores and also appears in exported PDFs and audit entries.
4. **Staff cannot create Administrator accounts.** The assignable roles are `CENRO_Staff`
   and `Resident` only, and no Administrator can be minted from inside the running app.
5. **Queues page at 20 rows.** A queue showing 20 rows with more available is correct, not
   truncation — use the pager.
6. **Missing office coordinates are a normal state.** If an Administrator has not set them,
   a complaint detail page simply shows no office distance.
7. **`Under_Review` carries no SLA deadline.** A complaint in triage is not overdue and
   must not be counted as a breach.
8. **User and settings management live in the Administrator console**, not here. Staff
   triage and resolve reports; they do not manage accounts, settings or categories.
