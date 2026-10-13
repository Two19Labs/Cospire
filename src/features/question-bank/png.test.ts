import { crc32 } from "node:zlib";

import { unzlibSync } from "fflate";
import { describe, expect, it } from "vitest";

import { encodePng, pdfImageKind } from "./png";

// Read the file back by hand: signature, then length-type-body-CRC chunks.
function chunks(png: Uint8Array) {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const out: { body: Uint8Array; crcOk: boolean; type: string }[] = [];
  let offset = 8;
  while (offset < png.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...png.subarray(offset + 4, offset + 8));
    const body = png.subarray(offset + 8, offset + 8 + length);
    const crc = view.getUint32(offset + 8 + length);
    out.push({ body, crcOk: crc === crc32(png.subarray(offset + 4, offset + 8 + length)), type });
    offset += 12 + length;
  }
  return out;
}

describe("encodePng", () => {
  it("writes a valid RGB PNG whose rows decode back to the pixels", () => {
    // Two pixels wide, one high: red then green.
    const png = encodePng({ data: Uint8Array.from([255, 0, 0, 0, 255, 0]), height: 1, kind: pdfImageKind.rgb24bpp, width: 2 });
    expect(png).not.toBeNull();
    expect([...png!.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    const parts = chunks(png!);
    expect(parts.map((part) => part.type)).toEqual(["IHDR", "IDAT", "IEND"]);
    expect(parts.every((part) => part.crcOk)).toBe(true);

    const header = new DataView(parts[0]!.body.buffer, parts[0]!.body.byteOffset);
    expect(header.getUint32(0)).toBe(2);
    expect(header.getUint32(4)).toBe(1);
    expect([parts[0]!.body[8], parts[0]!.body[9]]).toEqual([8, 2]);

    // Filter "Sub": the second pixel is stored as its difference from the first.
    const row = unzlibSync(parts[1]!.body);
    expect([...row]).toEqual([1, 255, 0, 0, (0 - 255) & 0xff, 255, 0]);
  });

  it("keeps alpha for RGBA and packs 1-bit pictures as they are", () => {
    const rgba = encodePng({ data: new Uint8Array(4 * 3 * 2), height: 2, kind: pdfImageKind.rgba32bpp, width: 3 });
    expect(chunks(rgba!)[0]!.body[9]).toBe(6);

    // Nine pixels wide is two bytes a row in 1-bit.
    const mono = encodePng({ data: Uint8Array.from([0b10101010, 0b10000000]), height: 1, kind: pdfImageKind.grayscale1bpp, width: 9 });
    const parts = chunks(mono!);
    expect([parts[0]!.body[8], parts[0]!.body[9]]).toEqual([1, 0]);
    expect([...unzlibSync(parts[1]!.body)]).toEqual([0, 0b10101010, 0b10000000]);
  });

  it("refuses an unknown kind, a short buffer and an empty picture", () => {
    expect(encodePng({ data: new Uint8Array(12), height: 2, kind: 9, width: 2 })).toBeNull();
    expect(encodePng({ data: new Uint8Array(5), height: 2, kind: pdfImageKind.rgb24bpp, width: 2 })).toBeNull();
    expect(encodePng({ data: new Uint8Array(0), height: 0, kind: pdfImageKind.rgb24bpp, width: 0 })).toBeNull();
  });
});
