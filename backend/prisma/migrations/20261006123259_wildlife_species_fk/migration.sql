-- AddForeignKey
ALTER TABLE `WildlifeTurnover` ADD CONSTRAINT `WildlifeTurnover_species_name_fkey` FOREIGN KEY (`species_name`) REFERENCES `Species`(`name`) ON DELETE RESTRICT ON UPDATE CASCADE;
