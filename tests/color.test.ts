import { describe, expect, it } from 'vitest';
import { deltaE2000, matchImage, rgbToLab } from '../src/domain/color';
import { PALETTE_PRESETS } from '../src/data/palette';

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
});
