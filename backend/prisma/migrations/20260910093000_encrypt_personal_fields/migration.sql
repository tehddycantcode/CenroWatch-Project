-- Widen the columns that now hold AES-256-GCM ciphertext instead of plaintext.
--
-- Encryption does not change what a field MEANS, but it changes how much room
-- it needs: the stored envelope is "enc:v1:<iv>:<tag>:<ciphertext>", all base64,
-- which is 49 characters of overhead plus 4 base64 characters per 3 bytes of
-- input. A 20-character phone number becomes ~157 characters. Sized against the
-- validators' own maximums, assuming worst-case 4-byte UTF-8 throughout:
--
--   contact_number    max 20 chars  ->  157   sized 255
--   reporter_name     max 120 chars ->  689   sized 1000
--   reporter_contact  max 120 chars ->  689   sized 1000
--   address_details   max 255 chars -> 1409   sized 2000
--
-- Widening only. No data is read, moved or dropped here: existing plaintext rows
-- stay exactly as they are and keep working, because decrypt() passes through
-- any value without the "enc:v1:" envelope. `npm run encrypt-pii` converts them.
--
-- Table names are PascalCase deliberately. `prisma migrate diff` generates them
-- lowercase on this Windows machine (MySQL is case-insensitive here, so it reads
-- them back from the database in the wrong case), and that SQL hard-fails on the
-- case-sensitive Linux container. See CLAUDE.md.

-- AlterTable
ALTER TABLE `Complaint` MODIFY `address_details` VARCHAR(2000) NULL,
    MODIFY `reporter_contact` VARCHAR(1000) NULL,
    MODIFY `reporter_name` VARCHAR(1000) NULL;

-- AlterTable
ALTER TABLE `User` MODIFY `contact_number` VARCHAR(255) NULL;

-- AlterTable
ALTER TABLE `WildlifeTurnover` MODIFY `address_details` VARCHAR(2000) NULL;
