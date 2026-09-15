import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { cleanPNG, toWorkflow } from '../../tools/ui-art.mjs';

describe('local art pipeline', () => {
  it('rejects non-PNG and truncated chunks before publishing', () => {
    expect(() => cleanPNG(Buffer.from('not an image'))).toThrow('Expected PNG');
    const valid = readFileSync('public/assets/ui-kit/v1/button.png');
    expect(() => cleanPNG(valid.subarray(0, valid.length - 5))).toThrow();
  });

  it('preserves image data while removing workflow metadata', () => {
    const original = readFileSync('public/assets/ui-kit/v1/button.png');
    const payload = Buffer.from('prompt\0private-workflow');
    const chunk = Buffer.alloc(payload.length + 12);
    chunk.writeUInt32BE(payload.length); chunk.write('tEXt', 4); payload.copy(chunk, 8);
    const withMetadata = Buffer.concat([original.subarray(0, 33), chunk, original.subarray(33)]);
    expect(cleanPNG(withMetadata)).toEqual(original);
  });

  it('retains link slots and fixed seed widgets in editable ComfyUI exports', () => {
    const graph = { '1': { class_type: 'Noise', inputs: { seed: 123 } }, '2': { class_type: 'Sink', inputs: { noise: ['1', 0], filename: 'example' } } };
    const info = {
      Noise: { input: { required: { seed: ['INT', { control_after_generate: true }] } }, output: ['NOISE'] },
      Sink: { input: { required: { noise: ['NOISE'], filename: ['STRING'] } }, output: [] },
    };
    const workflow = toWorkflow(graph, info);
    expect(workflow.nodes[0].widgets_values).toEqual([123, 'fixed']);
    expect(workflow.links).toEqual([[1, 1, 0, 2, 0, 'NOISE']]);
    expect(workflow.nodes[0].outputs[0].links).toEqual([1]);
    expect(workflow.nodes[1].inputs[0].link).toBe(1);
  });
});
