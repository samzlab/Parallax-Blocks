import { describe, expect, it } from 'vitest';
import { deltaE2000, matchImage, rgbToLab } from '../src/domain/color';
import { BLOCK_PALETTE, PALETTE_PRESETS } from '../src/data/palette';

describe('color matching',()=>{
  it('matches the CIEDE2000 reference pair',()=>{
    expect(deltaE2000({l:50,a:2.6772,b:-79.7751},{l:50,a:0,b:-82.7485})).toBeCloseTo(2.0425,4);
  });
  it('maps exact palette colors deterministically',()=>{
    const block=PALETTE_PRESETS.concrete[5]!;
    const output=matchImage(Uint8ClampedArray.from(block.rgb),1,1,[block]);
    expect(output.paletteIndices[0]).toBe(0);expect(output.meanDeltaE).toBeCloseTo(0,8);
  });
  it('converts black and white to expected Lab lightness',()=>{
    expect(rgbToLab(0,0,0).l).toBeCloseTo(0,5);expect(rgbToLab(255,255,255).l).toBeCloseTo(100,4);
  });
  it('offers 120 unique safe full cubes across the expanded color gamut',()=>{
    expect(BLOCK_PALETTE).toHaveLength(120);expect(PALETTE_PRESETS.full).toHaveLength(120);expect(new Set(BLOCK_PALETTE.map(block=>block.id)).size).toBe(120);
    expect(BLOCK_PALETTE).toEqual(expect.arrayContaining([expect.objectContaining({id:'minecraft:diamond_block',rgb:[98,237,228]}),expect.objectContaining({id:'minecraft:crying_obsidian',rgb:[33,10,60]}),expect.objectContaining({id:'minecraft:cherry_planks',rgb:[227,179,173]}),expect.objectContaining({id:'minecraft:warped_wart_block',rgb:[23,120,121]})]));
    for(const block of BLOCK_PALETTE)expect(block.rgb.every(channel=>Number.isInteger(channel)&&channel>=0&&channel<=255)).toBe(true);
  });
  it('closes representative cyan, purple, green, and pale-red gaps in the original palette',()=>{
    const rgb=Uint8ClampedArray.from([98,237,228,33,10,60,42,203,88,217,152,152]),baseline=matchImage(rgb,4,1,BLOCK_PALETTE.slice(0,60)),expanded=matchImage(rgb,4,1,PALETTE_PRESETS.full);
    expect(expanded.meanDeltaE).toBeCloseTo(0,8);expect(expanded.meanDeltaE).toBeLessThan(baseline.meanDeltaE);
  });
});
