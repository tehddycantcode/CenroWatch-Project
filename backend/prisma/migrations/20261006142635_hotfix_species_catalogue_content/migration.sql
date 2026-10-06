-- Production has the migrated Species TABLE but none of the curated catalogue
-- CONTENT: DEPLOYMENT.md Part 1 forbids running prisma/seed.js there (it would
-- revert admin-edited settings/barangays/categories), so seed.js's species
-- array - the only place this content exists - cannot reach production any
-- other way. A migration is the one channel "migrate deploy" guarantees runs.
-- Without this, resolveSpecies() finds no "Other" row and every wildlife
-- report 500s (see species.service.js, OTHER_SPECIES fallback).
--
-- Generated from prisma/seed.js's `species` array by a throwaway script
-- (deleted after this file was written), not hand-transcribed - several
-- body_description values contain apostrophes that need correct SQL escaping.
--
-- Three-way split of what already exists in Species, by name:
--   1. Name absent entirely (true first deploy, or a curated name nobody has
--      ever reported): INSERT, fully populated, is_active = 1.
--   2. Name present as a backfilled stub (20261006123258_backfill_species_from_reports
--      created it from a WildlifeTurnover row with no catalogue entry yet):
--      activate it and fill in the curated content. A stub is identified by
--      `body_description IS NULL AND is_active = 0` together, not either
--      alone - body_description alone would also match the "Other" sentinel,
--      which legitimately has no body_description forever (it is not a real
--      species), and is_active alone would also match a real curated species
--      an Admin has deliberately deactivated from the Species screen.
--   3. Name present with real content already (body_description IS NOT NULL):
--      someone's deliberate state (this migration's own prior run, or an
--      Admin edit). COALESCE leaves every such column exactly as it is.
--
-- is_endangered is NEVER written on an UPDATE, under any condition. The
-- backfill set it true as a fail-safe for an unreviewed name; some curated
-- species are legitimately false. Overwriting it would start publishing
-- exact coordinates for a species nobody has reviewed. Lowering it is an
-- Admin's deliberate call from the Species screen, which writes its own
-- audit action (SPECIES_UPDATE) - this migration is not that.
--
-- COLUMN ORDER IN THE UPDATE CLAUSE IS LOAD-BEARING. MySQL evaluates a
-- multi-column UPDATE's assignments left to right, and later assignments see
-- columns already written by earlier ones in the same statement (this is
-- documented MySQL behaviour, not a bug) - so every expression below that
-- reads `body_description` or `is_active` to decide what to do runs BEFORE
-- either column is itself written. `is_active` is written second-to-last and
-- `body_description` last, after every CASE that depends on reading them.
-- Reordering this list can silently change which rows get activated.
INSERT INTO `Species`
  (`name`, `scientific_name`, `local_name`, `category`, `biome`, `indicator`, `hazard`,
   `is_endangered`, `body_description`, `handling_note`, `photo_credit`, `is_active`,
   `sort_order`, `created_at`, `updated_at`)
VALUES
  ('Philippine Duck', 'Anas luzonica', NULL, 'Bird', 'Lakeshore_Wetland', 'Vulnerable', 'None', 1, 'A medium-sized dabbling duck with a cinnamon head, black crown and stripe through the eye, and a blue-grey bill. Endemic to the Philippines.', 'Do not capture. Report sightings so CENRO can monitor wetland populations.', 'Ken Billington, CC BY-SA 3.0', 1, 1, NOW(3), NOW(3)),
  ('Philippine Eagle-Owl', 'Bubo philippensis', NULL, 'Bird', 'Forest', 'Endemic', 'Powerful_Bite_Or_Talons', 1, 'The country''s largest owl. Rufous-brown plumage, prominent ear tufts, large orange eyes. Found only in the Philippines, near rivers and forest edges.', 'If found grounded or injured, keep your distance and arrange a turnover. Talons are powerful.', 'Aimee Valencia, CC BY-SA 4.0', 1, 2, NOW(3), NOW(3)),
  ('Large Flying Fox', 'Pteropus vampyrus', NULL, 'Mammal', 'Forest', 'Near_Threatened', 'Disease_Risk', 1, 'A very large fruit bat with a fox-like reddish-brown head, dark wings and a wingspan up to 1.5 m. Roosts in colonies in tall trees.', 'Never handle bats with bare hands (rabies risk). Report roosts or grounded individuals.', 'NobbiP, CC BY-SA 3.0', 1, 3, NOW(3), NOW(3)),
  ('Asian Palm Civet', 'Paradoxurus hermaphroditus', 'musang', 'Mammal', 'Urban', 'Native', 'Aggressive', 0, 'A cat-sized nocturnal mammal, shaggy grey-brown coat with dark spots and stripes, a black mask across the face and a long tail.', 'Do not keep as a pet. It may bite if cornered. Turn over to CENRO for safe release.', 'Bernard DUPONT, CC BY-SA 2.0', 1, 4, NOW(3), NOW(3)),
  ('Asian Water Monitor', 'Varanus salvator', 'bayawak', 'Reptile', 'Freshwater', 'Native', 'Powerful_Bite_Or_Talons', 0, 'A large semi-aquatic lizard, up to 2 m, dark grey-brown with yellow spots and bands, a long forked tongue and a strong flattened tail.', 'Usually harmless if left alone, but it can bite and lash with its tail. If trapped in a property, request a turnover rather than harming it.', 'Carlos Delgado, CC BY-SA 4.0', 1, 5, NOW(3), NOW(3)),
  ('Reticulated Python', 'Malayopython reticulatus', 'sawa', 'Reptile', 'Freshwater', 'Native', 'Aggressive', 0, 'The world''s longest snake. Olive to tan with a bold black net-like (reticulated) pattern and a thin dark line along the top of the head. Non-venomous.', 'Do not attempt to catch large individuals. Keep people and pets back and call for a turnover.', 'Mariluna, CC BY-SA 3.0', 1, 6, NOW(3), NOW(3)),
  ('Philippine Cobra', 'Naja philippinensis', 'ulupong', 'Reptile', 'Agricultural', 'Native', 'Venomous', 0, 'A stocky snake, uniform light to medium brown, about 1 m long. Rears up and spreads a hood when threatened. HIGHLY VENOMOUS and able to spit venom.', 'Do NOT approach. Move people away, keep it in sight from a safe distance, and report immediately.', 'Mario Lutz, CC BY-SA 3.0', 1, 7, NOW(3), NOW(3)),
  ('Black-crowned Night Heron', 'Nycticorax nycticorax', NULL, 'Bird', 'Lakeshore_Wetland', 'Common', 'None', 0, 'A stocky, short-necked wading bird with a black crown and back, pale grey wings, white underparts and red eyes. Often seen at dusk.', 'A healthy part of the wetland ecosystem. Report only if injured or entangled.', 'ramidos, CC BY 4.0', 1, 8, NOW(3), NOW(3)),
  ('Collared Kingfisher', 'Todiramphus chloris', NULL, 'Bird', 'Lakeshore_Wetland', 'Common', 'None', 0, 'A bright turquoise-blue and white kingfisher with a broad white collar, a heavy black bill and a white stripe above the eye.', 'Protect creekside vegetation where they nest. Report injured birds.', 'JJ Harrison, CC BY-SA 3.0', 1, 9, NOW(3), NOW(3)),
  ('Southeast Asian Box Turtle', 'Cuora amboinensis', 'pagong', 'Reptile', 'Freshwater', 'Vulnerable', 'None', 1, 'A semi-aquatic turtle with a high domed dark-olive shell and three yellow stripes on each side of a black head. The shell closes fully.', 'Never buy or sell. Turn over to CENRO for assessment and release.', 'Cuora (English Wikipedia), CC BY-SA 3.0', 1, 10, NOW(3), NOW(3)),
  ('Other', NULL, NULL, NULL, NULL, NULL, 'None', 1, NULL, 'Treat any unidentified animal as potentially dangerous and possibly protected. Keep your distance, keep children and pets away, and do not attempt to handle it.', NULL, 1, 999, NOW(3), NOW(3))
ON DUPLICATE KEY UPDATE
  `scientific_name`  = COALESCE(`scientific_name`, VALUES(`scientific_name`)),
  `local_name`       = COALESCE(`local_name`, VALUES(`local_name`)),
  `category`         = COALESCE(`category`, VALUES(`category`)),
  `biome`            = COALESCE(`biome`, VALUES(`biome`)),
  `indicator`        = COALESCE(`indicator`, VALUES(`indicator`)),
  `hazard`           = CASE WHEN `body_description` IS NULL AND `is_active` = 0 THEN VALUES(`hazard`) ELSE `hazard` END,
  `handling_note`    = COALESCE(`handling_note`, VALUES(`handling_note`)),
  `photo_credit`     = COALESCE(`photo_credit`, VALUES(`photo_credit`)),
  `sort_order`       = CASE WHEN `body_description` IS NULL AND `is_active` = 0 THEN VALUES(`sort_order`) ELSE `sort_order` END,
  `updated_at`       = CASE WHEN `body_description` IS NULL AND `is_active` = 0 THEN VALUES(`updated_at`) ELSE `updated_at` END,
  `is_active`        = CASE WHEN `body_description` IS NULL AND `is_active` = 0 THEN 1 ELSE `is_active` END,
  `body_description` = COALESCE(`body_description`, VALUES(`body_description`));
