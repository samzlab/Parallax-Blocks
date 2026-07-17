import { expect,test } from '@playwright/test';

function twoPixelBmp():Buffer{
  const data=Buffer.alloc(62);data.write('BM');data.writeUInt32LE(62,2);data.writeUInt32LE(54,10);data.writeUInt32LE(40,14);data.writeInt32LE(2,18);data.writeInt32LE(1,22);data.writeUInt16LE(1,26);data.writeUInt16LE(24,28);data.writeUInt32LE(8,34);data.set([0,0,255,0,255,0,0,0],54);return data;
}

test('imports, generates, previews, and exports a litematic',async({page})=>{
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Choose an image'})).toBeVisible();
  await page.locator('#file-input').setInputFiles({name:'pixels.bmp',mimeType:'image/bmp',buffer:twoPixelBmp()});
  await page.getByRole('button',{name:'01 Import'}).click();
  await expect(page.locator('#import-result .result-size strong')).toHaveText('2 × 1');
  await page.getByRole('button',{name:'64 px'}).click();
  await expect(page.locator('#max-width')).toHaveValue('64');
  await page.getByRole('button',{name:'04 Generate'}).click();
  await page.getByRole('button',{name:'Generate sculpture'}).click();
  await expect(page.locator('#viewer canvas')).toBeVisible();
  await page.getByRole('button',{name:'06 Export'}).click();
  await expect(page.getByText('First-hit visibility verified')).toBeVisible();
  const downloadPromise=page.waitForEvent('download');
  await page.getByRole('button',{name:'Download .litematic'}).click();
  const download=await downloadPromise;expect(download.suggestedFilename()).toBe('Anamorphic-Art.litematic');
});

test('keeps every workflow tab navigable without prerequisites',async({page})=>{
  await page.goto('/');
  for(const name of ['02 Palette','03 Camera','04 Generate','05 Preview','06 Export']){
    await page.getByRole('button',{name}).click();
  }
  await expect(page.getByRole('heading',{name:'Export to Litematica'})).toBeVisible();
  await expect(page.getByText('A verified sculpture is required before export.')).toBeVisible();
});

test('opens the guide and exposes the density control',async({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:'? User guide'}).click();
  await expect(page.getByRole('heading',{name:'How to build anamorphic art'})).toBeVisible();
  await expect(page.getByText('Good starting point')).toBeVisible();
  await page.getByRole('button',{name:'Close user guide'}).click();
  await page.getByRole('button',{name:'02 Palette'}).click();await page.getByRole('button',{name:'Safe full cubes'}).click();await expect(page.locator('#selected-count')).toHaveText('120 safe full-cube blocks selected');
  await page.getByRole('button',{name:'03 Camera'}).click();
  await expect(page.locator('#block-density')).toHaveValue('50');
  await page.locator('#block-density').fill('80');
  await expect(page.locator('#density-value')).toHaveText('80%');
  await expect(page.locator('#backdrop-enabled')).not.toBeChecked();
  await expect(page.locator('#backdrop-block')).toHaveValue('minecraft:black_concrete');
  await expect(page.locator('#backdrop-offset')).toHaveValue('4');
  await expect(page.locator('#backdrop-padding')).toHaveValue('2');
  await expect(page.locator('#backdrop-block')).toBeDisabled();
});

test('generates, previews, and exports an enabled backdrop layer',async({page})=>{
  await page.goto('/');await page.locator('#file-input').setInputFiles({name:'pixels.bmp',mimeType:'image/bmp',buffer:twoPixelBmp()});await page.getByRole('button',{name:'03 Camera'}).click();
  await page.locator('#backdrop-enabled').check();await expect(page.locator('#backdrop-block')).toBeEnabled();await page.locator('#backdrop-block').selectOption('minecraft:stone');await page.locator('#backdrop-offset').fill('3');await page.locator('#backdrop-padding').fill('1');
  await page.getByRole('button',{name:'04 Generate'}).click();await page.getByRole('button',{name:'Generate sculpture'}).click();await expect(page.locator('#viewer canvas')).toBeVisible();await expect(page.locator('#preview-legend')).toContainText('Backdrop · Stone');
  await page.getByRole('button',{name:'06 Export'}).click();await expect(page.getByText('First-hit and backdrop depth verified')).toBeVisible();await expect(page.locator('#export-summary')).toContainText('Stone');
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Download .litematic'}).click();expect((await downloadPromise).suggestedFilename()).toBe('Anamorphic-Art.litematic');
});
