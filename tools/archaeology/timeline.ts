import { inflateSync } from 'node:zlib';
import { inspectSwf } from './swf';

/** Read-only timeline/placement facts. Does not evaluate frame scripts or export artwork. */
export function inspectTimeline(input: Buffer, className: string) {
  const header = inspectSwf(input);
  const bytes = input.toString('ascii', 0, 3) === 'CWS'
    ? Buffer.concat([input.subarray(0, 8), inflateSync(input.subarray(8))]) : input;
  let spriteId: number | undefined;
  for (const tag of header.tags.filter(t => t.code === 76)) {
    let p = tag.payloadOffset;
    const count = bytes.readUInt16LE(p); p += 2;
    for (let i = 0; i < count; i++) {
      const id = bytes.readUInt16LE(p); p += 2;
      const end = bytes.indexOf(0, p);
      if (end < p || end >= tag.payloadOffset + tag.length) throw Error('Invalid SymbolClass');
      const name = bytes.toString('utf8', p, end); p = end + 1;
      if (name === className) spriteId = id;
    }
  }
  const sprite = header.tags.find(t => t.code === 39 && bytes.readUInt16LE(t.payloadOffset) === spriteId);
  if (!sprite) throw Error(`Sprite class not found: ${className}`);
  const labels: { frame: number; name: string }[] = [];
  const placements: { frame: number; depth: number; name?: string; character?: number; x?: number; y?: number }[] = [];
  const operations: { frame: number; depth: number; remove?: boolean; move?: boolean; placement?: typeof placements[number] }[] = [];
  let frame = 1, p = sprite.payloadOffset + 4;
  const end = sprite.payloadOffset + sprite.length;
  while (p < end) {
    const head = bytes.readUInt16LE(p); p += 2;
    const code = head >> 6;
    let size = head & 63;
    if (size === 63) { size = bytes.readUInt32LE(p); p += 4; }
    const next = p + size;
    if (next > end) throw Error('Nested tag exceeds sprite');
    if (code === 1) frame++;
    if (code === 43) labels.push({ frame, name: bytes.toString('utf8', p, bytes.indexOf(0, p)) });
    if (code === 5 || code === 28) operations.push({ frame, depth: bytes.readUInt16LE(p + (code === 5 ? 2 : 0)), remove: true });
    if (code === 26 || code === 70) {
      let q = p;
      const flags = bytes[q++];
      const flags2 = code === 70 ? bytes[q++] : 0;
      const depth = bytes.readUInt16LE(q); q += 2;
      if ((flags2 & 8) || ((flags2 & 16) && (flags & 2))) q = bytes.indexOf(0, q) + 1;
      const record: typeof placements[number] = { frame, depth };
      if (flags & 2) { record.character = bytes.readUInt16LE(q); q += 2; }
      let bit = q * 8;
      const read = (n: number, signed = false) => {
        if (bit + n > next * 8) throw Error('Truncated placement');
        let value = 0;
        for (let i = 0; i < n; i++, bit++) value = value * 2 + ((bytes[bit >> 3] >> (7 - bit % 8)) & 1);
        return signed && n > 0 && value >= 2 ** (n - 1) ? value - 2 ** n : value;
      };
      if (flags & 4) {
        if (read(1)) { const n = read(5); read(n, true); read(n, true); }
        if (read(1)) { const n = read(5); read(n, true); read(n, true); }
        const n = read(5);
        record.x = read(n, true) / 20; record.y = read(n, true) / 20;
        q = Math.ceil(bit / 8);
      }
      if (flags & 8) {
        bit = q * 8;
        const add = read(1), mult = read(1), n = read(4);
        if (mult) for (let i = 0; i < 4; i++) read(n, true);
        if (add) for (let i = 0; i < 4; i++) read(n, true);
        q = Math.ceil(bit / 8);
      }
      if (flags & 16) q += 2;
      if (flags & 32) record.name = bytes.toString('utf8', q, bytes.indexOf(0, q));
      placements.push(record);
      operations.push({ frame, depth, move: !!(flags & 1), placement: record });
    }
    p = next;
    if (code === 0) break;
  }
  return { sha256: header.sha256, className, spriteId, frames: bytes.readUInt16LE(sprite.payloadOffset + 2), labels, placements, operations };
}

/** Resolve inherited placement fields and removal in original tag order. */
export function displayListAt(timeline: ReturnType<typeof inspectTimeline>, frame: number) {
  if (!Number.isInteger(frame) || frame < 1 || frame > timeline.frames) throw Error('Invalid frame');
  const depths = new Map<number, typeof timeline.placements[number]>();
  for (const op of timeline.operations) {
    if (op.frame > frame) break;
    if (op.remove) depths.delete(op.depth);
    else if (op.placement) depths.set(op.depth, { ...(op.move ? depths.get(op.depth) : {}), ...op.placement });
  }
  return [...depths.values()].sort((a, b) => a.depth - b.depth);
}
