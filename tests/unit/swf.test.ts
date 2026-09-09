import { describe, expect, it } from 'vitest';
import { deflateSync } from 'node:zlib';
import { inspectSwf } from '../../tools/archaeology/swf';

// Synthetic empty SWF: 800x600 RECT, 30 fps, one declared frame, End tag. No game data.
const fixture = () => Buffer.from('4657530a17000000780007d00000177000001e01000000', 'hex');
describe('non-executing SWF inspector', () => {
  it('decodes RECT, fixed8 frame rate and exact tag boundaries', () => {
    const result = inspectSwf(fixture());
    expect(result).toMatchObject({ signature: 'FWS', stageWidthPx: 800, stageHeightPx: 600, frameRate: 30, frameCount: 1, trailingBytes: 0, frameRateOffset: 17 });
    expect(result.tags).toEqual([{ code: 0, headerOffset: 21, payloadOffset: 23, length: 0 }]);
  });
  it('supports compressed CWS and fractional frame rates', () => {
    const data = fixture(); data.writeUInt16LE(31.5 * 256, 17); data.write('CWS');
    const compressed = Buffer.concat([data.subarray(0, 8), deflateSync(data.subarray(8))]);
    expect(inspectSwf(compressed)).toMatchObject({ signature: 'CWS', frameRate: 31.5, stageWidthPx: 800 });
  });
  it('rejects truncation, invalid tags and unsupported signatures', () => {
    expect(() => inspectSwf(fixture().subarray(0, 19))).toThrow('length');
    const bad = fixture(); bad.writeUInt16LE((77 << 6) | 40, 21);
    expect(() => inspectSwf(bad)).toThrow('tag exceeds');
    bad.write('ZWS'); expect(() => inspectSwf(bad)).toThrow('Decompress ZWS');
  });
});
