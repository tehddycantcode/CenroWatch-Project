-- AlterTable
ALTER TABLE `complaint` ADD COLUMN `logged_by` INTEGER NULL,
    ADD COLUMN `reporter_contact` VARCHAR(120) NULL,
    ADD COLUMN `reporter_name` VARCHAR(120) NULL;

-- AddForeignKey
ALTER TABLE `Complaint` ADD CONSTRAINT `Complaint_logged_by_fkey` FOREIGN KEY (`logged_by`) REFERENCES `User`(`user_id`) ON DELETE SET NULL ON UPDATE CASCADE;
