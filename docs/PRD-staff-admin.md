# CENROWATCH — Product Requirements (Staff & Admin scope)

**System:** CENROWATCH — environmental reporting and case management for the City
Environment and Natural Resources Office (CENRO), Cabuyao City, Laguna, Philippines.

**Scope of this document:** the two authenticated internal surfaces — the **CENRO Staff**
workspace (`/staff/*`) and the **Administrator** console (`/admin/*`). The public map and
the Resident reporting surfaces are out of scope here.

**Deployed under test:** web app `https://cenrowatch-project.pages.dev`,
API `https://cenrowatch-project-production.up.railway.app/api/v1`.

---

## 1. Roles and access

| Role | Reaches | Notes |
|---|---|---|
| `Resident` | Resident surfaces only | Public registration only ever creates this role |
| `CENRO_Staff` | `/staff/*` | Triage and resolve reports; cannot reach `/admin/*` |
| `Admin` | `/staff/*` **and** `/admin/*` | Admin is a superset of staff access |

Access is enforced both in the web router and server-side on every API route.
An unauthenticated request to an authenticated route is rejected with `401`;
an authenticated request to a route above the caller's role is rejected with `403`.

Sessions on the web app are an **HttpOnly cookie** (`cenrowatch_token`), not browser
storage. There is therefore no synchronous "am I signed in?" check — the app asks the
API at page load. Cookie-authenticated writes additionally require an `X-Requested-With`
header.

---

## 2. Report kinds and their lifecycles

Three kinds of report flow through the system, each with its own tracking reference
and status set.

| Kind | Reference format | Statuses |
|---|---|---|
| Environmental complaint | `CMP-YYYY-NNNNN` | `Pending` to `Under_Review` to `Approved` to `In_Progress` to `Resolved`, or `Rejected` |
| Service request | `REQ-YYYY-NNNNN` | `Pending` to `Approved` to `Scheduled` to `Completed`, or `Rejected` |
| Wildlife turnover | `WLD-YYYY-NNNNN` | `Pending_Review` / `Priority_Review` to `Under_Care` to `Released` / `Transferred` / `Deceased` |

**The SLA clock starts at `Approved`, not at submission.** `Under_Review` is triage
*before* acceptance — a complaint sitting there has no deadline yet. This is deliberate
and any SLA figure must reflect it.

A report is **overdue** when its status is still open and its SLA deadline has passed.

---

## 3. CENRO Staff workspace (`/staff/*`)

### 3.1 Staff dashboard — `/staff/dashboard`

Landing page after a staff member signs in.

- Greets the signed-in user by first name ("Good day, ...").
- Shows a summary figure per queue as an actual number, never a placeholder or dash.
- Navigation links lead to the complaints, wildlife and service request queues.

### 3.2 Complaints queue — `/staff/complaints`

The primary staff working surface.

- Heading "Complaints", subtitle "Triage and resolve resident environmental complaints".
- A table listing complaints with at least: Tracking, Type, Barangay, Status.
- Tracking cells match `CMP-YYYY-NNNNN`.
- A status filter narrows the list; with `Pending` applied, every visible row is `Pending`
  and no `Resolved` or `Rejected` row remains.
- A summary line reports "Showing N of M".

### 3.3 Complaint detail — `/staff/complaints/:trackingId`

Everything a staff member needs to act on one complaint.

- A DESCRIPTION section with the complaint text, and a LOCATION section.
- The location shows a latitude/longitude pair; Cabuyao coordinates begin `14.` and `121.`.
- A map is rendered in the location block (MapLibre canvas with MapTiler / OpenStreetMap
  attribution).
- The distance from the CENRO office is computed and shown in km or m.
- A **Directions** link points at Google Maps with both an origin and a destination.
- A REPORTER section shows the reporter's name and contact details. These fields are
  encrypted at rest and decrypted only for an authorised reader.

### 3.4 Status workflow

The core state transition, available from a complaint's detail page.

- A staff member selects a new status, types an optional note, and saves.
- The page confirms success and the displayed status changes.
- A new entry appears in the complaint's **Status history**, recording the transition
  (from and to) and the note against it.
- The transition writes an `AuditLog` entry and recomputes the SLA deadline.
- The resident who filed the complaint is notified by email.

### 3.5 Wildlife turnovers queue — `/staff/wildlife`

- Heading "Wildlife Turnovers"; the subtitle states that endangered species take priority.
- A table lists turnovers, each row showing a `WLD-` reference and a species name.
- Opening a turnover navigates to `/staff/wildlife/WLD-...` and shows the species, the
  current status, and a status history section.

### 3.6 Service requests queue — `/staff/requests`

- Heading "Service Requests"; the subtitle mentions approving and scheduling resident
  service requests.
- A table lists requests, each row showing a `REQ-` reference and a request type.
- Opening a request navigates to `/staff/requests/REQ-...` and shows the request type,
  the requesting resident, and the current status.

---

## 4. Administrator console (`/admin/*`)

### 4.1 Analytics dashboard — `/admin/dashboard`

The system-wide overview. Heading "Analytics Dashboard", subtitle
"CENRO Cabuyao system-wide overview".

- **Total Reports** as a number, broken down by complaints, wildlife and requests.
- Cards for **Users**, **Avg Resolution** and **Endangered Wildlife**, each a numeric value.
- A **Reports over time** chart covering six months, with month labels on its axis.
- **SLA compliance** shown as a percentage for each of complaints, wildlife and requests.

### 4.2 GIS analytics — `/admin/analytics`

- Renders a map of Cabuyao (MapLibre canvas, MapTiler / OpenStreetMap attribution).
- A per-barangay table, each row naming a barangay and its report count.
- Barangay names are the real 18 barangays of Cabuyao (Marinig, Mamatid, Banlic, Butong,
  Pulo, Bigaa, Baclaran, Gulod, Diezmo, Casile, Pittland, Banay-Banay and the rest).

### 4.3 User accounts — `/admin/users`

- Heading "User Accounts"; a table with Name, Email, Role and Status.
- At least one Administrator account is listed.
- A role filter narrows the list: with "CENRO Staff" applied, every row shows CENRO Staff
  and no Resident or Administrator row remains.
- An Admin can create accounts and change a role or active flag inline. The API refuses
  an edit that would remove the last Admin's own access (self-lockout guard).

### 4.4 Audit log — `/admin/audit-logs`

The accountability trail. **Every data mutation in the system writes an entry.**

- A table of entries, each naming an action, the user who performed it, and a timestamp.
- Action names are uppercase with underscores — for example `SETTINGS_UPDATE`,
  `COMPLAINT_STATUS_UPDATE`, `ADMIN_BOOTSTRAP`, `EMAIL_VERIFIED`.
- Entries are listed newest first, and can be filtered and paginated.

### 4.5 System settings — `/admin/settings`

- A list of settings, each showing its key, current value, and a Save control.
- `complaint_sla_minutes` holds a whole number; every `*_minutes` value is validated as one.
- `cenro_office_lat` and `cenro_office_lng` hold decimal coordinates. Latitude begins
  `14.` and longitude `121.`, placing the office within Cabuyao. These drive the
  office-distance calculation on every complaint detail page.
- Editing a setting writes an `AuditLog` entry.

### 4.6 Report categories — `/admin/categories`

- Lists complaint categories (Illegal Dumping, Open Burning, Water Pollution, Drainage
  Blockage, Improper Hazardous Waste Storage and others) and service request types
  (including Seedling Distribution).
- Each category shows whether it is currently active. Categories are database rows, not
  code — an Admin can add or retire one without a redeploy.

---

## 5. Cross-cutting requirements

**Privacy (R.A. 10173).** Public, unauthenticated endpoints return **zero** personal data.
No reporter name, contact number, email or address detail appears in any public payload.
`User.contact_number`, `Complaint.reporter_name`, `Complaint.reporter_contact` and
address details are encrypted at rest with AES-256-GCM.

**Endangered species protection.** Coordinates of endangered wildlife records are
obfuscated by approximately 0.001 degrees (about 110 m) on public endpoints, in a
direction derived deterministically from the record's reference id — so the point is
fuzzed but stable across requests. Non-endangered coordinates are returned exactly.

**Uploaded files are not public.** Report photos and documents are served only to a
caller holding a valid, unexpired HMAC signature for that exact file path (1-hour TTL).
An unsigned request is refused, as is any path traversal attempt.

**Auditability.** Every mutation writes an `AuditLog` row naming the action, the actor
and the time. Audit history is append-only.

**Rate limiting.** Authentication routes are rate limited per route. Login and register
count failed attempts only; password reset counts every request.
