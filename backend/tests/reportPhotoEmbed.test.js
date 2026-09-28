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
// throws "Unknown image format." So a third of the accepted formats cannot go
// into the document at all.
//
// The rule is therefore: embed what can be embedded, and SAY SO IN THE
// DOCUMENT when a photo exists but could not be. Silently omitting it would be
// the worst outcome - a printout that looks complete while the evidence is
// missing, handed to someone who is about to delete the original.
//
// The pdfkit assertions below are deliberately run against the real library
// rather than a stub: the whole point is to pin our idea of "embeddable" to
// what pdfkit actually accepts, so an upgrade that changes it fails here.

const zlib = require('zlib');
const { Writable } = require('stream');
const PDFDocument = require('pdfkit');
const { embedRefusal, attachment } = require('../src/services/report.layout');

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
// RIFF....WEBP - accepted by the uploader, rejected by pdfkit.
const WEBP = Buffer.concat([
  Buffer.from('RIFF'), Buffer.from([0x1a, 0, 0, 0]), Buffer.from('WEBPVP8 '),
  Buffer.alloc(10),
]);
// ....ftypheic
const HEIC = Buffer.concat([
  Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic'), Buffer.alloc(8),
]);
const PDF = Buffer.from('%PDF-1.4\n...');

describe('embedRefusal - which attachments can go into the document', () => {
  test('accepts the two formats pdfkit can decode', () => {
    expect(embedRefusal(JPEG_1x1)).toBeNull();
    expect(embedRefusal(PNG_1x1)).toBeNull();
  });

  test('refuses the formats the UPLOADER accepts but pdfkit cannot decode', () => {
    // These are not hypothetical: upload.js allows all three, so a resident can
    // file a report whose photo cannot be embedded. That has to be visible.
    for (const buf of [WEBP, HEIC]) {
      expect(embedRefusal(buf)).toEqual(expect.any(String));
    }
  });

  test('refuses a PDF attachment, which a service request may legitimately have', () => {
    const reason = embedRefusal(PDF);
    expect(reason).toEqual(expect.any(String));
    expect(reason).toMatch(/pdf/i);
  });

  test('refuses an unreadable or empty file without throwing', () => {
    // storage.read() answers null when the object is gone - a report whose file
    // was lost must still produce a printout.
    expect(embedRefusal(null)).toEqual(expect.any(String));
    expect(embedRefusal(Buffer.alloc(0))).toEqual(expect.any(String));
    expect(embedRefusal(Buffer.from('not an image at all'))).toEqual(expect.any(String));
  });

  test('every refusal is a non-empty sentence, because it is printed', () => {
    for (const buf of [WEBP, HEIC, PDF, null, Buffer.alloc(0)]) {
      const reason = embedRefusal(buf);
      expect(typeof reason).toBe('string');
      expect(reason.trim().length).toBeGreaterThan(0);
    }
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

  test('pdfkit really encodes what embedRefusal accepts', async () => {
    for (const buf of [JPEG_1x1, PNG_1x1]) {
      expect(embedRefusal(buf)).toBeNull();
      await expect(embedAndFinish(buf)).resolves.toBeUndefined();
    }
  });

  test('pdfkit really rejects what embedRefusal refuses', async () => {
    for (const buf of [WEBP, HEIC, PDF]) {
      expect(embedRefusal(buf)).toEqual(expect.any(String));
      await expect(embedAndFinish(buf)).rejects.toThrow();
    }
  });
});

describe('attachment() - drawing one attachment onto a page', () => {
  const freshDoc = () => new PDFDocument({ size: 'A4', margin: 50 });

  test('embeds a usable photo and reports that it did', () => {
    const doc = freshDoc();
    const before = doc.y;
    expect(attachment(doc, JPEG_1x1, 'Evidence photograph')).toBe(true);
    // It advanced down the page by roughly the image box, so whatever is
    // written next does not land on top of the picture.
    expect(doc.y).toBeGreaterThan(before + 200);
  });

  test('A CORRUPT FILE WITH A VALID SIGNATURE DOES NOT THROW', () => {
    // This is not hypothetical - it is what the seeded placeholder photos on
    // this database actually are. embedRefusal cannot catch it: the magic bytes
    // say PNG, and only png-js inflating the IDAT discovers the truncation, at
    // which point pdfkit throws "Incomplete or corrupt PNG file" synchronously.
    // The report must still print, because the alternative is that one bad
    // upload makes a report impossible to export.
    const truncated = PNG_1x1.subarray(0, PNG_1x1.length - 12);
    expect(embedRefusal(truncated)).toBeNull(); // the signature still looks fine
    const doc = freshDoc();
    expect(() => attachment(doc, truncated, 'Evidence photograph')).not.toThrow();
    expect(attachment(freshDoc(), truncated, 'Evidence photograph')).toBe(false);
  });

  test('a missing file does not throw and reports that nothing was drawn', () => {
    expect(attachment(freshDoc(), null, 'Evidence photograph')).toBe(false);
  });

  test('an unsupported format does not throw', () => {
    for (const buf of [WEBP, HEIC, PDF]) {
      expect(attachment(freshDoc(), buf, 'Supporting document')).toBe(false);
    }
  });
});
