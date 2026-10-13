// Raw pixels to a PNG file, for the pictures the PDF importer takes out.
//
// PDF.js hands an embedded picture back decoded -- width, height and a flat
// array of pixels -- not as the JPEG or PNG the author pasted in. The bucket
// stores files, so the pixels are encoded again here. `fflate` already does the
// compression for the Word importer; a PNG is that compression plus three short
// chunks, so no image library is needed for it.
//
// The `kind` values are PDF.js's own `ImageKind`: 1 is one bit per pixel
// (a set bit is white, which is also what a 1-bit PNG means), 2 is RGB and 3 is
// RGBA. Anything else is refused by returning null.

import { zlibSync } from "fflate";

export const pdfImageKind = { grayscale1bpp: 1, rgb24bpp: 2, rgba32bpp: 3 } as const;

const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + body.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, body.length);
  for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
  out.set(body, 8);
  view.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)));
  return out;
}

export function encodePng(image: { data: Uint8Array | Uint8ClampedArray; height: number; kind: number; width: number }): Uint8Array | null {
  const { data, height, kind, width } = image;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) return null;

  // Bit depth, PNG colour type, and bytes per row of the source.
  const format =
    kind === pdfImageKind.grayscale1bpp
      ? { bitDepth: 1, channels: 1, colourType: 0, rowBytes: Math.ceil(width / 8) }
      : kind === pdfImageKind.rgb24bpp
        ? { bitDepth: 8, channels: 3, colourType: 2, rowBytes: width * 3 }
        : kind === pdfImageKind.rgba32bpp
          ? { bitDepth: 8, channels: 4, colourType: 6, rowBytes: width * 4 }
          : null;
  if (!format || data.length < format.rowBytes * height) return null;

  // Each row gets a filter byte. "Sub" (1) stores each byte as its difference
  // from the pixel to its left, which shrinks photographs a great deal and costs
  // flat charts nothing; a 1-bit row has no whole pixels to subtract, so it is
  // stored as it is (0).
  const stride = format.rowBytes + 1;
  const filtered = new Uint8Array(stride * height);
  const step = format.bitDepth === 8 ? format.channels : 0;
  for (let y = 0; y < height; y += 1) {
    const from = y * format.rowBytes;
    const to = y * stride;
    filtered[to] = step ? 1 : 0;
    for (let x = 0; x < format.rowBytes; x += 1) {
      const value = data[from + x]!;
      filtered[to + 1 + x] = step && x >= step ? (value - data[from + x - step]!) & 0xff : value;
    }
  }

  const header = new Uint8Array(13);
  const headerView = new DataView(header.buffer);
  headerView.setUint32(0, width);
  headerView.setUint32(4, height);
  header[8] = format.bitDepth;
  header[9] = format.colourType;
  // Compression, filter method and interlace are all 0, the only values PNG has.

  const parts = [
    Uint8Array.from(signature),
    chunk("IHDR", header),
    chunk("IDAT", zlibSync(filtered, { level: 6 })),
    chunk("IEND", new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
