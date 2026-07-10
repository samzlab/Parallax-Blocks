import type { BlockDefinition, LabColor, OutputImage } from './types';

const rad = Math.PI / 180;
const deg = 180 / Math.PI;

export function rgbToLab(r: number, g: number, b: number): LabColor {
  const linear = (value: number) => {
    const v = value / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const lr = linear(r), lg = linear(g), lb = linear(b);
  const x = (lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375) / 0.95047;
  const y = lr * 0.2126729 + lg * 0.7151522 + lb * 0.072175;
  const z = (lr * 0.0193339 + lg * 0.119192 + lb * 0.9503041) / 1.08883;
  const f = (v: number) => v > 216 / 24389 ? Math.cbrt(v) : (24389 / 27 * v + 16) / 116;
  const fx = f(x), fy = f(y), fz = f(z);
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

function hue(a: number, b: number): number {
  if (a === 0 && b === 0) return 0;
  const value = Math.atan2(b, a) * deg;
  return value >= 0 ? value : value + 360;
}

export function deltaE2000(x: LabColor, y: LabColor): number {
  const c1 = Math.hypot(x.a, x.b), c2 = Math.hypot(y.a, y.b);
  const cBar = (c1 + c2) / 2;
  const g = 0.5 * (1 - Math.sqrt(cBar ** 7 / (cBar ** 7 + 25 ** 7)));
  const a1 = (1 + g) * x.a, a2 = (1 + g) * y.a;
  const cp1 = Math.hypot(a1, x.b), cp2 = Math.hypot(a2, y.b);
  const hp1 = hue(a1, x.b), hp2 = hue(a2, y.b);
  const dL = y.l - x.l, dC = cp2 - cp1;
  let dh = hp2 - hp1;
  if (cp1 * cp2 === 0) dh = 0;
  else if (dh > 180) dh -= 360;
  else if (dh < -180) dh += 360;
  const dH = 2 * Math.sqrt(cp1 * cp2) * Math.sin((dh / 2) * rad);
  const lBar = (x.l + y.l) / 2, cpBar = (cp1 + cp2) / 2;
  let hpBar = hp1 + hp2;
  if (cp1 * cp2 === 0) hpBar = hp1 + hp2;
  else if (Math.abs(hp1 - hp2) <= 180) hpBar /= 2;
  else if (hp1 + hp2 < 360) hpBar = (hp1 + hp2 + 360) / 2;
  else hpBar = (hp1 + hp2 - 360) / 2;
  const t = 1 - 0.17 * Math.cos((hpBar - 30) * rad)
    + 0.24 * Math.cos(2 * hpBar * rad)
    + 0.32 * Math.cos((3 * hpBar + 6) * rad)
    - 0.2 * Math.cos((4 * hpBar - 63) * rad);
  const sl = 1 + 0.015 * (lBar - 50) ** 2 / Math.sqrt(20 + (lBar - 50) ** 2);
  const sc = 1 + 0.045 * cpBar;
  const sh = 1 + 0.015 * cpBar * t;
  const rt = -2 * Math.sqrt(cpBar ** 7 / (cpBar ** 7 + 25 ** 7))
    * Math.sin(60 * Math.exp(-(((hpBar - 275) / 25) ** 2)) * rad);
  const l = dL / sl, c = dC / sc, h = dH / sh;
  return Math.sqrt(l * l + c * c + h * h + rt * c * h);
}

export function matchImage(
  rgb: Uint8ClampedArray,
  width: number,
  height: number,
  palette: readonly BlockDefinition[],
): OutputImage {
  if (!palette.length) throw new Error('Select at least one Minecraft block.');
  const paletteIndices = new Uint16Array(width * height);
  const matchedRgb = new Uint8ClampedArray(width * height * 3);
  let total = 0, maximum = 0;
  for (let pixel = 0; pixel < width * height; pixel++) {
    const offset = pixel * 3;
    const lab = rgbToLab(rgb[offset]!, rgb[offset + 1]!, rgb[offset + 2]!);
    let best = 0, bestDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < palette.length; index++) {
      const distance = deltaE2000(lab, palette[index]!.lab);
      if (distance < bestDistance) { bestDistance = distance; best = index; }
    }
    paletteIndices[pixel] = best;
    matchedRgb.set(palette[best]!.rgb, offset);
    total += bestDistance;
    maximum = Math.max(maximum, bestDistance);
  }
  return {
    width, height, rgb, paletteIndices, matchedRgb,
    meanDeltaE: total / (width * height), maxDeltaE: maximum,
  };
}
