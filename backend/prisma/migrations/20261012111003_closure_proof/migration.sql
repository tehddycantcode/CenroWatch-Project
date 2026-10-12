-- AlterTable
ALTER TABLE `Complaint` ADD COLUMN `resolution_proof_path` VARCHAR(500) NULL;

-- AlterTable
ALTER TABLE `EnvironmentalRequest` ADD COLUMN `completion_proof_path` VARCHAR(500) NULL;
