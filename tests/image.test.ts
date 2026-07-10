import { describe, expect, it } from 'vitest';
import { decodeBmp, fitDimensions } from '../src/domain/image';

function bmp24():ArrayBuffer{
  const data=new ArrayBuffer(62),view=new DataView(data);view.setUint16(0,0x4d42,true);view.setUint32(2,62,true);view.setUint32(10,54,true);view.setUint32(14,40,true);view.setInt32(18,2,true);view.setInt32(22,1,true);view.setUint16(26,1,true);view.setUint16(28,24,true);view.setUint32(34,8,true);
  new Uint8Array(data,54).set([0,0,255,0,255,0,0,0]);return data;
}
describe('image processing',()=>{
  it('preserves aspect ratio inside bounds',()=>{expect(fitDimensions(400,200,256,100)).toEqual([200,100]);});
  it('decodes padded bottom-up 24-bit BMP rows',()=>{const image=decodeBmp(bmp24());expect([image.width,image.height]).toEqual([2,1]);expect([...image.rgba]).toEqual([255,0,0,255,0,255,0,255]);});
  it('rejects compressed BMP data',()=>{const data=bmp24();new DataView(data).setUint32(30,1,true);expect(()=>decodeBmp(data)).toThrow(/Compressed/);});
});
