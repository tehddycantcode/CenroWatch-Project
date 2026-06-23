-- CreateTable
CREATE TABLE `WildlifeStatusHistory` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `turnover_id` INTEGER NOT NULL,
    `old_status` ENUM('Pending_Review', 'Priority_Review', 'Under_Care', 'Released', 'Transferred', 'Deceased') NOT NULL,
    `new_status` ENUM('Pending_Review', 'Priority_Review', 'Under_Care', 'Released', 'Transferred', 'Deceased') NOT NULL,
    `changed_by` INTEGER NOT NULL,
    `note` TEXT NULL,
    `changed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `WildlifeStatusHistory_turnover_id_idx`(`turnover_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RequestStatusHistory` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `request_id` INTEGER NOT NULL,
    `old_status` ENUM('Pending', 'Approved', 'Scheduled', 'Completed', 'Rejected') NOT NULL,
    `new_status` ENUM('Pending', 'Approved', 'Scheduled', 'Completed', 'Rejected') NOT NULL,
    `changed_by` INTEGER NOT NULL,
    `note` TEXT NULL,
    `changed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `RequestStatusHistory_request_id_idx`(`request_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `WildlifeStatusHistory` ADD CONSTRAINT `WildlifeStatusHistory_turnover_id_fkey` FOREIGN KEY (`turnover_id`) REFERENCES `WildlifeTurnover`(`turnover_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RequestStatusHistory` ADD CONSTRAINT `RequestStatusHistory_request_id_fkey` FOREIGN KEY (`request_id`) REFERENCES `EnvironmentalRequest`(`request_id`) ON DELETE RESTRICT ON UPDATE CASCADE;
