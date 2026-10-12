-- AlterTable
ALTER TABLE `Complaint` ADD COLUMN `photo_paths` JSON NULL;

-- AlterTable
ALTER TABLE `EnvironmentalRequest` ADD COLUMN `document_paths` JSON NULL,
    ADD COLUMN `photo_path` VARCHAR(500) NULL,
    ADD COLUMN `photo_paths` JSON NULL;

-- AlterTable
ALTER TABLE `WildlifeTurnover` ADD COLUMN `photo_paths` JSON NULL;
