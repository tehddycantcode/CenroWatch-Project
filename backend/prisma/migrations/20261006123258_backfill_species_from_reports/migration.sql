-- Any species_name already in a report but absent from the catalogue. Inactive,
-- so it is preserved for the foreign key without becoming selectable on a new
-- report; endangered, because an unreviewed name is exactly the unknown case the
-- fail-safe exists for. Inert while inactive: an existing report keeps its own
-- stored flag, and a new report cannot pick an inactive species from the form.
--
-- DELIBERATELY TIMESTAMPED ONE SECOND BEFORE the foreign-key migration so it
-- sorts first. On a database that already has legacy reports this is what makes
-- the key addable at all; on this one it inserts nothing, because the rows were
-- created by hand before the key was added.
INSERT INTO `Species` (`name`, `is_active`, `is_endangered`, `created_at`, `updated_at`)
SELECT DISTINCT w.`species_name`, 0, 1, NOW(3), NOW(3)
  FROM `WildlifeTurnover` w
 WHERE NOT EXISTS (SELECT 1 FROM `Species` s WHERE s.`name` = w.`species_name`);

-- Categorise the seven names this plan already knows the taxonomy for, so a
-- fresh database that later accumulates legacy-style reports does not carry
-- eight null-category rows forever. Guarded by category IS NULL so this can
-- never overwrite a category an Admin has since set by hand - idempotent on
-- every later deploy, including this one, where prisma/seed.js's own copy of
-- these same seven (see that file) will find them already categorised and
-- change nothing.
UPDATE `Species`
   SET `category` = 'Bird'
 WHERE `category` IS NULL
   AND `name` IN ('Philippine Eagle', 'Philippine Hawk-Eagle', 'Philippine Serpent Eagle', 'Barn Owl', 'Philippine Hanging Parrot');

UPDATE `Species`
   SET `category` = 'Reptile'
 WHERE `category` IS NULL
   AND `name` IN ('Common Monitor Lizard', 'Common Water Monitor');
