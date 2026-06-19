-- CreateTable
CREATE TABLE `User` (
    `user_id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(255) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `first_name` VARCHAR(100) NOT NULL,
    `last_name` VARCHAR(100) NOT NULL,
    `contact_number` VARCHAR(20) NULL,
    `role` ENUM('Admin', 'CENRO_Staff', 'Resident') NOT NULL DEFAULT 'Resident',
    `barangay_id` INTEGER NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `privacy_consent` BOOLEAN NOT NULL DEFAULT false,
    `consent_date` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    INDEX `User_email_idx`(`email`),
    INDEX `User_role_idx`(`role`),
    PRIMARY KEY (`user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Barangay` (
    `barangay_id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `latitude` DOUBLE NULL,
    `longitude` DOUBLE NULL,
    `geojson_boundary` JSON NULL,

    UNIQUE INDEX `Barangay_name_key`(`name`),
    PRIMARY KEY (`barangay_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Complaint` (
    `complaint_id` INTEGER NOT NULL AUTO_INCREMENT,
    `tracking_id` VARCHAR(20) NOT NULL,
    `user_id` INTEGER NOT NULL,
    `barangay_id` INTEGER NOT NULL,
    `assigned_to` INTEGER NULL,
    `complaint_type` ENUM('Illegal_Dumping', 'Open_Burning', 'Noise_Disturbance', 'Improper_Hazardous_Waste_Storage', 'Drainage_Blockage', 'Air_Pollution', 'Water_Pollution', 'Other') NOT NULL,
    `description` TEXT NOT NULL,
    `photo_path` VARCHAR(500) NULL,
    `latitude` DOUBLE NULL,
    `longitude` DOUBLE NULL,
    `address_details` VARCHAR(255) NULL,
    `status` ENUM('Pending', 'Under_Review', 'In_Progress', 'Resolved', 'Rejected') NOT NULL DEFAULT 'Pending',
    `priority` BOOLEAN NOT NULL DEFAULT false,
    `staff_notes` TEXT NULL,
    `resolution_notes` TEXT NULL,
    `submitted_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `resolved_at` DATETIME(3) NULL,
    `received_via` ENUM('Walk_In', 'Email', 'Phone_Call', 'Facebook_Messenger', 'Logbook_Record') NULL,
    `is_highly_technical` BOOLEAN NOT NULL DEFAULT false,
    `inspection_date` DATETIME(3) NULL,
    `report_prepared_at` DATETIME(3) NULL,
    `conference_date` DATETIME(3) NULL,
    `commitment_signed_at` DATETIME(3) NULL,
    `monitoring_date` DATETIME(3) NULL,
    `sla_deadline` DATETIME(3) NULL,
    `exceeded_sla` BOOLEAN NOT NULL DEFAULT false,
    `assigned_staff_role` ENUM('CENRO_Head', 'Administrative_Staff', 'Environmental_Management_Specialist', 'Environmental_Inspector', 'Wildlife_Enforcer_Officer', 'Technical_Enforcement_Division_Personnel') NULL,

    UNIQUE INDEX `Complaint_tracking_id_key`(`tracking_id`),
    INDEX `Complaint_tracking_id_idx`(`tracking_id`),
    INDEX `Complaint_status_idx`(`status`),
    INDEX `Complaint_barangay_id_idx`(`barangay_id`),
    INDEX `Complaint_user_id_idx`(`user_id`),
    PRIMARY KEY (`complaint_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ComplaintStatusHistory` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `complaint_id` INTEGER NOT NULL,
    `old_status` ENUM('Pending', 'Under_Review', 'In_Progress', 'Resolved', 'Rejected') NOT NULL,
    `new_status` ENUM('Pending', 'Under_Review', 'In_Progress', 'Resolved', 'Rejected') NOT NULL,
    `changed_by` INTEGER NOT NULL,
    `note` TEXT NULL,
    `changed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ComplaintStatusHistory_complaint_id_idx`(`complaint_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WildlifeTurnover` (
    `turnover_id` INTEGER NOT NULL AUTO_INCREMENT,
    `reference_id` VARCHAR(20) NOT NULL,
    `reported_by` INTEGER NOT NULL,
    `processed_by` INTEGER NULL,
    `barangay_id` INTEGER NOT NULL,
    `species_name` VARCHAR(200) NOT NULL,
    `species_category` VARCHAR(100) NULL,
    `is_endangered` BOOLEAN NOT NULL DEFAULT false,
    `is_priority_review` BOOLEAN NOT NULL DEFAULT false,
    `animal_condition` ENUM('Healthy', 'Injured', 'Sick', 'Dead') NOT NULL,
    `description` TEXT NOT NULL,
    `photo_path` VARCHAR(500) NULL,
    `chain_of_custody_photos` JSON NULL,
    `latitude` DOUBLE NULL,
    `longitude` DOUBLE NULL,
    `address_details` VARCHAR(255) NULL,
    `status` ENUM('Pending_Review', 'Priority_Review', 'Under_Care', 'Released', 'Transferred', 'Deceased') NOT NULL DEFAULT 'Pending_Review',
    `intake_date` DATETIME(3) NULL,
    `release_date` DATETIME(3) NULL,
    `transfer_destination` VARCHAR(255) NULL,
    `staff_notes` TEXT NULL,
    `submitted_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `reported_via` ENUM('Walk_In', 'Phone_Call', 'Social_Media') NULL,
    `wildlife_info_form_filled` BOOLEAN NOT NULL DEFAULT false,
    `vet_clearance_secured` BOOLEAN NOT NULL DEFAULT false,
    `vet_clearance_date` DATETIME(3) NULL,
    `rescue_date` DATETIME(3) NULL,
    `transport_date` DATETIME(3) NULL,
    `rescue_report_prepared` BOOLEAN NOT NULL DEFAULT false,
    `rescue_report_date` DATETIME(3) NULL,
    `sla_deadline` DATETIME(3) NULL,
    `exceeded_sla` BOOLEAN NOT NULL DEFAULT false,
    `assigned_staff_role` ENUM('CENRO_Head', 'Administrative_Staff', 'Environmental_Management_Specialist', 'Environmental_Inspector', 'Wildlife_Enforcer_Officer', 'Technical_Enforcement_Division_Personnel') NULL,

    UNIQUE INDEX `WildlifeTurnover_reference_id_key`(`reference_id`),
    INDEX `WildlifeTurnover_reference_id_idx`(`reference_id`),
    INDEX `WildlifeTurnover_barangay_id_idx`(`barangay_id`),
    INDEX `WildlifeTurnover_species_name_idx`(`species_name`),
    INDEX `WildlifeTurnover_status_idx`(`status`),
    PRIMARY KEY (`turnover_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EnvironmentalRequest` (
    `request_id` INTEGER NOT NULL AUTO_INCREMENT,
    `tracking_id` VARCHAR(20) NOT NULL,
    `user_id` INTEGER NOT NULL,
    `barangay_id` INTEGER NOT NULL,
    `processed_by` INTEGER NULL,
    `request_type` ENUM('Garbage_Hauling', 'Creek_River_Cleaning', 'Seedling_Distribution', 'Environmental_Education', 'Other_Service') NOT NULL,
    `description` TEXT NOT NULL,
    `document_path` VARCHAR(500) NULL,
    `requested_quantity` INTEGER NULL,
    `preferred_schedule` DATETIME(3) NULL,
    `status` ENUM('Pending', 'Approved', 'Scheduled', 'Completed', 'Rejected') NOT NULL DEFAULT 'Pending',
    `scheduled_date` DATETIME(3) NULL,
    `completion_date` DATETIME(3) NULL,
    `staff_notes` TEXT NULL,
    `submitted_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `sla_deadline` DATETIME(3) NULL,
    `exceeded_sla` BOOLEAN NOT NULL DEFAULT false,
    `approved_by_cenro_head` BOOLEAN NOT NULL DEFAULT false,
    `approval_date` DATETIME(3) NULL,

    UNIQUE INDEX `EnvironmentalRequest_tracking_id_key`(`tracking_id`),
    INDEX `EnvironmentalRequest_tracking_id_idx`(`tracking_id`),
    INDEX `EnvironmentalRequest_status_idx`(`status`),
    INDEX `EnvironmentalRequest_barangay_id_idx`(`barangay_id`),
    INDEX `EnvironmentalRequest_user_id_idx`(`user_id`),
    PRIMARY KEY (`request_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `log_id` INTEGER NOT NULL AUTO_INCREMENT,
    `performed_by` INTEGER NULL,
    `action` VARCHAR(200) NOT NULL,
    `target_table` VARCHAR(100) NOT NULL,
    `target_id` INTEGER NULL,
    `data_generated_json` JSON NOT NULL,
    `ip_address` VARCHAR(50) NULL,
    `performed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditLog_performed_by_idx`(`performed_by`),
    INDEX `AuditLog_action_idx`(`action`),
    INDEX `AuditLog_performed_at_idx`(`performed_at`),
    PRIMARY KEY (`log_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SystemSetting` (
    `setting_id` INTEGER NOT NULL AUTO_INCREMENT,
    `setting_key` VARCHAR(100) NOT NULL,
    `setting_value` TEXT NOT NULL,
    `description` VARCHAR(255) NULL,
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `SystemSetting_setting_key_key`(`setting_key`),
    PRIMARY KEY (`setting_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_barangay_id_fkey` FOREIGN KEY (`barangay_id`) REFERENCES `Barangay`(`barangay_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Complaint` ADD CONSTRAINT `Complaint_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `User`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Complaint` ADD CONSTRAINT `Complaint_barangay_id_fkey` FOREIGN KEY (`barangay_id`) REFERENCES `Barangay`(`barangay_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Complaint` ADD CONSTRAINT `Complaint_assigned_to_fkey` FOREIGN KEY (`assigned_to`) REFERENCES `User`(`user_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ComplaintStatusHistory` ADD CONSTRAINT `ComplaintStatusHistory_complaint_id_fkey` FOREIGN KEY (`complaint_id`) REFERENCES `Complaint`(`complaint_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WildlifeTurnover` ADD CONSTRAINT `WildlifeTurnover_reported_by_fkey` FOREIGN KEY (`reported_by`) REFERENCES `User`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WildlifeTurnover` ADD CONSTRAINT `WildlifeTurnover_processed_by_fkey` FOREIGN KEY (`processed_by`) REFERENCES `User`(`user_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WildlifeTurnover` ADD CONSTRAINT `WildlifeTurnover_barangay_id_fkey` FOREIGN KEY (`barangay_id`) REFERENCES `Barangay`(`barangay_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EnvironmentalRequest` ADD CONSTRAINT `EnvironmentalRequest_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `User`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EnvironmentalRequest` ADD CONSTRAINT `EnvironmentalRequest_barangay_id_fkey` FOREIGN KEY (`barangay_id`) REFERENCES `Barangay`(`barangay_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EnvironmentalRequest` ADD CONSTRAINT `EnvironmentalRequest_processed_by_fkey` FOREIGN KEY (`processed_by`) REFERENCES `User`(`user_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_performed_by_fkey` FOREIGN KEY (`performed_by`) REFERENCES `User`(`user_id`) ON DELETE SET NULL ON UPDATE CASCADE;
