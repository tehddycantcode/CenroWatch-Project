-- AlterTable
ALTER TABLE `Complaint` ADD COLUMN `archive_reason` VARCHAR(255) NULL,
    ADD COLUMN `archived_at` DATETIME(3) NULL,
    ADD COLUMN `archived_by` INTEGER NULL;

-- AlterTable
ALTER TABLE `EnvironmentalRequest` ADD COLUMN `archive_reason` VARCHAR(255) NULL,
    ADD COLUMN `archived_at` DATETIME(3) NULL,
    ADD COLUMN `archived_by` INTEGER NULL;

-- AlterTable
ALTER TABLE `WildlifeTurnover` ADD COLUMN `archive_reason` VARCHAR(255) NULL,
    ADD COLUMN `archived_at` DATETIME(3) NULL,
    ADD COLUMN `archived_by` INTEGER NULL;

-- CreateIndex
CREATE INDEX `Complaint_archived_at_idx` ON `Complaint`(`archived_at`);

-- CreateIndex
CREATE INDEX `EnvironmentalRequest_archived_at_idx` ON `EnvironmentalRequest`(`archived_at`);

-- CreateIndex
CREATE INDEX `WildlifeTurnover_archived_at_idx` ON `WildlifeTurnover`(`archived_at`);
