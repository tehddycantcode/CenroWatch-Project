-- DropForeignKey
ALTER TABLE `Complaint` DROP FOREIGN KEY `Complaint_user_id_fkey`;

-- AlterTable
ALTER TABLE `Complaint` ADD COLUMN `is_anonymous` BOOLEAN NOT NULL DEFAULT false,
    MODIFY `user_id` INTEGER NULL;

-- AddForeignKey
ALTER TABLE `Complaint` ADD CONSTRAINT `Complaint_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `User`(`user_id`) ON DELETE SET NULL ON UPDATE CASCADE;
