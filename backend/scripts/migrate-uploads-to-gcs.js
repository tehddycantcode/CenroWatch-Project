// One-off migration: copy everything under backend/uploads/ into the GCS bucket,
// keeping the same relative path so no database row has to change.
//
// The DB stores "/uploads/<subdir>/<file>"; the GCS driver strips the "/uploads/"
// prefix and uses the rest as the object name. Upload "complaints/x.jpg" as the
// object "complaints/x.jpg" and every existing report keeps working untouched.
//
// Run INSIDE the api container (backend/node_modules does not exist on the host):
//   docker exec cenrowatch_api node scripts/migrate-uploads-to-gcs.js
//   docker exec cenrowatch_api node scripts/migrate-uploads-to-gcs.js --dry-run
//
// Safe to re-run: existing objects are skipped, and nothing local is deleted.
// Keep backend/uploads as your backup until you have verified the bucket.

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Storage } = require('@google-cloud/storage');

const DRY_RUN = process.argv.includes('--dry-run');
const UPLOAD_ROOT = path.join(__dirname, '..', 'uploads');

function buildClient() {
  const projectId = process.env.GCS_PROJECT_ID || undefined;
  if (process.env.GCS_CREDENTIALS_JSON) {
    const credentials = JSON.parse(process.env.GCS_CREDENTIALS_JSON);
    return new Storage({ projectId: projectId || credentials.project_id, credentials });
  }
  if (process.env.GCS_KEY_FILE) {
    return new Storage({ projectId, keyFilename: process.env.GCS_KEY_FILE });
  }
  throw new Error('Set GCS_CREDENTIALS_JSON or GCS_KEY_FILE in backend/.env first.');
}

// Every file under uploads/, as paths relative to uploads/ (posix separators, so
// the object names match what the driver builds on any host OS).
function listFiles(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full, base));
    else if (entry.name !== '.gitkeep') out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

const MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.pdf': 'application/pdf',
};

(async () => {
  const bucketName = process.env.GCS_BUCKET_NAME;
  if (!bucketName) throw new Error('GCS_BUCKET_NAME is not set in backend/.env.');

  if (!fs.existsSync(UPLOAD_ROOT)) {
    console.log('No uploads directory - nothing to migrate.');
    return;
  }

  const bucket = buildClient().bucket(bucketName);
  const files = listFiles(UPLOAD_ROOT);

  console.log(`bucket : ${bucketName}`);
  console.log(`source : ${UPLOAD_ROOT}`);
  console.log(`files  : ${files.length}${DRY_RUN ? '   (DRY RUN - nothing will be written)' : ''}\n`);

  let uploaded = 0;
  let skipped = 0;
  const failed = [];

  for (const rel of files) {
    const local = path.join(UPLOAD_ROOT, rel);
    const size = fs.statSync(local).size;
    try {
      const [exists] = await bucket.file(rel).exists();
      if (exists) {
        console.log(`  skip    ${rel}  (already in bucket)`);
        skipped++;
        continue;
      }
      if (DRY_RUN) {
        console.log(`  would   ${rel}  (${size} bytes)`);
        uploaded++;
        continue;
      }
      await bucket.file(rel).save(fs.readFileSync(local), {
        resumable: false,
        contentType: MIME[path.extname(rel).toLowerCase()] || 'application/octet-stream',
        metadata: { cacheControl: 'private, max-age=0' },
      });
      console.log(`  upload  ${rel}  (${size} bytes)`);
      uploaded++;
    } catch (err) {
      console.log(`  FAIL    ${rel}  ${err.message}`);
      failed.push(rel);
    }
  }

  console.log(`\n${uploaded} uploaded, ${skipped} already present, ${failed.length} failed`);

  if (failed.length) {
    console.log('\nFailed files - fix the cause and re-run (successful ones are skipped):');
    for (const f of failed) console.log(`  ${f}`);
    process.exit(1);
  }

  if (!DRY_RUN) {
    // Reading back through the bucket is the only proof that matters: it checks
    // the objects exist under the exact names the driver will ask for.
    console.log('\nVerifying every object is readable under its expected name...');
    let bad = 0;
    for (const rel of files) {
      const [exists] = await bucket.file(rel).exists();
      if (!exists) {
        console.log(`  MISSING ${rel}`);
        bad++;
      }
    }
    console.log(bad === 0 ? 'All objects verified.' : `${bad} objects missing - do NOT switch STORAGE_DRIVER yet.`);
    if (bad) process.exit(1);
  }

  console.log('\nDone. backend/uploads was NOT deleted - keep it until you have');
  console.log('confirmed photos load from the bucket in the running app.');
})().catch((err) => {
  console.error('\nMigration failed:', err.message);
  process.exit(1);
});
