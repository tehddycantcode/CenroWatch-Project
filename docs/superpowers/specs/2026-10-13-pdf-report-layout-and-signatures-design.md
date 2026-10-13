# PDF case record: professional layout, signature blocks, resident copy

**Date:** 2026-10-13
**Status:** Design, awaiting approval
**Scope:** `backend/src/services/report.layout.js`, `staff.report.service.js`,
`admin.report.service.js`, the three staff status services, both clients.

---

## 1. What this is for

The generated PDF is the only artefact of a CENROWATCH case that leaves the
system. It is the retained office copy, the thing an auditor reads, and - after
this change - the thing a receiving department signs and the thing a resident
keeps. Three requirements, from the researcher:

1. **Professional layout.** Today's document is a vertical list of
   right-aligned key/value rows with no page numbers, no letterhead and no
   footer identity. Page 2 of a multi-page record is anonymous.
2. **Signature lines staff can complete by hand.** Specifically for a wildlife
   turnover handed to another department, and for auditing generally.
3. **A signed closure document the resident can see** when their case finishes.

And, added during review: the PDF must carry, in detail, everything the
**resident** and the **staff** each need to see and to complete - while staying
clean and readable.

### The disclosure rule

The PDF introduces **no new disclosure decision**:

- The **Resident Copy** prints exactly the fields
  `web/src/pages/resident/TrackReportPage.jsx` already shows that resident,
  plus the signed closure certificate and an acknowledgement line. Note that
  `staff_notes` is *already* resident-visible there (`:31`, `:54`, `:72`) - the
  PDF matches the existing surface rather than reasoning afresh about it.
- The **Official Case Record** prints what the staff detail pages already show,
  plus SLA internals, the closure work proof, and the signature block.

Anything a client does not already render stays out until somebody decides it
should be rendered. That decision is not this spec's to make.

---

## 2. Approach

Three were considered.

**A - extend the existing pdfkit vocabulary. CHOSEN.**
`report.layout.js` is already shared by the staff case report and the admin
analytics report, so new primitives improve both. It keeps the attachment
pipeline that `tests/reportPhotoEmbed.test.js` pins - sharp conversion for
webp/heic/heif, a try/catch around the draw for files with a valid signature and
corrupt contents (three of the six seeded complaint photos are exactly that).

**B - HTML to PDF via Puppeteer.** Real CSS, real tables, far better layout
control. Rejected: it adds ~300 MB of Chromium to the Railway container for a
form-shaped document, and discards the attachment handling and its tests.

**C - signature block only, no layout work.** Cheapest, does not deliver the
request.

---

## 3. Page frame

New primitives in `report.layout.js`, used by both report services.

**`createReportDocument` gains `bufferPages: true`.** `Page X of Y` cannot be
stamped as the document is written because Y is unknown until it ends. With
buffered pages the writer calls `stampPages(doc)` as its last act, which walks
`doc.bufferedPageRange()`, switches to each page and draws the footer. This is
the only mechanism that gives a correct total; a running `doc.on('pageAdded')`
footer can print the page number but never the total.

**`letterhead(doc, { title, reference, status })`** - page 1 only:

```
+----------------------------------------------------------+
| [seal]   Republic of the Philippines                     |
|          City of Cabuyao, Laguna                         |
|          CITY ENVIRONMENT AND NATURAL RESOURCES OFFICE   |
+----------------------------------------------------------+
|  WILDLIFE TURNOVER RECORD            WLD-2026-00014      |   <- tinted band
+----------------------------------------------------------+
```

The band is a filled rectangle in `GREEN` with white bold text: the document
title left, the reference right. It replaces the current four stacked lines of
different sizes, which read as a heading hierarchy rather than as a document
title.

**`runningHeader(doc, { title, reference })`** - pages 2+, one 8pt muted line
plus a hairline rule: `WILDLIFE TURNOVER RECORD - WLD-2026-00014 (continued)`.

**`pageFooter`**, every page, drawn by `stampPages`: a hairline rule, then three
8pt muted cells on one line - the reference left, `Page 2 of 4` centre, and
right either `Contains personal data. Handle per R.A. 10173.` (official copy)
or `CENROWATCH - CENRO Cabuyao` (resident copy). The classification line is
currently a one-off at the end of the last page, which means a page that gets
separated from the stack carries no warning at all.

**The seal.** `web/public/cenro-logo.png` and `mobile/assets/cenro-logo.png`
exist; there is no backend-side copy. The file is copied to
`backend/assets/cenro-logo.png` and read through a module-level
`fs.readFileSync` wrapped so a missing file degrades to text-only letterhead
rather than throwing. The backend cannot read `web/public` at runtime on
Railway - only `backend/` is deployed.

---

## 4. Layout primitives

**`section(doc, title)`** replaces `heading`. An uppercase 10pt `GREEN` label
with a hairline rule beneath, spanning the text column - uppercase rather than
small-caps because pdfkit's bundled Helvetica has no small-caps variant and
faking one by scaling glyphs looks worse than not doing it. `heading` stays
exported and
unchanged so `admin.report.service.js` keeps working; it is reimplemented as a
thin call into `section`.

**`fieldGrid(doc, pairs, { cols = 2 })`** replaces `kv` for case fields. Label
above value, not beside it:

```
TYPE                          STATUS
Improper Waste Disposal       Under Investigation

BARANGAY                      FILED
Banay-Banay                   12 Oct 2026, 2:14 PM
```

Label is 7.5pt uppercase `MUTED`; value is 10pt black regular. Two reasons this
replaces `kv`:

1. `kv` right-aligns a **bold** value against a label - the visual grammar of a
   receipt, not a government form, and the single largest reason the current
   document looks improvised.
2. `kv` calls `drawRow`, which passes `lineBreak: false`, so a value wider than
   215px is **silently clipped**. A truncated `transfer_destination` on the
   retained copy of a chain-of-custody record is the same class of defect as a
   missing evidence photo. `fieldGrid` measures with `doc.heightOfString` and
   wraps to a second line, growing the row.

`kv` is **kept** and still used by the analytics report, where a right-aligned
figure against a label is correct. Its clipping risk is documented in a comment
rather than changed, because every analytics value is a short number.

**Empty-value policy.** `fieldGrid` omits a pair whose value is null or empty,
except where absence is itself the fact - then the writer passes explicit copy
(`Not yet resolved`, `Unassigned`, `Not specified`). Today's report prints
`Resolved: Not set`, `SLA deadline: Not set`, `Transfer destination: Not set` on
an open case, which is what makes a correct document look unfinished. This is
the rule that lets the report carry more detail and read as less cluttered.

**`photoGrid`.** `attachment` currently advances `doc.y` by 226pt per image, so
a five-photo complaint spends ~2.5 pages on photographs. `photoGrid` lays them
2-up at 240x180 with the caption beneath, halving that. It delegates each draw
to the existing `attachment` so the conversion and corruption paths are
untouched; a refusal line simply occupies its cell.

---

## 5. Content: what each copy carries

### Official Case Record (staff, admin, audit)

Sections in order: letterhead, **Case summary**, **Description**, **Location**,
**Reporter**, **CENRO action** (notes, resolution, proof), **Status history**,
**Attachments**, **Signatures**, footer.

Fields added that are live in the database and absent from the PDF today:

| Kind | Added | Why it matters |
|---|---|---|
| all | accurate photo/document count, and **every** file embedded | `photo_paths` has existed since 2026-10-12; the PDF embeds only `photo_path`, so photos 2-5 are absent from the retained record while the page says "Photo attached: Yes" |
| all | `is_anonymous` stated in the summary, not only inside Reporter | an auditor reading the summary should not have to infer it |
| complaint | `received_via` for every row, `resolution_proof_path` | the proof is required at closure and renders nowhere |
| wildlife | **`processed_by`** (staff name) | this is the name that must appear on the handover signature line; the staff detail page shows it, the PDF does not |
| request | **`processed_by`**, `approved_by_cenro_head`, `approval_date`, `completion_proof_path`, and the request's **photos** | all live columns; the photos were added 2026-10-12 and print nowhere |

**Deliberately excluded: the 15 unwired Citizens Charter columns.** Verified by
grep across `backend/src` on 2026-10-13 - `is_highly_technical`,
`inspection_date`, `report_prepared_at`, `conference_date`,
`commitment_signed_at`, `monitoring_date`, `assigned_staff_role`,
`reported_via`, `wildlife_info_form_filled`, `vet_clearance_secured`,
`vet_clearance_date`, `rescue_date`, `transport_date`,
`rescue_report_prepared`, `rescue_report_date` are read and written by nothing.
`received_via`, `approved_by_cenro_head` and `approval_date` ARE written and are
therefore in. Printing a column nothing populates yields a page of "Not set"
and tells a reader the office failed to record something it was never asked to.

`is_priority_review` is also excluded, for a different reason: it is live - it
drives the wildlife queue's ordering - but it is written as
`Boolean(input.is_endangered)` and rendered by no screen on either client, so
printing it would state the same fact as `Endangered` twice under a second name.

### Resident Copy (new)

Sections: letterhead, **Your report**, **Description**, **Location**,
**Progress** (the timeline with dates), **Updates from CENRO**, **Your
attachments**, **Closure certificate**, **Acknowledgement**, footer.

Carries: reference, kind, status with its plain-language stage, type, barangay,
description, `observed_at`, location/landmark, `priority`, their own photos, the
status timeline, the notes the tracking page already shows, `scheduled_date`,
`completion_date`/`resolved_at`, and the signed closure certificate.

**`sla_deadline` is included.** The tracking page already shows it on all three
kinds (`:28`, `:52`, `:70`), and it is the office's Citizens Charter commitment
to that resident rather than an internal metric - so it belongs on their copy.
`exceeded_sla` is **excluded**: the tracking page does not show it, and a breach
flag is a measure of CENRO's performance for CENRO and its auditors, not a field
the resident needs in order to act.

Excludes: `exceeded_sla`, assignment, the closure work proof, `logged_by`, and
any field the tracking page does not render.

Both copies come from the same writers, parameterised by an `audience` of
`official` or `resident`. One code path, so a field cannot appear on one and
silently rot on the other.

---

## 6. Signature block

A new `signatureBlock(doc, { title, columns, remarks })` in `report.layout.js`.
Each column is `{ role, name, designation, agency, contact, date }`; a value
present is printed above the line, a value absent leaves the line blank with its
caption beneath. Lines are 1.6em tall with 11pt of clearance so a wet signature
fits.

**Wildlife - "Chain of Custody / Turnover Record"**, three columns:

```
RELEASED BY (CENRO CABUYAO)     RECEIVED BY                   WITNESSED BY

_______________________         _______________________       _______________________
Juan Santos                     Printed name                  Printed name
Wildlife Officer                Designation                   Designation
CENRO Cabuyao                   Agency / Office               Agency / Office
Date: ____________              Contact: ____________         Date: ____________
                                Date: ____________
```

`Released by` is pre-filled from `processed_by` - which is precisely why that
field had to be added to the PDF. **Where the system does not know a name it
prints a blank ruled line, never a guess**, and never the name of the staff
member who happened to click Download.

Plus a ruled **Remarks / condition of animal on transfer** area, three lines,
because that is what the receiving department disputes later.

**Complaint and request - "Certification"**, three columns: `Certified by`
(the assigned or processing staff member), `Noted by` (blank, for the CENRO
head), `Received by` (the resident, blank, with a date line).

### The block does not render on an open case

Gated on the record being in a terminal state - wildlife `Released` or
`Transferred`, complaint `Resolved`, request `Completed`. A printed signing line
for a handover that has not happened is a blank form that can be signed to
assert something false. On an open case the section is replaced by one muted
line: *"Signature lines appear once this case is released, transferred, resolved
or completed."*

The gate reads the record's **current** status, with no transition involved, so
every row already in a terminal state renders correctly.

---

## 7. Signed closure certificate

### Schema

```prisma
closure_certificate_path String? @db.VarChar(500)   // Complaint
closure_certificate_path String? @db.VarChar(500)   // EnvironmentalRequest
closure_certificate_path String? @db.VarChar(500)   // WildlifeTurnover
```

Nullable, three ALTER TABLE statements. **The migration must be generated with
`--create-only` and its table casing corrected to PascalCase before applying** -
Prisma emits lowercase names for ALTERs on this Windows machine, eight times out
of eight. `tests/migrationCasing.test.js` fails the suite if this is missed.

Named `..._path` so `storage.signFiles` signs it: that helper matches on key
name, and a tidier name returns an unsigned path that 403s.

### Upload

`proofUpload` in `staff.routes.js` is `diskUpload('proof')`, which defaults
`allowedMime` to `IMAGE_MIME` - so **staff cannot upload a scanned signed PDF
today**. A separate `certificateUpload = diskUpload('certificates', DOC_MIME)`
is added rather than widening `proofUpload`, because the work proof is a
photograph of work done and should stay a photograph.

New endpoint, not a field on the status PATCH:
`POST /staff/{complaints|wildlife|requests}/:id/certificate`, single file,
`DOC_MIME`, magic-byte sniffed by the existing `sniffGuard`. Audit action
`CLOSURE_CERTIFICATE_UPLOADED`. `DELETE` on the same path for a wrong scan,
audited as `CLOSURE_CERTIFICATE_REMOVED`.

Separate from the status PATCH because the signed form comes back from the
receiving department or the CENRO head **days after** the work is done. Folding
it into the closing transition would mean the case cannot be closed until the
paperwork returns.

### Optional, not required

The required closure evidence stays `resolution_proof_path` and
`completion_proof_path`. The certificate is optional. Requiring it would make
staff either hold cases open for a week waiting on a signature, or attach
something arbitrary to get past the gate - which pollutes the very evidence the
field exists to create. Wildlife has no required closure proof today beyond its
chain-of-custody photo, and that is unchanged.

### Resident visibility

Returned by the three resident GET endpoints, signed like every other upload
(1 h TTL). Shown on `TrackReportPage.jsx` and `MyReportsPage`, and on mobile
`TrackReportScreen.js`, as a labelled download - **"Signed closure document"** -
using the existing `isPdfPath()` helper, which strips the query string before
testing the extension. A bare `/\.pdf$/i` test against a signed path silently
fails and renders a PDF as a broken `<img>`.

Printed in both PDF copies: embedded if it is an image, stated as held in the
system if it is a PDF, which `attachment()` already handles.

---

## 8. Error handling

Every new primitive must leave a printable document.

| Failure | Behaviour |
|---|---|
| seal file missing | text-only letterhead, no throw |
| `stampPages` on a one-page doc | `Page 1 of 1` |
| a value too long for its grid cell | wraps; the row grows |
| certificate is a PDF | stated in the document, not dropped |
| certificate unreadable from storage | stated; the record still prints |
| `processed_by` null on a terminal wildlife row | blank ruled line |

The existing contract holds: `attachment()` never throws, and `writeReport` is
async and must be awaited before `doc.end()` - ending first truncates the file
mid-attachment and produces a corrupt PDF that still downloads with a `.pdf`
name.

---

## 9. Testing

Against the real pdfkit, as `tests/reportPhotoEmbed.test.js` already does, so a
library upgrade fails the suite instead of quietly dropping evidence. Note that
pdfkit subsets fonts and writes glyph ids as hex, so **wording cannot be
verified by grepping the output** - assertions go through spies on the layout
primitives and through page counts.

New suite `tests/reportLayout.test.js`:

- a report long enough to paginate gets a footer on **every** page, with
  `Page N of M` where M equals `bufferedPageRange().count`
- pages 2+ carry the running header; page 1 does not
- `fieldGrid` omits an empty pair, and renders explicit absence copy when given
- a 300-character `transfer_destination` is **not** clipped (the `kv` bug)
- `stampPages` on a single-page document yields `Page 1 of 1`

New suite `tests/reportSignatures.test.js`:

- wildlife `Transferred` renders the three-column custody block
- wildlife `Under_Care` renders the deferral line and **no** signature lines
- complaint `Resolved` renders Certification; `Pending` does not
- `Released by` prints `processed_by`'s name when present, a blank line when null
- the resident copy never prints a field absent from the tracking page

New suite `tests/closureCertificate.test.js`:

- upload accepts `application/pdf` and a JPEG; rejects a renamed executable via
  the magic-byte sniffer
- writes `CLOSURE_CERTIFICATE_UPLOADED`
- the resident GET returns the certificate **only** to the case owner, and never
  for an anonymous complaint (`user_id` null, so the authenticated lookup 403s)
- upload does not alter `status`

Resolve on the handler's real completion signal - `res.json()` or `next(err)`.
`asyncHandler` is `Promise.resolve(fn(...)).catch(next)` with no return, so
awaiting a controller waits for nothing and reads an empty `mock.calls`.

**Visual verification is required, not optional.** Generate one PDF per kind per
audience against real production-shaped data and look at every page. A
structural assertion is close to no evidence for a requirement about how a
document looks.

---

## 10. Out of scope

- Captured or cryptographic signatures. The decision is wet ink on paper,
  scanned back in through the certificate field. No signature schema, no
  signing pad, no PKI.
- Wiring the 15 unused Citizens Charter columns.
- Any change to who may read a report.
- EXIF stripping on uploads (a known, documented limitation).

---

## 11. Deploy order

1. Migration + certificate endpoints + schema (inert: nothing calls them)
2. Layout rewrite + both PDF copies + the resident download route
3. Web: certificate upload on the three staff detail pages; certificate download
   and PDF download on the resident tracking page
4. Mobile OTA: certificate download on `TrackReportScreen`. Android only -
   there is no iOS build. Run `eas fingerprint:compare --build-id
   589c0f39-9ffc-4b3a-b61c-56b452861015` before publishing; CRLF silently turns
   a successful publish into one that reaches nobody.

Steps 1-3 are a web + API deploy with no mobile dependency. Step 4 adds a
read-only surface, so a phone that has not taken the OTA is missing a download
link rather than broken.
