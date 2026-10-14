-- CreateTable
CREATE TABLE `Feedback` (
    `feedback_id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `complaint_id` INTEGER NULL,
    `turnover_id` INTEGER NULL,
    `request_id` INTEGER NULL,
    `rating_overall` INTEGER NOT NULL,
    `rating_speed` INTEGER NOT NULL,
    `rating_staff` INTEGER NOT NULL,
    `comment` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Feedback_complaint_id_key`(`complaint_id`),
    UNIQUE INDEX `Feedback_turnover_id_key`(`turnover_id`),
    UNIQUE INDEX `Feedback_request_id_key`(`request_id`),
    INDEX `Feedback_user_id_idx`(`user_id`),
    INDEX `Feedback_created_at_idx`(`created_at`),
    PRIMARY KEY (`feedback_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Feedback` ADD CONSTRAINT `Feedback_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `User`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Feedback` ADD CONSTRAINT `Feedback_complaint_id_fkey` FOREIGN KEY (`complaint_id`) REFERENCES `Complaint`(`complaint_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Feedback` ADD CONSTRAINT `Feedback_turnover_id_fkey` FOREIGN KEY (`turnover_id`) REFERENCES `WildlifeTurnover`(`turnover_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Feedback` ADD CONSTRAINT `Feedback_request_id_fkey` FOREIGN KEY (`request_id`) REFERENCES `EnvironmentalRequest`(`request_id`) ON DELETE SET NULL ON UPDATE CASCADE;
