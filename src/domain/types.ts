export type Vec3 = readonly [number, number, number];
export type ImageFormat = 'png' | 'jpeg' | 'bmp';

export interface ImportedImage {
  filename: string;
  format: ImageFormat;
  fileSize: number;
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
  hash: number;
}

export interface OutputImage {
  width: number;
  height: number;
  rgb: Uint8ClampedArray;
  paletteIndices: Uint16Array;
  matchedRgb: Uint8ClampedArray;
  meanDeltaE: number;
  maxDeltaE: number;
}

export type BlockFamily = 'concrete' | 'wool' | 'terracotta' | 'natural';

export interface LabColor { l: number; a: number; b: number }

export interface BlockDefinition {
  id: string;
  name: string;
  family: BlockFamily;
  rgb: readonly [number, number, number];
  lab: LabColor;
  safe: true;
}

export interface CameraSpec {
  position: Vec3;
  direction: Vec3;
  worldUp: Vec3;
  verticalFov: number;
  aspect: number;
}

export interface GenerationOptions {
  maxDepth: number;
  layerSpacing: number;
  blockDensity: number;
  maxOffset: number;
  backdrop: BackdropOptions;
}

export interface BackdropOptions {
  enabled: boolean;
  blockId: string;
  offset: number;
  edgePadding: number;
}

export interface GenerationDiagnostics {
  verified: boolean;
  blockCount: number;
  volume: number;
  meanDeltaE: number;
  maxDeltaE: number;
  disguiseScores: number[];
  elapsedMs: number;
  effectiveOffset: number;
  backdropBlockCount: number;
}

export interface BackdropLayer {
  coordinates: Int32Array;
  min: Vec3;
  dimensions: Vec3;
  blockId: string;
  offset: number;
  edgePadding: number;
}

export interface VoxelSculpture {
  coordinates: Int32Array;
  paletteIndices: Uint16Array;
  dimensions: Vec3;
  min: Vec3;
  camera: CameraSpec;
  backdrop: BackdropLayer | null;
  diagnostics: GenerationDiagnostics;
}

export interface LitematicMetadata {
  name: string;
  author: string;
  description: string;
  createdAt: number;
}

export type GenerationPhase =
  | 'ray-construction'
  | 'feasibility-search'
  | 'assignment'
  | 'visibility-verification'
  | 'backdrop-generation'
  | 'disguise-analysis'
  | 'preview-preparation';

export interface GenerationRequest {
  image: OutputImage;
  camera: CameraSpec;
  options: GenerationOptions;
  seed: number;
}

export type WorkerRequest =
  | { type: 'generate'; request: GenerationRequest }
  | { type: 'cancel' };

export type WorkerResponse =
  | { type: 'progress'; phase: GenerationPhase; progress: number; message: string }
  | { type: 'complete'; sculpture: VoxelSculpture }
  | { type: 'cancelled' }
  | { type: 'error'; message: string };
