-- Free text from the old editable Category input. Anything that is not one of
-- the three enum values is cleared rather than guessed: NULL is honest and staff
-- can set it, a wrong category is silently wrong forever.
UPDATE `WildlifeTurnover`
   SET `species_category` = NULL
 WHERE `species_category` IS NOT NULL
   AND `species_category` NOT IN ('Bird', 'Mammal', 'Reptile');

-- AlterTable
ALTER TABLE `WildlifeTurnover`
  MODIFY `species_category` ENUM('Bird', 'Mammal', 'Reptile') NULL;
