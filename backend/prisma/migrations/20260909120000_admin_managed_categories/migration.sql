-- Move ComplaintType and RequestType from Prisma enums to admin-managed tables.
--
-- Table names are PascalCase to match the models. `prisma migrate diff` emitted
-- `barangay`, `complaint` and `environmentalrequest` lowercase, because this dev
-- machine runs MySQL case-insensitively and Prisma reads the names back from the
-- database. That applies fine here and HARD-FAILS on the Linux container. See
-- backend/tests/migrationCasing.test.js, which fails the suite if this recurs.
--
-- ORDER IS LOAD-BEARING. The report columns must be widened from ENUM to VARCHAR
-- and the category rows must EXIST before the foreign keys are added, or the FK
-- fails against the nine complaints and three requests already in the database.

-- AlterTable: retire-not-delete flag for barangays
ALTER TABLE `Barangay` ADD COLUMN `is_active` BOOLEAN NOT NULL DEFAULT true;

-- AlterTable: ENUM -> VARCHAR. MySQL preserves the string values verbatim, so
-- every existing report keeps the category it already had.
ALTER TABLE `Complaint` MODIFY `complaint_type` VARCHAR(100) NOT NULL;
ALTER TABLE `EnvironmentalRequest` MODIFY `request_type` VARCHAR(100) NOT NULL;

-- CreateTable
CREATE TABLE `ComplaintType` (
    `complaint_type_id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `label` VARCHAR(120) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ComplaintType_name_key`(`name`),
    INDEX `ComplaintType_is_active_idx`(`is_active`),
    PRIMARY KEY (`complaint_type_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RequestType` (
    `request_type_id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `label` VARCHAR(120) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `sla_setting_key` VARCHAR(100) NULL,
    `sla_fallback_minutes` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `RequestType_name_key`(`name`),
    INDEX `RequestType_is_active_idx`(`is_active`),
    PRIMARY KEY (`request_type_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Seed the categories that were previously enum values. These must land before
-- the foreign keys below. sort_order preserves the order the enums declared, so
-- the report forms keep listing them the way residents are used to.
INSERT INTO `ComplaintType` (`name`, `label`, `sort_order`, `updated_at`) VALUES
  ('Illegal_Dumping', NULL, 1, CURRENT_TIMESTAMP(3)),
  ('Open_Burning', NULL, 2, CURRENT_TIMESTAMP(3)),
  ('Noise_Disturbance', NULL, 3, CURRENT_TIMESTAMP(3)),
  ('Improper_Hazardous_Waste_Storage', NULL, 4, CURRENT_TIMESTAMP(3)),
  ('Drainage_Blockage', NULL, 5, CURRENT_TIMESTAMP(3)),
  ('Air_Pollution', NULL, 6, CURRENT_TIMESTAMP(3)),
  ('Water_Pollution', NULL, 7, CURRENT_TIMESTAMP(3)),
  ('Other', NULL, 8, CURRENT_TIMESTAMP(3));

-- sla_setting_key carries what the hardcoded REQUEST_SLA_BY_TYPE map used to.
-- NULL means the type has no Citizens Charter SLA and never gets a deadline,
-- which is the existing behaviour for hauling, cleaning and Other_Service.
-- 'Creek / River Cleaning' is the one category whose display name is not just
-- its underscored name humanised.
INSERT INTO `RequestType` (`name`, `label`, `sort_order`, `sla_setting_key`, `sla_fallback_minutes`, `updated_at`) VALUES
  ('Garbage_Hauling', NULL, 1, NULL, NULL, CURRENT_TIMESTAMP(3)),
  ('Creek_River_Cleaning', 'Creek / River Cleaning', 2, NULL, NULL, CURRENT_TIMESTAMP(3)),
  ('Seedling_Distribution', NULL, 3, 'request_seedling_sla_minutes', 25, CURRENT_TIMESTAMP(3)),
  ('Environmental_Education', NULL, 4, 'request_env_education_sla_minutes', 187, CURRENT_TIMESTAMP(3)),
  ('Other_Service', NULL, 5, NULL, NULL, CURRENT_TIMESTAMP(3));

-- AddForeignKey. RESTRICT on delete so a category with reports against it cannot
-- be removed out from under them; CASCADE on update so renaming a category
-- rewrites its reports rather than failing.
ALTER TABLE `Complaint` ADD CONSTRAINT `Complaint_complaint_type_fkey` FOREIGN KEY (`complaint_type`) REFERENCES `ComplaintType`(`name`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `EnvironmentalRequest` ADD CONSTRAINT `EnvironmentalRequest_request_type_fkey` FOREIGN KEY (`request_type`) REFERENCES `RequestType`(`name`) ON DELETE RESTRICT ON UPDATE CASCADE;
