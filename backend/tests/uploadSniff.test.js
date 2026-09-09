// Magic-byte validation for uploads.
//
// Multer's fileFilter can only check the Content-Type the CLIENT sent, which is
// a claim. These tests are all variations on the same attack: send a file whose
// declared type and actual bytes disagree.

const { sniffMime, sniffGuard, IMAGE_MIME, DOC_MIME } = require('../src/middlewares/upload');

// Minimum 12 bytes - shorter than that and there is nothing to identify.
const pad = (bytes) => Buffer.concat([Buffer.from(bytes), Buffer.alloc(16)]);

const JPEG = pad([0xff, 0xd8, 0xff, 0xe0]);
const PNG = pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(8)]);
const HEIC = Buffer.concat([Buffer.alloc(4), Buffer.from('ftyp'), Buffer.from('heic'), Buffer.alloc(8)]);
const PDF = pad(Buffer.from('%PDF-1.7\n'));

const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const HTML = Buffer.from('<!doctype html><html><body><script>alert(1)</script></body></html>');
const MP4 = Buffer.concat([Buffer.alloc(4), Buffer.from('ftyp'), Buffer.from('isom'), Buffer.alloc(8)]);

describe('sniffMime', () => {
  test.each([
    ['JPEG', JPEG, 'image/jpeg'],
    ['PNG', PNG, 'image/png'],
    ['WEBP', WEBP, 'image/webp'],
    ['HEIC (what an iPhone actually uploads)', HEIC, 'image/heic'],
    ['PDF', PDF, 'application/pdf'],
  ])('identifies %s', (_label, buf, expected) => {
    expect(sniffMime(buf)).toBe(expected);
  });

  test.each([
    ['SVG — a document that can carry script, and has no magic number', SVG],
    ['HTML', HTML],
    ['an MP4 wearing an image filename', MP4],
    ['random bytes', pad([0x00, 0x01, 0x02, 0x03])],
    ['a file too short to identify', Buffer.from([0xff, 0xd8])],
    ['not a buffer', 'not a buffer'],
  ])('refuses to identify %s', (_label, buf) => {
    expect(sniffMime(buf)).toBeNull();
  });

  // "RIFF" alone is also WAV and AVI; the WEBP marker at byte 8 is what
  // distinguishes them.
  test('a RIFF container that is not WEBP is refused', () => {
    const wav = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE'), Buffer.alloc(8)]);
    expect(sniffMime(wav)).toBeNull();
  });
});

describe('sniffGuard', () => {
  const run = (guard, req) =>
    new Promise((resolve) => {
      guard(req, {}, (err) => resolve(err));
    });

  test('lets a real JPEG through', async () => {
    const req = { file: { buffer: JPEG, mimetype: 'image/jpeg' } };
    expect(await run(sniffGuard(IMAGE_MIME), req)).toBeUndefined();
  });

  // The whole point: the declared type is right, the bytes are not.
  test('rejects an SVG declared as image/jpeg', async () => {
    const req = { file: { buffer: SVG, mimetype: 'image/jpeg' } };
    const err = await run(sniffGuard(IMAGE_MIME), req);
    expect(err).toBeDefined();
    expect(err.statusCode).toBe(422);
    expect(err.message).toMatch(/not a readable image/);
  });

  test('rejects HTML declared as a PDF on the document route', async () => {
    const req = { file: { buffer: HTML, mimetype: 'application/pdf' } };
    const err = await run(sniffGuard(DOC_MIME), req);
    expect(err.statusCode).toBe(422);
    expect(err.message).toMatch(/image or PDF/);
  });

  // A PDF is legitimate on the request-document route and not on a photo route,
  // and the bytes decide, not the filename.
  test('rejects a genuine PDF where only images are allowed', async () => {
    const req = { file: { buffer: PDF, mimetype: 'image/jpeg' } };
    expect((await run(sniffGuard(IMAGE_MIME), req)).statusCode).toBe(422);
  });

  test('accepts a genuine PDF where documents are allowed', async () => {
    const req = { file: { buffer: PDF, mimetype: 'application/pdf' } };
    expect(await run(sniffGuard(DOC_MIME), req)).toBeUndefined();
  });

  // The storage driver records file.mimetype as the object's Content-Type, so
  // it has to say what the bytes say, not what the client claimed.
  test('corrects a mislabelled but legitimate image', async () => {
    const req = { file: { buffer: PNG, mimetype: 'image/jpeg' } };
    expect(await run(sniffGuard(IMAGE_MIME), req)).toBeUndefined();
    expect(req.file.mimetype).toBe('image/png');
  });

  test('checks every file of a multi-file upload, not just the first', async () => {
    const req = { files: [{ buffer: JPEG, mimetype: 'image/jpeg' }, { buffer: SVG, mimetype: 'image/jpeg' }] };
    expect((await run(sniffGuard(IMAGE_MIME), req)).statusCode).toBe(422);
  });

  test('passes a multi-file upload where all files are genuine', async () => {
    const req = { files: [{ buffer: JPEG, mimetype: 'image/jpeg' }, { buffer: PNG, mimetype: 'image/png' }] };
    expect(await run(sniffGuard(IMAGE_MIME), req)).toBeUndefined();
  });

  // The photo is optional on every report form.
  test('a request with no file at all passes', async () => {
    expect(await run(sniffGuard(IMAGE_MIME), {})).toBeUndefined();
  });
});
