-- Backfill Species.habitat for the seeded catalogue.
--
-- HAND-WRITTEN, because `prisma migrate dev` only diffs the schema and will
-- never generate a data migration. Table name is PascalCase from the start -
-- the generator's lowercase habit is why the schema migration beside this one
-- had to be corrected.
--
-- Scoped by `name`, which is UNIQUE, so each statement touches exactly one row
-- and an Admin-added species is left alone rather than swept into a guess.
-- Rows an Admin adds later get their habitat from the species form.
--
-- WHY THESE VALUES. Habitat is where the animal lives and moves, not what
-- taxon it belongs to. Three of these share biome Lakeshore_Wetland and split
-- three ways, which is the case that justifies the column existing at all.
-- `Other` is deliberately left NULL: it is the sentinel for an animal nobody
-- could identify, so claiming a habitat for it would be inventing information.

-- Waterfowl and semi-aquatic reptiles: found in or at the water's edge.
UPDATE `Species` SET `habitat` = 'Aquatic' WHERE `name` = 'Philippine Duck';
UPDATE `Species` SET `habitat` = 'Aquatic' WHERE `name` = 'Asian Water Monitor';
UPDATE `Species` SET `habitat` = 'Aquatic' WHERE `name` = 'Southeast Asian Box Turtle';
-- A wading waterbird: it feeds in water, and one found far from it is displaced.
UPDATE `Species` SET `habitat` = 'Aquatic' WHERE `name` = 'Black-crowned Night Heron';

-- Primarily airborne. NOT a synonym for "bird": the Large Flying Fox is a
-- mammal, and it is the species that makes this a stored field rather than one
-- derived from category.
UPDATE `Species` SET `habitat` = 'Air' WHERE `name` = 'Philippine Eagle-Owl';
UPDATE `Species` SET `habitat` = 'Air' WHERE `name` = 'Large Flying Fox';
UPDATE `Species` SET `habitat` = 'Air' WHERE `name` = 'Collared Kingfisher';

-- Terrestrial. The Reticulated Python swims well, but it is encountered on the
-- ground, which is what this field is read for.
UPDATE `Species` SET `habitat` = 'Land' WHERE `name` = 'Asian Palm Civet';
UPDATE `Species` SET `habitat` = 'Land' WHERE `name` = 'Reticulated Python';
UPDATE `Species` SET `habitat` = 'Land' WHERE `name` = 'Philippine Cobra';
