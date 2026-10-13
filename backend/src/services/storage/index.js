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
// Bytes back, for embedding an evidence photo in a generated PDF. Both drivers
// answer null instead of throwing when the file is missing, so a report whose
// upload was lost still prints - see report.layout.attachment().
const read = (storedPath) => driver.read(storedPath);

// An EXPLICIT allowlist, not a `_path` suffix rule: a new column is only signed
// once somebody adds it here, and an unsigned path 403s at /uploads rather than
// failing quietly. closure_certificate_path is resident-visible, so it is the
// one entry here that is served outside the staff console.
const FILE_FIELDS = new Set([
  'photo_path', 'document_path', 'resolution_proof_path', 'completion_proof_path',
  'closure_certificate_path',
]);

// Columns holding an ARRAY of stored paths, signed element by element.
//
// Separate from chain_of_custody_photos below, which returns { key, url } pairs
// because staff can delete an individual custody photo and the request needs the
// stored key to say which. Nobody deletes a resident's report photo, so these
// return plain signed URLs - the shape every client already renders.
const FILE_LIST_FIELDS = new Set(['photo_paths', 'document_paths']);

// Deep-copy a response payload, replacing file fields with servable URLs:
//   photo_path / document_path / *_proof_path : string  -> awaited fileUrl
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
    } else if (FILE_LIST_FIELDS.has(k)) {
      // A JSON column, so it is null on every row filed before multi-upload and
      // the clients fall back to the single photo_path. Passing null straight
      // through keeps that distinguishable from an empty list.
      out[k] = Array.isArray(v) ? await Promise.all(v.map((p) => fileUrl(p))) : v;
    } else if (k === 'chain_of_custody_photos' && Array.isArray(v)) {
      out[k] = await Promise.all(v.map(async (p) => ({ key: p, url: await fileUrl(p) })));
    } else {
      out[k] = await signFiles(v);
    }
  }
  return out;
}

module.exports = { save, fileUrl, remove, read, signFiles };
