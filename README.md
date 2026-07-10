# Parallax Blocks

An offline Minecraft anamorphic-art generator. It imports a 2D image, matches it to safe Minecraft Java 1.20.1 blocks, constructs a collision-free perspective sculpture, previews it in 3D, and exports a `.litematic` file.

## Development

```sh
pnpm install
pnpm dev
pnpm test
pnpm run check
pnpm build
```

The production build is a single self-contained `dist/index.html`. It performs no runtime network requests and can be distributed as one file.

Run the reproducible 256×256 solver benchmark with `pnpm benchmark`.

## Palette regeneration

The bundled palette contains numerical average colors only. To recalculate them from a locally installed, licensed Minecraft 1.20.1 client archive:

```sh
pnpm palette:extract /path/to/1.20.1.jar
```

The script updates the RGB triples in `src/data/palette.ts`. Review and test the resulting diff before committing it. Blocks without a simple single full-cube texture are reported for manual model review.

## Supported input

- Opaque PNG and JPEG
- Uncompressed 8-bit indexed, 24-bit RGB, and 32-bit RGB/bitfield Windows BMP
- Aspect-preserving output up to 256×256 pixels

Transparent PNG and compressed/RLE BMP files are rejected with an actionable message.

## In-app guidance and sizing

Open **User guide** in the header for the full workflow. Contextual `?` controls explain camera, depth, density, and target-resolution behavior without leaving the current step.

- **Target resolution** sets the maximum fitted width and height. Presets for 64, 128, and 256 pixels are available; aspect ratio is always preserved.
- **Block density** changes how tightly the fixed block count is packed through the available depth. Higher values are more compact; lower values spread blocks farther for a stronger off-axis disguise.

## Export assumptions

Exports target Minecraft Java 1.20.1 (`DataVersion` 3465) and use one positive-sized Litematica region. The correct camera pose is displayed in the Export screen because Litematica does not restore a designed viewing camera.
