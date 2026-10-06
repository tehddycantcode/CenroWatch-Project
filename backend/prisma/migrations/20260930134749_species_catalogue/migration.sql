-- CreateTable
CREATE TABLE `Species` (
    `species_id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(200) NOT NULL,
    `scientific_name` VARCHAR(200) NULL,
    `local_name` VARCHAR(200) NULL,
    `category` ENUM('Bird', 'Mammal', 'Reptile') NULL,
    `biome` ENUM('Forest', 'Freshwater', 'Lakeshore_Wetland', 'Agricultural', 'Urban', 'Cave') NULL,
    `indicator` ENUM('Common', 'Native', 'Endemic', 'Near_Threatened', 'Vulnerable', 'Endangered', 'Critically_Endangered') NULL,
    `hazard` ENUM('None', 'Venomous', 'Aggressive', 'Disease_Risk', 'Powerful_Bite_Or_Talons') NOT NULL DEFAULT 'None',
    `is_endangered` BOOLEAN NOT NULL DEFAULT false,
    `body_description` TEXT NULL,
    `handling_note` TEXT NULL,
    `photo_path` VARCHAR(500) NULL,
    `photo_credit` VARCHAR(255) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Species_name_key`(`name`),
    INDEX `Species_category_idx`(`category`),
    INDEX `Species_is_endangered_idx`(`is_endangered`),
    INDEX `Species_is_active_idx`(`is_active`),
    PRIMARY KEY (`species_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
