-- Table names are PascalCase to match the Prisma models. Prisma generated them
-- lowercase because this dev machine runs MySQL case-insensitively; the Linux
-- container is case-sensitive and would fail with "Table 'cenrowatch_db.complaint'
-- doesn't exist". Three earlier migrations shipped with that bug and silently
-- never applied there (see commit fc6f264). Check the casing on every new
-- migration before applying it.

-- AlterTable
ALTER TABLE `Complaint` ADD COLUMN `sla_started_at` DATETIME(3) NULL,
    MODIFY `status` ENUM('Pending', 'Under_Review', 'Approved', 'In_Progress', 'Resolved', 'Rejected') NOT NULL DEFAULT 'Pending';

-- AlterTable
ALTER TABLE `ComplaintStatusHistory` MODIFY `old_status` ENUM('Pending', 'Under_Review', 'Approved', 'In_Progress', 'Resolved', 'Rejected') NOT NULL,
    MODIFY `new_status` ENUM('Pending', 'Under_Review', 'Approved', 'In_Progress', 'Resolved', 'Rejected') NOT NULL;

-- AlterTable
ALTER TABLE `EnvironmentalRequest` ADD COLUMN `sla_started_at` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `WildlifeTurnover` ADD COLUMN `sla_started_at` DATETIME(3) NULL;
