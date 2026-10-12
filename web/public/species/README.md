# Species photos

**Nothing in the app reads this folder any more.** Species photos are rows in
the catalogue now: an Admin uploads one per species at `/admin/species`, the API
stores it and signs the path, and the public guide and the resident wildlife
form render it from `photo_path`. The frozen array these files were wired into,
`web/src/lib/species.js`, is deleted.

The ten `.jpg` files here are the curated, correctly-licensed set collected for
the old guide. They are kept as the source material to upload through that
screen, not because anything serves them.

## The credit is required, and the upload screen enforces it

Every file here is CC BY or CC BY-SA, which require attribution **wherever the
image is shown** — and a catalogue photo is shown on the public species guide,
in the admin table, and on the resident wildlife form (both as a thumbnail in
the species picker and in the identification card). So
`POST /admin/species/:id/photo` refuses an upload that carries no
`photo_credit`, and `/admin/species` disables the file picker until the credit
box beside it is filled. The two are stored in the same write, so a photo can
never exist in the catalogue without its attribution.

**Where the credit is actually printed changed on 2026-10-12.** The resident
wildlife form used to caption every photo with "Photo: …". That was clutter on
the one screen a resident reads in a hurry, so the form now carries the credit
in the image's `title` (web) and accessibility label (mobile) instead, and the
**public species guide at `/wildlife` is the readable credit list** — it prints
"Photos: <species> (<credit>); …" for every catalogue photo. That page is the
attribution of record. If it is ever removed or trimmed, the credits have to
reappear somewhere a reader can reach, or the licences are no longer satisfied.

The attributions for the ten files here are in `backend/prisma/seed.js`, where
each seeded species already carries its own `photo_credit`; the upload screen
pre-fills the box from the row, so re-uploading one of these does not mean
retyping it. For an original photograph, name the author plainly — "CENRO
Cabuyao" is a correct credit for the office's own work.

## Rules for any photo added to the catalogue

- **Licensing:** public-domain (CC0) or CC-licensed only, and the credit goes in
  the row at upload time — see above.
- **Size:** landscape, around 800px wide, under ~120KB each.
- **Framing:** cards crop to 4:3, so keep the animal centred.

## Suggested sources

- Wikimedia Commons (check the licence on each file page)
- iNaturalist observations marked CC0 or CC BY
- DENR / Biodiversity Management Bureau public materials
