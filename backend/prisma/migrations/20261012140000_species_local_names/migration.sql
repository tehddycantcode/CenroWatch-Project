-- Local (Tagalog) names for catalogue species, so a resident who knows only
-- "kalong" or "kuwago" can find the animal in the report form's species filter.
--
-- Deliberately only the names that are unambiguous for the animal. A wrong local
-- name is worse than none: it is searchable, so a resident would be shown the
-- wrong animal and file against it. The other active species are left NULL for
-- staff to fill in on the admin species screen.
--
-- Written only WHERE local_name IS NULL so an Admin's own edit is never
-- overwritten. Table name is PascalCase on purpose: the Linux container is
-- case-sensitive (see migrationCasing.test.js).
UPDATE `Species` SET `local_name` = 'kalong' WHERE `name` = 'Large Flying Fox' AND `local_name` IS NULL;
UPDATE `Species` SET `local_name` = 'kuwago' WHERE `name` = 'Philippine Eagle-Owl' AND `local_name` IS NULL;
