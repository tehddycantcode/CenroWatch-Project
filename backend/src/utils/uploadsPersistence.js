// Refuse to start in production if uploaded files would not survive a deploy.
//
// With STORAGE_DRIVER=local and no volume mounted, every upload succeeds: 201
// returned, database row written, photo renders for the life of the container -
// and the next deploy deletes the lot. There is no error at any point, which is
// what makes it the worst misconfiguration available here. A resident's evidence
// photo simply is not there any more, weeks later, with nothing to explain it.
//
// So it is a hard failure at boot rather than a warning. A server that will not
// start is noticed in minutes; a line in a deploy log is not noticed at all.
//
// How a real volume is detected: a mount sits on a DIFFERENT device from its
// parent directory, so comparing st_dev of /app/uploads against /app tells a
// mounted volume apart from an ordinary folder baked into the image. That test
// is portable - it needs no vendor-specific variable - but it cannot tell a
// container-without-a-volume apart from a VPS where uploads is an ordinary
// directory on a persistent disk. That case is real and legitimate, so the
// operator can assert it with UPLOADS_PERSISTENT=1, which is a deliberate,
// written-down claim rather than a silent default.

const nodeFs = require('fs');
const path = require('path');

function isLocalDriver(env) {
  // Unset means local (services/storage/index.js), so the guard must treat it
  // as local too - otherwise the riskiest setup is the one that skips checking.
  return (env.STORAGE_DRIVER || 'local').toLowerCase() === 'local';
}

function assertUploadsPersistent({ env = process.env, fs = nodeFs, uploadRoot } = {}) {
  if (env.NODE_ENV !== 'production') return;
  if (!isLocalDriver(env)) return;

  const root = uploadRoot || require('../middlewares/upload').UPLOAD_ROOT;
  const parent = path.dirname(root);

  let rootStat;
  try {
    rootStat = fs.statSync(root);
  } catch {
    throw new Error(
      `Uploads directory ${root} does not exist. With STORAGE_DRIVER=local it must be a mounted, ` +
        'persistent volume, or uploaded files are lost on the next deploy.'
    );
  }

  // Writable is required in every case: a volume mounted read-only fails every
  // upload, and an operator asserting persistence cannot assert that away.
  try {
    fs.accessSync(root, nodeFs.constants ? nodeFs.constants.W_OK : 2);
  } catch {
    throw new Error(`Uploads directory ${root} is not writable by the server process.`);
  }

  if (env.UPLOADS_PERSISTENT === '1' || env.UPLOADS_PERSISTENT === 'true') return;

  // Railway names the mount; honour it so the guard still passes if a platform
  // change ever makes the device ids match.
  if (env.RAILWAY_VOLUME_MOUNT_PATH && path.resolve(env.RAILWAY_VOLUME_MOUNT_PATH) === path.resolve(root)) {
    return;
  }

  let parentStat;
  try {
    parentStat = fs.statSync(parent);
  } catch {
    parentStat = null;
  }
  if (parentStat && rootStat.dev !== parentStat.dev) return; // a real mount

  throw new Error(
    `No persistent volume is mounted at ${root}, and STORAGE_DRIVER=local. ` +
      'Uploads would be written to the container disk and destroyed by the next deploy, ' +
      'with no error shown to anyone. Mount a volume there (Railway: mount path ' +
      `${root}), or set STORAGE_DRIVER=gcs, or - only if this host keeps that directory ` +
      'across deploys, such as a VPS - set UPLOADS_PERSISTENT=1 to say so deliberately.'
  );
}

module.exports = { assertUploadsPersistent };
