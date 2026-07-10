import type { ImageFormat, ImportedImage } from './types';

function detectFormat(file: File): ImageFormat {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'png' || file.type === 'image/png') return 'png';
  if (extension === 'jpg' || extension === 'jpeg' || file.type === 'image/jpeg') return 'jpeg';
  if (extension === 'bmp' || file.type === 'image/bmp') return 'bmp';
  throw new Error('Unsupported file type. Choose a PNG, JPEG, or BMP image.');
}

function hashBytes(bytes: Uint8Array): number {
  let hash = 0x811c9dc5;
  for (const byte of bytes) hash = Math.imul(hash ^ byte, 0x01000193);
  return hash >>> 0;
}

export function decodeBmp(data: ArrayBuffer): { width: number; height: number; rgba: Uint8ClampedArray } {
  const view = new DataView(data);
  if (view.byteLength < 54 || view.getUint16(0, true) !== 0x4d42) throw new Error('This is not a valid BMP file.');
  const pixelOffset = view.getUint32(10, true);
  const headerSize = view.getUint32(14, true);
  if (headerSize < 40) throw new Error('OS/2 and legacy BMP headers are not supported.');
  const width = view.getInt32(18, true);
  const signedHeight = view.getInt32(22, true);
  const height = Math.abs(signedHeight);
  const planes = view.getUint16(26, true);
  const bits = view.getUint16(28, true);
  const compression = view.getUint32(30, true);
  if (width <= 0 || height <= 0 || width > 32768 || height > 32768 || width * height > 100_000_000 || planes !== 1) throw new Error('BMP dimensions or planes are invalid or too large.');
  if (![8, 24, 32].includes(bits)) throw new Error(`Unsupported ${bits}-bit BMP. Use 8, 24, or 32 bits per pixel.`);
  if (compression !== 0 && !(bits === 32 && compression === 3)) throw new Error('Compressed/RLE BMP images are not supported.');
  const stride = Math.ceil(width * bits / 32) * 4;
  if (pixelOffset + stride * height > view.byteLength) throw new Error('BMP pixel data is truncated.');
  let palette: Array<[number, number, number]> = [];
  if (bits === 8) {
    const used = view.getUint32(46, true) || 256;
    const paletteOffset = 14 + headerSize;
    if (paletteOffset + used * 4 > pixelOffset) throw new Error('BMP color table is invalid.');
    palette = Array.from({ length: used }, (_, index) => {
      const at = paletteOffset + index * 4;
      return [view.getUint8(at + 2), view.getUint8(at + 1), view.getUint8(at)];
    });
  }
  let redMask = 0x00ff0000, greenMask = 0x0000ff00, blueMask = 0x000000ff, alphaMask = 0;
  if (bits === 32 && compression === 3) {
    const at = 14 + 40;
    if (at + 12 > pixelOffset) throw new Error('BMP bit masks are missing.');
    redMask = view.getUint32(at, true); greenMask = view.getUint32(at + 4, true); blueMask = view.getUint32(at + 8, true);
    alphaMask = at + 16 <= pixelOffset ? view.getUint32(at + 12, true) : 0;
  }
  const fromMask = (value: number, mask: number, fallback = 255) => {
    if (!mask) return fallback;
    const shift = 31 - Math.clz32(mask & -mask);
    const max = mask >>> shift;
    return Math.round(((value & mask) >>> shift) * 255 / max);
  };
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const sourceY = signedHeight > 0 ? height - 1 - y : y;
    const row = pixelOffset + sourceY * stride;
    for (let x = 0; x < width; x++) {
      const target = (y * width + x) * 4;
      if (bits === 8) {
        const color = palette[view.getUint8(row + x)];
        if (!color) throw new Error('BMP references a missing palette color.');
        rgba[target] = color[0]; rgba[target + 1] = color[1]; rgba[target + 2] = color[2]; rgba[target + 3] = 255;
      } else if (bits === 24) {
        const source = row + x * 3;
        rgba[target] = view.getUint8(source + 2); rgba[target + 1] = view.getUint8(source + 1);
        rgba[target + 2] = view.getUint8(source); rgba[target + 3] = 255;
      } else {
        const value = view.getUint32(row + x * 4, true);
        rgba[target] = fromMask(value, redMask); rgba[target + 1] = fromMask(value, greenMask);
        rgba[target + 2] = fromMask(value, blueMask); rgba[target + 3] = fromMask(value, alphaMask);
      }
    }
  }
  return { width, height, rgba };
}

async function decodeBrowserImage(file: File): Promise<{ width: number; height: number; rgba: Uint8ClampedArray }> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width; canvas.height = bitmap.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas image decoding is unavailable.');
  context.drawImage(bitmap, 0, 0); bitmap.close();
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  return { width: canvas.width, height: canvas.height, rgba: image.data };
}

export async function importImage(file: File): Promise<ImportedImage> {
  const format = detectFormat(file);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const decoded = format === 'bmp' ? decodeBmp(bytes.buffer) : await decodeBrowserImage(file);
  if (format === 'png') {
    for (let index = 3; index < decoded.rgba.length; index += 4) {
      if (decoded.rgba[index] !== 255) throw new Error('Transparent PNG pixels are not supported in v1. Please flatten the image first.');
    }
  }
  return { filename: file.name, format, fileSize: file.size, ...decoded, hash: hashBytes(bytes) };
}

export function fitDimensions(width: number, height: number, maxWidth: number, maxHeight: number): [number, number] {
  const scale = Math.min(maxWidth / width, maxHeight / height, 1);
  return [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))];
}

export function resizeToRgb(image: ImportedImage, maxWidth: number, maxHeight: number): { width: number; height: number; rgb: Uint8ClampedArray } {
  const [width, height] = fitDimensions(image.width, image.height, maxWidth, maxHeight);
  const source = document.createElement('canvas'); source.width = image.width; source.height = image.height;
  source.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(image.rgba), image.width, image.height), 0, 0);
  const target = document.createElement('canvas'); target.width = width; target.height = height;
  const context = target.getContext('2d', { willReadFrequently: true })!;
  context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, width, height);
  const rgba = context.getImageData(0, 0, width, height).data;
  const rgb = new Uint8ClampedArray(width * height * 3);
  for (let sourceIndex = 0, targetIndex = 0; sourceIndex < rgba.length; sourceIndex += 4, targetIndex += 3) {
    rgb[targetIndex] = rgba[sourceIndex]!; rgb[targetIndex + 1] = rgba[sourceIndex + 1]!; rgb[targetIndex + 2] = rgba[sourceIndex + 2]!;
  }
  return { width, height, rgb };
}

export function rgbDataUrl(rgb: Uint8ClampedArray, width: number, height: number): string {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let s = 0, t = 0; s < rgb.length; s += 3, t += 4) {
    rgba[t] = rgb[s]!; rgba[t + 1] = rgb[s + 1]!; rgba[t + 2] = rgb[s + 2]!; rgba[t + 3] = 255;
  }
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  canvas.getContext('2d')!.putImageData(new ImageData(rgba, width, height), 0, 0);
  return canvas.toDataURL('image/png');
}
