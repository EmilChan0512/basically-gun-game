import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';

/** Reads SWF structure without evaluating ActionScript or loading network assets. */
export function inspectSwf(input: Buffer) {
  if (input.length < 12) throw new Error('Truncated SWF header');
  const signature = input.toString('ascii', 0, 3);
  if (!['FWS', 'CWS'].includes(signature)) throw new Error('Expected FWS/CWS. Decompress ZWS with FFDec first.');
  const bytes = signature === 'CWS' ? Buffer.concat([input.subarray(0, 8), inflateSync(input.subarray(8), { maxOutputLength: 512 * 1024 * 1024 })]) : input;
  const declaredLength = bytes.readUInt32LE(4);
  if (bytes.length !== declaredLength) throw new Error('SWF declared length does not match uncompressed data');
  let bit = 64;
  const bits = (count: number, signed = false) => {
    if (bit + count > bytes.length * 8) throw new Error('Truncated SWF RECT');
    let value = 0;
    for (let i = 0; i < count; i++, bit++) value = value * 2 + ((bytes[Math.floor(bit / 8)] >> (7 - bit % 8)) & 1);
    return signed && value >= 2 ** (count - 1) ? value - 2 ** count : value;
  };
  const nbits = bits(5);
  if (nbits === 0) throw new Error('Invalid RECT bit width');
  const rectTwips = { xmin: bits(nbits, true), xmax: bits(nbits, true), ymin: bits(nbits, true), ymax: bits(nbits, true) };
  const frameRateOffset = Math.ceil(bit / 8);
  if (frameRateOffset + 4 > bytes.length) throw new Error('Truncated SWF timing header');
  const frameRate = bytes.readUInt16LE(frameRateOffset) / 256;
  const frameCount = bytes.readUInt16LE(frameRateOffset + 2);
  const tags: { code: number; headerOffset: number; payloadOffset: number; length: number }[] = [];
  const sprites: { id: number; frames: number }[] = [];
  const metadata: { offset: number; text: string }[] = [];
  let cursor = frameRateOffset + 4;
  while (cursor < bytes.length) {
    if (cursor + 2 > bytes.length) throw new Error('Truncated SWF tag');
    const headerOffset = cursor;
    const header = bytes.readUInt16LE(cursor); cursor += 2;
    const code = header >> 6;
    let length = header & 63;
    if (length === 63) {
      if (cursor + 4 > bytes.length) throw new Error('Truncated long SWF tag');
      length = bytes.readUInt32LE(cursor); cursor += 4;
    }
    if (cursor + length > bytes.length) throw new Error('SWF tag exceeds file length');
    tags.push({ code, headerOffset, payloadOffset: cursor, length });
    if (code === 39 && length >= 4) sprites.push({ id: bytes.readUInt16LE(cursor), frames: bytes.readUInt16LE(cursor + 2) });
    if (code === 77) metadata.push({ offset: cursor, text: bytes.toString('utf8', cursor, cursor + length).replace(/\0$/, '') });
    cursor += length;
    if (code === 0) break;
  }
  return {
    signature, formatVersion: bytes[3], bytes: input.length, declaredLength,
    sha256: createHash('sha256').update(input).digest('hex'),
    rectTwips, stageWidthPx: (rectTwips.xmax - rectTwips.xmin) / 20, stageHeightPx: (rectTwips.ymax - rectTwips.ymin) / 20,
    frameRate, frameCount, frameRateOffset, frameCountOffset: frameRateOffset + 2,
    tags, sprites, totalSpriteFrames: sprites.reduce((sum, sprite) => sum + sprite.frames, 0), metadata,
    trailingBytes: bytes.length - cursor,
    offsetConvention: 'Zero-based, uncompressed SWF bytes; RECT is signed MSB-first; frameRate is UI16 LE /256. No code executed.',
  };
}
