// Reading uploads off a req that accepts BOTH the old singular field name and
// the new plural one.
//
// Every report route is registered with upload.fields([...]), which sets
// req.files to an object keyed by field name. A new client posts `photos`; every
// installed APK and every cached web bundle still posts `photo`. Both have to
// work for as long as old builds are in the wild - dropping the singular would
// 422 those clients AFTER the resident had filled in the whole form, which is
// the failure shape CLAUDE.md records for the register token and the walk-in
// location rule.
//
// Order matters and is deliberate: the singular file comes FIRST, so a client
// that somehow sends both keeps the one it considered primary as photo_path.

/**
 * All files posted under either name, as one flat array.
 * @param {object} req  an Express request processed by upload.fields()
 * @param {string} one  the singular field name, e.g. 'photo'
 * @param {string} many the plural field name, e.g. 'photos'
 */
function filesFrom(req, one, many) {
  const bucket = req.files && !Array.isArray(req.files) ? req.files : {};
  return [...(bucket[one] || []), ...(bucket[many] || [])];
}

/**
 * Persist every file and return { first, all }.
 *
 * `first` is what goes in the existing single column (photo_path /
 * document_path), which the queues, the tracking card, the PDF and both
 * My Reports lists still read. `all` is the full list for the new JSON column.
 * Both are null/empty when nothing was uploaded, so a caller can treat "no
 * files" as one case rather than two.
 */
async function saveAll(storage, subdir, files) {
  const paths = [];
  for (const f of files) paths.push(await storage.save(subdir, f));
  return { first: paths[0] || null, all: paths };
}

module.exports = { filesFrom, saveAll };
