# Species photos

**Nothing in the app reads this folder any more.** Species photos are rows in
the catalogue now: an Admin uploads one per species at `/admin/species`, the API
stores it and signs the path, and the public guide and the resident wildlife
form render it from `photo_path`. The frozen array these files were wired into,
`web/src/lib/species.js`, is deleted.

The ten `.jpg` files here are the curated, correctly-licensed set collected for
the old guide. They are kept as the source material to upload through that
screen, not because anything serves them.

## Before uploading any of them: the credit cannot be recorded yet

`Species.photo_credit` exists in the schema and the public `GET /species`
returns it, but no write path accepts it — not `POST /admin/species`, not
`PATCH /admin/species/:id`, not `POST /admin/species/:id/photo`. A photo
uploaded today therefore gets a `photo_path` and a permanently `NULL`
`photo_credit`, and the guide displays it with no attribution.

Every file here is CC BY or CC BY-SA, which require attribution wherever the
image is shown. The attributions are in `backend/prisma/seed.js` (each seeded
species already carries its `photo_credit`), so the seeded rows are fine the
moment they have a path — but an Admin uploading a new photo of their own, or
re-uploading one of these to a species that was added later, has nowhere to put
the credit. **Add `photo_credit` to the admin create/update payload before
treating the upload screen as finished.** A defended capstone should not ship
photos it has no right to use.

## Rules for any photo added to the catalogue

- **Licensing:** public-domain (CC0) or CC-licensed only, and the credit has to
  end up in the row — see above.
- **Size:** landscape, around 800px wide, under ~120KB each.
- **Framing:** cards crop to 4:3, so keep the animal centred.

## Suggested sources

- Wikimedia Commons (check the licence on each file page)
- iNaturalist observations marked CC0 or CC BY
- DENR / Biodiversity Management Bureau public materials
