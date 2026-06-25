// Storage facade. Selects the driver from STORAGE_DRIVER (default 'local') and
// exposes save/fileUrl/remove plus signFiles, which resolves file fields in an API
// response payload to servable URLs. Under 'local' every URL is a pass-through, so
// responses are unchanged; under 'gcs' they become short-lived signed URLs.

const DRIVER = (process.env.STORAGE_DRIVER || 'local').toLowerCase();

let driver;
if (DRIVER === 'local') {
  driver = require('./local.driver');
} else if (DRIVER === 'gcs') {
  driver = require('./gcs.driver'); // loaded only when selected (fails fast on bad env)
} else {
  throw new Error(`Unknown STORAGE_DRIVER "${process.env.STORAGE_DRIVER}". Use "local" or "gcs".`);
}

const save = (subdir, file) => driver.save(subdir, file);
const fileUrl = (storedPath) => driver.fileUrl(storedPath);
const remove = (storedPath) => driver.remove(storedPath);

const FILE_FIELDS = new Set(['photo_path', 'document_path']);

// Deep-copy a response payload, replacing file fields with servable URLs:
//   photo_path / document_path : string  -> awaited fileUrl
//   chain_of_custody_photos    : string[] -> [{ key, url }]  (key kept for removal)
// Only plain objects/arrays are walked; Date/Decimal/other class instances pass
// through untouched (critical: never iterate a Date's own keys).
async function signFiles(node) {
  if (node === null || typeof node !== 'object') return node;
  if (Array.isArray(node)) return Promise.all(node.map(signFiles));
  if (Object.getPrototypeOf(node) !== Object.prototype) return node;

  const out = {};
  for (const [k, v] of Object.entries(node)) {
    if (FILE_FIELDS.has(k)) {
      out[k] = await fileUrl(v);
    } else if (k === 'chain_of_custody_photos' && Array.isArray(v)) {
      out[k] = await Promise.all(v.map(async (p) => ({ key: p, url: await fileUrl(p) })));
    } else {
      out[k] = await signFiles(v);
    }
  }
  return out;
}

module.exports = { save, fileUrl, remove, signFiles };
