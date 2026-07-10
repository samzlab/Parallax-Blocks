We are building a Browser application from scratch. The goal is to create a Minecraft anamorphic art generator.

Goal

The program should convert a normal 2D image (PNG, JPG, BMP) into a 3D Minecraft block sculpture that only appears as the original image when viewed from one specific camera position. From every other angle it should look like a random collection of colored blocks.

The final output must be a valid .litematic file that can be loaded directly into Litematica.

⸻

Architecture:

- Vite
- Typescript

⸻

Development rules

- Write clean, modular, well-commented Python code.
- Separate the project into logical files.
- Never produce placeholder code unless absolutely necessary.
- If a feature requires multiple files, generate all of them.
- The build output should be a single HTML with minified JS and CSS embedded

⸻

Features

Image Import

- Support PNG
- JPG
- BMP
- Drag and drop support
- Image preview

⸻

Minecraft Palette

Allow selecting which blocks may be used.

For example:

- Concrete
- Wool
- Terracotta
- Glazed Terracotta (optional)
- Full palette

Every Minecraft block must contain its average RGB color.

Use perceptual color matching (preferably CIEDE2000 instead of simple RGB distance).

⸻

Camera

User can set:

- Camera position
- Camera direction
- Field of view
- Output image size

The generated sculpture must reconstruct the original image only from this viewpoint.

⸻

Sculpture Generation

Build a true anamorphic sculpture.

Requirements:

- Every image pixel becomes visible from the camera.
- Hidden blocks may be placed behind visible ones.
- The algorithm should avoid one block accidentally hiding another.
- Keep the sculpture as compact as possible.
- User can choose maximum depth.
- User can choose spacing between projected layers.

The algorithm should optimize for:

- image quality
- compactness
- minimal block count

⸻

Preview

Include a real-time 3D viewer.

User can:

- rotate
- zoom
- move camera

Include a button:

“View From Correct Position”

which instantly moves the preview camera to the designed viewing position.

⸻

Export

Export as:

- .litematic (required)
- .schem (optional later)

⸻

User Interface

Modern application interface.

Tabs:

- Import
- Palette
- Camera
- Generate
- Preview
- Export

Include progress bars because generation may take time.

⸻

Performance

Design the algorithm so images up to at least 256×256 pixels remain practical.

The user may upload larger images, scale down to optimal size.

Use efficient data structures.

⸻

Future-proofing

Structure the project so future versions can easily add:

- multiple viewpoints
- transparency support
- lighting simulation
- dithering
- automatic support structures
- block cost optimization
- survival-build optimization
- command block export

⸻

I would make one addition that I think would dramatically improve the results:

Before placing blocks, perform a ray-tracing visibility analysis from the chosen camera position. Guarantee that each visible pixel corresponds to the first block intersected by its viewing ray. Detect and resolve self-occlusion automatically by relocating conflicting blocks while preserving image fidelity.
