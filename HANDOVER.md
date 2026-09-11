# CENROWATCH — Handover to CENRO Cabuyao

**System:** CENROWATCH — environmental complaint, wildlife turnover and service
request management for the City Environment and Natural Resources Office,
Cabuyao City, Laguna.

**Developed by:** Moro, Edward Justine G. · Quizana, Koshi Cyrus G. ·
Zaspa, Holian Isaac R. — BSIT, Pamantasan ng Cabuyao.

**Handover date:** ________________

---

## Read this part first

A working system is not the same as a system you own. CENROWATCH depends on
several external accounts, and on **one secret that cannot be recovered if it is
lost**. Sections 1 and 2 exist because software handovers fail far more often on
account ownership than on code quality.

If nothing else in this document is acted on, act on these three:

1. **Receive and safely store the encryption key** (§2). Without it, resident
   contact numbers and addresses become permanently unreadable — not by anyone,
   ever, including the developers.
2. **Confirm every account in §1 is owned by CENRO or the university**, not by a
   student. Accounts belonging to graduating students are the most common cause
   of a handed-over system going dark six months later.
3. **Assign someone as the system owner** (§8). A system nobody is responsible
   for is a system nobody notices has stopped working.

---

## 1. Accounts CENRO must own

Tick each only when the credential is held by CENRO and a student's personal
account is no longer involved.

| # | Account | Why CENRO must own it | What happens if a student still owns it | Done |
|---|---|---|---|---|
| 1.1 | **Google Cloud project** (hosting + billing) | Runs the entire system | Service is suspended when their card expires or the account closes. Recovering a project after that is difficult and sometimes impossible. | ☐ |
| 1.2 | **Email account** for notifications | Sends confirmation codes and status updates to residents | Residents stop receiving email the moment the password changes or the account is deleted. Also: resident personal data is flowing through a private individual's mailbox. | ☐ |
| 1.3 | **Domain name** | The address residents and the mobile app use | Site becomes unreachable when the registration lapses. The mobile app must be rebuilt to point anywhere else. | ☐ |
| 1.4 | **MapTiler account** (map tiles) | Draws the GIS maps | Maps stop rendering; the rest of the system keeps working. | ☐ |
| 1.5 | **GitHub repository** | The source code | CENRO cannot commission changes from anyone else without it. | ☐ |

> **On the email account (1.2).** At handover the system was configured with a
> **student's personal Gmail account**. This must move to an official CENRO or
> City Government address before the system is considered handed over. It is both
> an operational risk and a records question: notifications to residents are
> official correspondence from the office.

---

## 2. The encryption key — the one thing with no recovery

To protect residents' personal information, CENROWATCH encrypts five pieces of
data inside the database:

- resident contact numbers
- walk-in reporter names
- walk-in reporter contact numbers
- complaint street addresses
- wildlife turnover street addresses

They are unreadable without a key called **`FIELD_ENCRYPTION_KEY`** — a
64-character code stored in the system's configuration.

### What this means in practice

| | |
|---|---|
| **If the key is kept safely** | The system works normally. Staff see phone numbers and addresses exactly as before. |
| **If the database is stolen** | Those five fields are unreadable to the thief. This is the protection you are paying for. |
| **If the key is lost** | Those five fields are **permanently unreadable**. Not recoverable by the developers, by Google, or by anyone. Everything else in the system keeps working; that data is simply gone. |

There is no password reset for this. It is not that recovery is difficult — it is
that recovery is mathematically impossible, which is the entire point of
encryption.

### Handover procedure

1. Developers provide the key **in person or by a private channel** — never by
   email, never in a document attached to a report, never in the source code.
2. CENRO stores it in **at least two separate places**, for example:
   - the office password manager, and
   - a sealed printed copy in the office safe
3. **Verify the key before signing off.** Open the system, view any resident's
   contact number, and confirm it displays as a normal phone number rather than
   text beginning `enc:v1:`. That proves the running system holds a working key.
4. Record who holds it below.

| Role | Name | Date received | Signature |
|---|---|---|---|
| System owner | | | |
| Backup holder | | | |

> **Do not change this key** to "improve security". Changing it does not
> re-encrypt anything — it makes all existing encrypted data unreadable. If it
> ever genuinely must be rotated, that is a developer task requiring a data
> migration, not a configuration change.

---

## 3. Credentials handed over

| Item | Held by | Notes |
|---|---|---|
| Google Cloud project owner login | | Should be a CENRO account with 2-factor authentication |
| Database password | | Stored in Secret Manager; write it down separately too |
| `FIELD_ENCRYPTION_KEY` | | §2 |
| `JWT_SECRET` | | Changing it signs everyone out; otherwise harmless |
| Email account password / app password | | §1.2 |
| First Admin login | | **Change the password immediately after handover** |
| Domain registrar login | | |
| MapTiler API key | | Restrict it to your domain in the MapTiler dashboard |

---

## 4. What the system does

**Residents** (web and Android app) register, confirm their email, file
environmental complaints with a photo and location, report wildlife turnovers,
request CENRO services, and track everything by a reference number.

**CENRO Staff** work three queues (complaints, wildlife, requests), move reports
through their workflow, log walk-in complaints for residents who come to the
office in person, print PDF reports, and see which reports are approaching or
past their Citizens Charter deadline.

**Administrators** additionally see analytics and GIS maps, manage staff
accounts, edit the report categories and barangay list, adjust service deadlines,
and read a complete audit log of every change anyone has made.

### Things worth knowing about how it behaves

- **Service deadlines count working days only.** The clock skips Saturdays and
  Sundays, and it **starts when staff approve a report, not when the resident
  files it**. A complaint filed Friday evening and approved Monday morning is
  measured from Monday. This reflects R.A. 11032 (Ease of Doing Business), which
  measures working days.
- **A report sitting unapproved has no deadline yet.** The staff dashboard shows
  an **"Awaiting acknowledgement"** count so that unapproved pile stays visible.
  Watch that number — it is the one figure that can hide a backlog.
- **Nothing is ever deleted.** Retiring a category or barangay hides it from new
  reports while leaving old records intact and readable.
- **Every change is recorded.** Who did what, when, and the values before and
  after — see Admin → Audit Log.
- **Uploaded photos are not public.** Each photo link is valid for one hour and
  for one specific file. Copying a link into a message will not work for long,
  and that is deliberate.

---

## 5. Routine tasks (no developer needed)

| Task | Where |
|---|---|
| Add or deactivate a staff member | Admin → Users |
| Add or retire a complaint / request type | Admin → Categories |
| Add or retire a barangay | Admin → Categories |
| Change a service deadline | Admin → System Settings |
| Confirm a resident's email address for them | Admin → Users → Verify email |
| Review who changed what | Admin → Audit Log |
| Export analytics | Admin → Dashboard → Export PDF |

Category and barangay changes take effect immediately on the website. The
**mobile app picks them up the next time it is opened** — no app-store update
needed.

---

## 6. Tasks that need a developer

- Changing the report workflow stages (Pending → Approved → …)
- Adding new fields to a report form
- Changing what the emails say
- Rebuilding the Android app (**required** if the web address ever changes)
- Rotating the encryption key
- Restoring a backup

---

## 7. Backups and recovery

| What | How it is protected | Who verifies |
|---|---|---|
| Database | Automatic daily backup, ~02:00 Manila, with point-in-time recovery | |
| Uploaded photos | Stored in Google Cloud Storage, replicated by Google | |
| Encryption key | **Manual — §2. This is the gap.** | |
| Source code | GitHub repository | |

> **A backup nobody has restored is a belief, not a backup.** Before signing off,
> restore the database backup into a test instance once and confirm it works. It
> takes under an hour and it is the only way to know.
>
> Note also: **a database backup is useless without the encryption key.** Store
> them in different places, but make sure both survive.

---

## 8. Ownership and support

| Role | Name | Contact |
|---|---|---|
| CENRO system owner (day-to-day) | | |
| CENRO technical contact | | |
| Developer contact (transition period) | | |

Agree an explicit **support period** — for example 3 or 6 months after handover —
and write the end date here: ________________

After that date, the developers are under no obligation to respond. This is not
unfriendly; it is what makes the preceding sections matter. Everything CENRO
needs in order to run the system without them is in this document and in
`DEPLOYMENT.md`.

---

## 9. Data privacy responsibilities

Once CENROWATCH holds real residents' data, **CENRO becomes the personal
information controller** under **R.A. 10173 (Data Privacy Act of 2012)**. The
system provides technical safeguards; the legal obligations sit with the office.

What the system already provides:

- Encryption of contact numbers and addresses in the database
- Password hashing (bcrypt) — passwords are never stored or recoverable
- Role-based access control, so staff only reach what their role allows
- A complete audit log of every change
- Public map endpoints that return **no** personal data
- Endangered-species locations deliberately blurred on public maps
- Uploaded photos reachable only through expiring, single-file links
- Encrypted connections (HTTPS) once deployed

What CENRO must handle:

- Confirm with your **Data Protection Officer** whether this system requires
  registration with the **National Privacy Commission**
- Publish a privacy notice telling residents what is collected and why
- Have a process for residents asking to access or correct their data
- Have a **breach response plan** — the NPC and affected individuals must be
  notified within 72 hours of discovering a qualifying breach
- Decide how long complaint records and photos are retained

> This section is a practical summary, not legal advice. Confirm the specifics
> with your Data Protection Officer or the NPC.

---

## 10. Known limitations — stated honestly

These are current facts about the system, not hidden defects. They are listed so
nobody discovers them at an inconvenient moment.

1. **Uploaded files rely on Google's encryption, not the application's.** Photos
   and documents are encrypted at rest by Google Cloud Storage. The application
   does not add its own layer. This is a deliberate decision: Google's
   implementation is stronger than a custom one, and duplicating it would add
   risk without adding protection. *If the system is ever moved off Google Cloud
   onto an ordinary server, this protection is lost and must be replaced.*

2. **Rate limits are counted per server instance.** Under heavy load the system
   runs several copies, each counting separately, so protection against
   password-guessing is weaker than the configured number suggests. Adequate at
   expected LGU traffic; revisit if usage grows substantially.

3. **Email delivery is not guaranteed.** Notifications go through a standard
   mail provider. If it is unavailable, the report is still filed correctly and
   visible in the system — only the email is missed. Nothing is lost.

4. **The Android app must be rebuilt if the web address changes.** The address is
   fixed inside the app when it is built and cannot be changed from within it.

5. **No automated escalation.** The system shows which reports are overdue; it
   does not chase anyone. Acting on the queue remains a human responsibility.

6. **Report categories can be retired but not renamed.** Renaming would split one
   category's history across two names in records already printed and archived.

---

## 11. Acceptance

By signing, CENRO Cabuyao confirms that the system has been demonstrated, the
accounts in §1 are owned by the office, the encryption key in §2 has been
received and verified, and this document has been received.

| | Name | Position | Signature | Date |
|---|---|---|---|---|
| Received by (CENRO) | | | | |
| Witnessed by | | | | |
| Handed over by | | | | |
| Handed over by | | | | |
| Handed over by | | | | |

---

### Companion documents

| Document | For |
|---|---|
| `DEPLOYMENT.md` | Deploying or redeploying the system |
| `SECURITY.md` | Technical detail of every security measure |
| `SETUP.md` | Running the system on a developer machine |
| `README.md` | Project overview |
