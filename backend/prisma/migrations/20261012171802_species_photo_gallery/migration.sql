-- CreateTable
CREATE TABLE `SpeciesPhoto` (
    `species_photo_id` INTEGER NOT NULL AUTO_INCREMENT,
    `species_id` INTEGER NOT NULL,
    `photo_path` VARCHAR(500) NOT NULL,
    `photo_credit` VARCHAR(255) NOT NULL,
    `caption` VARCHAR(255) NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SpeciesPhoto_species_id_idx`(`species_id`),
    PRIMARY KEY (`species_photo_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `SpeciesPhoto` ADD CONSTRAINT `SpeciesPhoto_species_id_fkey` FOREIGN KEY (`species_id`) REFERENCES `Species`(`species_id`) ON DELETE CASCADE ON UPDATE CASCADE;
