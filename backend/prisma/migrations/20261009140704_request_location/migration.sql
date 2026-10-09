-- AlterTable
ALTER TABLE `EnvironmentalRequest`
  ADD COLUMN `latitude` DOUBLE NULL,
  ADD COLUMN `longitude` DOUBLE NULL,
  ADD COLUMN `address_details` VARCHAR(2000) NULL;
