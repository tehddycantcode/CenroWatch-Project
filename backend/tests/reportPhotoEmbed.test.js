// Embedding evidence photos in the printable report PDF.
//
// WHY THIS SUITE EXISTS. The PDF export used to print the single line
// "Photo attached: Yes" and no image. That was fine while the PDF was a
// convenience copy, and not fine at all once it is offered as THE retained
// record of a report - for an environmental complaint the photograph is the
// evidence, and it was the one part the export could not preserve.
//
// THE CONSTRAINT THAT MAKES THIS NON-TRIVIAL: uploads accept jpeg, png, webp,
// heic and heif (middlewares/upload.js), and pdfkit decodes only JPEG and PNG -
// read its own dispatch, which tests two magic-byte signatures and otherwise
// throws "Unknown image format." So three of the five accepted formats cannot
// go into a document unaided.
//
// The first version of this simply said so in the document. That was honest and
// not good enough: a production report filed with a webp photo printed
// "Not shown here - image/webp images cannot be embedded in a PDF", which is a
// hole in the one page that is supposed to BE the retained copy. 10% of the
// photos on production were webp when this was measured, and that share grows -
// several Android share paths and Chrome's own "copy image" produce webp.
//
// So webp/heic/heif are now CONVERTED to JPEG (sharp), and the refusal text is
// reserved for things that genuinely cannot be shown: a PDF attachment, a
// missing file, and a file whose bytes are corrupt. JPEG and PNG still pass
// through untouched, because the printout should be the photograph as filed
// rather than a re-encoding of it.
//
// The pdfkit assertions below are deliberately run against the real library
// rather than a stub: the point is to pin what prepareEmbeddable produces to
// what pdfkit actually accepts, so an upgrade that changes either one fails
// here instead of silently dropping evidence photos in production.

const zlib = require('zlib');
const { Writable } = require('stream');
const PDFDocument = require('pdfkit');
const sharp = require('sharp');
const { prepareEmbeddable, attachment } = require('../src/services/report.layout');

// A real, complete 1x1 PNG, built here rather than pasted as base64. pdfkit
// decodes PNG through png-js, which inflates the IDAT stream and rejects
// anything it considers truncated - a hand-copied literal that browsers happily
// render can still fail there, which is a confusing way to lose an afternoon.
function makePng() {
  const crcTable = [...Array(256)].map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (b) => {
    let c = 0xffffffff;
    for (const byte of b) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0); // width
  ihdr.writeUInt32BE(1, 4); // height
  ihdr[8] = 8;              // bit depth
  ihdr[9] = 2;              // colour type: truecolour
  // one scanline: filter byte 0, then RGB
  const idat = zlib.deflateSync(Buffer.from([0x00, 0xff, 0x00, 0x00]));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const PNG_1x1 = makePng();
const JPEG_1x1 = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  'base64'
);
// Headers with NO decodable image behind them. These stand for a corrupt
// upload, not for the formats themselves - the real webp is built below.
const FAKE_WEBP = Buffer.concat([
  Buffer.from('RIFF'), Buffer.from([0x1a, 0, 0, 0]), Buffer.from('WEBPVP8 '),
  Buffer.alloc(10),
]);
const FAKE_HEIC = Buffer.concat([
  Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic'), Buffer.alloc(8),
]);
const PDF = Buffer.from('%PDF-1.4\n...');

// A genuine webp, made by sharp so it is unquestionably valid. This is the
// case that was printing "Not shown here" on production.
let REAL_WEBP;
beforeAll(async () => {
  REAL_WEBP = await sharp({
    create: { width: 40, height: 30, channels: 3, background: { r: 200, g: 40, b: 40 } },
  }).webp().toBuffer();
});

describe('prepareEmbeddable - getting something pdfkit can draw', () => {
  test('passes JPEG and PNG through UNTOUCHED', async () => {
    // Not re-encoded: the printout should be the photograph as filed.
    for (const buf of [JPEG_1x1, PNG_1x1]) {
      const out = await prepareEmbeddable(buf);
      expect(out.refusal).toBeUndefined();
      expect(out.buf).toBe(buf);
      expect(out.convertedFrom).toBeUndefined();
    }
  });

  test('CONVERTS a real webp to JPEG rather than refusing it', async () => {
    // The regression this whole change exists for. A production complaint filed
    // with a webp photo printed "Not shown here - image/webp images cannot be
    // embedded in a PDF" on the page that is meant to BE the retained copy.
    const out = await prepareEmbeddable(REAL_WEBP);
    expect(out.refusal).toBeUndefined();
    expect(out.convertedFrom).toBe('image/webp');
    expect([...out.buf.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]); // JPEG
  });

  test('still refuses a PDF attachment, which a service request may have', async () => {
    const out = await prepareEmbeddable(PDF);
    expect(out.refusal).toMatch(/pdf/i);
  });

  test('refuses an unreadable, empty or corrupt file without throwing', async () => {
    // storage.read() answers null when the object is gone - a report whose file
    // was lost must still produce a printout. The fake webp/heic headers stand
    // for an upload whose bytes are damaged: the signature parses, the image
    // does not decode, and sharp cannot rescue it.
    for (const buf of [null, Buffer.alloc(0), Buffer.from('not an image'), FAKE_WEBP, FAKE_HEIC]) {
      const out = await prepareEmbeddable(buf);
      expect(out.refusal).toEqual(expect.any(String));
      expect(out.refusal.trim().length).toBeGreaterThan(0); // it gets printed
    }
  });

  test('sharp can still decode heif, which iPhone uploads arrive as', () => {
    // A capability pin. sharp's HEIF support depends on how libvips was built,
    // so a future install without libheif would silently start refusing every
    // iPhone photo. Fail here instead.
    expect(sharp.format.heif && sharp.format.heif.input && sharp.format.heif.input.buffer).toBeTruthy();
  });
});

describe('the rule matches what pdfkit actually does', () => {
  // Pins our definition of embeddable to the library. If a pdfkit upgrade adds
  // or drops a format, one of these fails instead of a report silently losing
  // its evidence photo in production.
  // The document is piped to a sink and ENDED, not just built. pdfkit defers
  // PNG inflation until the document is finalised, so a doc that is merely
  // constructed reports success and then throws asynchronously, outside the
  // test, taking the worker with it. Driving it to 'finish' is what actually
  // proves the bytes made it into a PDF.
  const embedAndFinish = (buf) =>
    new Promise((resolve, reject) => {
      let doc;
      try {
        doc = new PDFDocument({ size: 'A4', margin: 50 });
        doc.image(buf, 50, 50, { fit: [100, 100] });
      } catch (err) {
        reject(err); // synchronous rejection: unknown format
        return;
      }
      const sink = new Writable({ write: (_c, _e, cb) => cb() });
      sink.on('finish', resolve);
      sink.on('error', reject);
      doc.on('error', reject);
      doc.pipe(sink);
      doc.end();
    });

  test('whatever prepareEmbeddable hands back, pdfkit really encodes', async () => {
    // Including the CONVERTED webp - proving the conversion produces something
    // that survives all the way into a finished PDF, not merely something whose
    // first three bytes look like a JPEG.
    for (const source of [JPEG_1x1, PNG_1x1, REAL_WEBP]) {
      const out = await prepareEmbeddable(source);
      expect(out.refusal).toBeUndefined();
      await expect(embedAndFinish(out.buf)).resolves.toBeUndefined();
    }
  });

  test('pdfkit still rejects the raw formats, which is why conversion is needed', async () => {
    // The reason prepareEmbeddable exists at all. Hand pdfkit a webp directly
    // and it throws; if a future version stops throwing, this failing is the
    // signal that the conversion step could be dropped.
    await expect(embedAndFinish(REAL_WEBP)).rejects.toThrow();
    await expect(embedAndFinish(PDF)).rejects.toThrow();
  });
});

describe('attachment() - drawing one attachment onto a page', () => {
  const freshDoc = () => new PDFDocument({ size: 'A4', margin: 50 });

  test('embeds a usable photo and reports that it did', async () => {
    const doc = freshDoc();
    const before = doc.y;
    await expect(attachment(doc, JPEG_1x1, 'Evidence photograph')).resolves.toBe(true);
    // It advanced down the page by roughly the image box, so whatever is
    // written next does not land on top of the picture.
    expect(doc.y).toBeGreaterThan(before + 200);
  });

  test('embeds a webp by converting it', async () => {
    await expect(attachment(freshDoc(), REAL_WEBP, 'Evidence photograph')).resolves.toBe(true);
  });

  test('A CORRUPT FILE WITH A VALID SIGNATURE DOES NOT THROW', () => {
    // This is not hypothetical - it is what the tiny seeded placeholder photos
    // on this database actually are. Format screening cannot catch it: the
    // magic bytes say PNG, and only png-js inflating the IDAT discovers the
    // truncation, at which point pdfkit throws "Incomplete or corrupt PNG file"
    // synchronously. The report must still print, because the alternative is
    // that one bad upload makes a report impossible to export.
    const truncated = PNG_1x1.subarray(0, PNG_1x1.length - 12);
    return expect(attachment(freshDoc(), truncated, 'Evidence photograph')).resolves.toBe(false);
  });

  test('a missing file does not throw and reports that nothing was drawn', async () => {
    await expect(attachment(freshDoc(), null, 'Evidence photograph')).resolves.toBe(false);
  });

  test('an undecodable file does not throw', async () => {
    for (const buf of [FAKE_WEBP, FAKE_HEIC, PDF]) {
      await expect(attachment(freshDoc(), buf, 'Supporting document')).resolves.toBe(false);
    }
  });
});
