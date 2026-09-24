-- CreateTable
CREATE TABLE `PushToken` (
    `push_token_id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `token` VARCHAR(255) NOT NULL,
    `platform` VARCHAR(20) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `last_used_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PushToken_token_key`(`token`),
    INDEX `PushToken_user_id_idx`(`user_id`),
    PRIMARY KEY (`push_token_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PushToken` ADD CONSTRAINT `PushToken_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `User`(`user_id`) ON DELETE CASCADE ON UPDATE CASCADE;
