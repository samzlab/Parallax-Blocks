import { rgbToLab } from '../domain/color';
import type { BlockDefinition, BlockFamily } from '../domain/types';

type RawBlock = readonly [id: string, name: string, family: BlockFamily, r: number, g: number, b: number];
const raw: RawBlock[] = [
  ['white_concrete','White Concrete','concrete',207,213,214],['light_gray_concrete','Light Gray Concrete','concrete',125,125,115],
  ['gray_concrete','Gray Concrete','concrete',54,57,61],['black_concrete','Black Concrete','concrete',8,10,15],
  ['brown_concrete','Brown Concrete','concrete',96,59,31],['red_concrete','Red Concrete','concrete',142,32,32],
  ['orange_concrete','Orange Concrete','concrete',224,97,0],['yellow_concrete','Yellow Concrete','concrete',241,175,21],
  ['lime_concrete','Lime Concrete','concrete',94,168,24],['green_concrete','Green Concrete','concrete',73,91,36],
  ['cyan_concrete','Cyan Concrete','concrete',21,119,136],['light_blue_concrete','Light Blue Concrete','concrete',36,137,199],
  ['blue_concrete','Blue Concrete','concrete',44,46,143],['purple_concrete','Purple Concrete','concrete',100,31,156],
  ['magenta_concrete','Magenta Concrete','concrete',169,48,159],['pink_concrete','Pink Concrete','concrete',214,101,143],
  ['white_wool','White Wool','wool',234,236,237],['light_gray_wool','Light Gray Wool','wool',142,142,135],
  ['gray_wool','Gray Wool','wool',62,68,71],['black_wool','Black Wool','wool',21,21,26],
  ['brown_wool','Brown Wool','wool',114,72,41],['red_wool','Red Wool','wool',160,39,34],
  ['orange_wool','Orange Wool','wool',240,118,19],['yellow_wool','Yellow Wool','wool',249,198,40],
  ['lime_wool','Lime Wool','wool',112,185,25],['green_wool','Green Wool','wool',84,109,27],
  ['cyan_wool','Cyan Wool','wool',21,137,145],['light_blue_wool','Light Blue Wool','wool',58,175,217],
  ['blue_wool','Blue Wool','wool',53,57,157],['purple_wool','Purple Wool','wool',122,42,173],
  ['magenta_wool','Magenta Wool','wool',189,68,179],['pink_wool','Pink Wool','wool',237,141,172],
  ['white_terracotta','White Terracotta','terracotta',210,178,161],['light_gray_terracotta','Light Gray Terracotta','terracotta',135,107,98],
  ['gray_terracotta','Gray Terracotta','terracotta',57,42,35],['black_terracotta','Black Terracotta','terracotta',37,23,17],
  ['brown_terracotta','Brown Terracotta','terracotta',77,51,36],['red_terracotta','Red Terracotta','terracotta',143,61,47],
  ['orange_terracotta','Orange Terracotta','terracotta',161,83,37],['yellow_terracotta','Yellow Terracotta','terracotta',186,133,35],
  ['lime_terracotta','Lime Terracotta','terracotta',103,117,52],['green_terracotta','Green Terracotta','terracotta',76,83,42],
  ['cyan_terracotta','Cyan Terracotta','terracotta',86,91,91],['light_blue_terracotta','Light Blue Terracotta','terracotta',113,108,137],
  ['blue_terracotta','Blue Terracotta','terracotta',74,59,91],['purple_terracotta','Purple Terracotta','terracotta',118,70,86],
  ['magenta_terracotta','Magenta Terracotta','terracotta',150,88,109],['pink_terracotta','Pink Terracotta','terracotta',162,78,79],
  ['stone','Stone','natural',125,125,125],['smooth_stone','Smooth Stone','natural',158,158,158],
  ['deepslate','Deepslate','natural',80,80,82],['calcite','Calcite','natural',223,224,220],
  ['quartz_block','Quartz Block','natural',235,230,222],['sandstone','Sandstone','natural',216,203,155],
  ['red_sandstone','Red Sandstone','natural',181,98,31],['mud_bricks','Mud Bricks','natural',137,103,79],
  ['prismarine_bricks','Prismarine Bricks','natural',99,171,158],['purpur_block','Purpur Block','natural',169,125,169],
  ['end_stone_bricks','End Stone Bricks','natural',219,224,162],['nether_bricks','Nether Bricks','natural',45,22,27],
];

export const BLOCK_PALETTE: readonly BlockDefinition[] = raw.map(([id,name,family,r,g,b]) => ({
  id: `minecraft:${id}`, name, family, rgb: [r,g,b], lab: rgbToLab(r,g,b), safe: true,
}));

export const PALETTE_PRESETS = {
  concrete: BLOCK_PALETTE.filter(block => block.family === 'concrete'),
  wool: BLOCK_PALETTE.filter(block => block.family === 'wool'),
  terracotta: BLOCK_PALETTE.filter(block => block.family === 'terracotta'),
  full: BLOCK_PALETTE,
} as const;
