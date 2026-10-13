-- AlterTable
ALTER TABLE `Complaint` ADD COLUMN `closure_certificate_path` VARCHAR(500) NULL;

-- AlterTable
ALTER TABLE `EnvironmentalRequest` ADD COLUMN `closure_certificate_path` VARCHAR(500) NULL;

-- AlterTable
ALTER TABLE `WildlifeTurnover` ADD COLUMN `closure_certificate_path` VARCHAR(500) NULL;
