// The production guard for the uploads directory.
//
// The failure this exists to stop is silent and total: with STORAGE_DRIVER=local
// and no volume mounted, an upload returns 201, the database row is written, the
// photo renders for the rest of the container's life, and the next deploy
// destroys every file. Nothing errors, at any point, so the first sign of it is a
// resident's evidence photo being gone weeks later.
//
// A missing volume is therefore a refusal to boot, not a warning. A server that
// will not start gets noticed in minutes; a warning in a deploy log does not.

const { assertUploadsPersistent } = require('../src/utils/uploadsPersistence');

// Minimal fs stand-in. `dev` is the device id: a mounted volume sits on a
// DIFFERENT device from its parent directory, which is how a real mount is told
// apart from an ordinary folder inside the image.
function fakeFs({ dirs = {}, unwritable = [] } = {}) {
  return {
    statSync(p) {
      if (!(p in dirs)) {
        const e = new Error(`ENOENT: ${p}`);
        e.code = 'ENOENT';
        throw e;
      }
      return { dev: dirs[p], isDirectory: () => true };
    },
    accessSync(p) {
      if (unwritable.includes(p)) {
        const e = new Error(`EACCES: ${p}`);
        e.code = 'EACCES';
        throw e;
      }
    },
  };
}

const ROOT = '/app/uploads';
const PARENT = '/app';

// A volume: uploads is on its own device.
const mounted = fakeFs({ dirs: { [ROOT]: 66, [PARENT]: 1 } });
// No volume: uploads is just a folder in the container image.
const notMounted = fakeFs({ dirs: { [ROOT]: 1, [PARENT]: 1 } });

const run = (env, fs = notMounted) =>
  assertUploadsPersistent({ env, fs, uploadRoot: ROOT });

describe('outside production', () => {
  // Local development has no volume and needs none - the disk is the developer's
  // own and survives everything. Guarding here would block every `npm run dev`.
  test('does not throw when NODE_ENV is unset', () => {
    expect(() => run({})).not.toThrow();
  });

  test('does not throw in test', () => {
    expect(() => run({ NODE_ENV: 'test' })).not.toThrow();
  });
});

describe('in production', () => {
  test('a mounted volume passes', () => {
    expect(() => run({ NODE_ENV: 'production', STORAGE_DRIVER: 'local' }, mounted)).not.toThrow();
  });

  test('local storage with NO volume refuses to boot', () => {
    expect(() => run({ NODE_ENV: 'production', STORAGE_DRIVER: 'local' })).toThrow(/volume/i);
  });

  // The message is the whole value of the guard: whoever sees it is mid-deploy
  // and needs to know what to do, not merely that something is wrong.
  test('the refusal names the mount path and the consequence', () => {
    expect(() => run({ NODE_ENV: 'production', STORAGE_DRIVER: 'local' })).toThrow(/\/app\/uploads/);
    expect(() => run({ NODE_ENV: 'production', STORAGE_DRIVER: 'local' })).toThrow(/next deploy|lost|destroy/i);
  });

  // STORAGE_DRIVER defaults to local when unset, so the guard must too -
  // otherwise the riskiest configuration is the one that skips the check.
  test('an unset STORAGE_DRIVER is treated as local', () => {
    expect(() => run({ NODE_ENV: 'production' })).toThrow(/volume/i);
  });

  test('GCS storage needs no volume', () => {
    expect(() => run({ NODE_ENV: 'production', STORAGE_DRIVER: 'gcs' })).not.toThrow();
    expect(() => run({ NODE_ENV: 'production', STORAGE_DRIVER: 'GCS' })).not.toThrow();
  });

  // A VPS or a bare-metal host keeps uploads on an ordinary directory that is
  // perfectly persistent and shares its device with the parent. The device test
  // cannot tell that apart from a container with no volume, so the operator can
  // state it - explicitly, and in writing.
  test('UPLOADS_PERSISTENT=1 accepts an ordinary directory', () => {
    expect(() =>
      run({ NODE_ENV: 'production', STORAGE_DRIVER: 'local', UPLOADS_PERSISTENT: '1' })
    ).not.toThrow();
  });

  test('UPLOADS_PERSISTENT does not excuse a directory that cannot be written', () => {
    const readOnly = fakeFs({ dirs: { [ROOT]: 1, [PARENT]: 1 }, unwritable: [ROOT] });
    expect(() =>
      assertUploadsPersistent({
        env: { NODE_ENV: 'production', STORAGE_DRIVER: 'local', UPLOADS_PERSISTENT: '1' },
        fs: readOnly,
        uploadRoot: ROOT,
      })
    ).toThrow(/not writable/i);
  });

  // Railway names the mount in the environment; honour it as a second signal so
  // the guard still passes if a future Railway change makes the device ids match.
  test('RAILWAY_VOLUME_MOUNT_PATH pointing at the uploads root passes', () => {
    expect(() =>
      run({ NODE_ENV: 'production', STORAGE_DRIVER: 'local', RAILWAY_VOLUME_MOUNT_PATH: ROOT })
    ).not.toThrow();
  });

  test('RAILWAY_VOLUME_MOUNT_PATH pointing somewhere ELSE does not count', () => {
    expect(() =>
      run({ NODE_ENV: 'production', STORAGE_DRIVER: 'local', RAILWAY_VOLUME_MOUNT_PATH: '/data' })
    ).toThrow(/volume/i);
  });

  // A volume mounted but not yet created on disk is still a misconfiguration.
  test('a missing uploads directory refuses to boot', () => {
    const missing = fakeFs({ dirs: { [PARENT]: 1 } });
    expect(() => run({ NODE_ENV: 'production', STORAGE_DRIVER: 'local' }, missing)).toThrow();
  });
});
