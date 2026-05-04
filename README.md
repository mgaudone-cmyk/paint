# PaintQuest Generator

This is an upgraded Paint-by-Number MVP that generates playable artwork on the fly based on the user’s selection.

## What changed

Instead of relying only on included art templates, this version lets the user generate new artwork dynamically by choosing:

- Abstract
- Animal
- Landscape
- Flower
- Mandala
- Portrait Style
- Fantasy
- Custom uploaded image

The app then creates a playable SVG paint-by-number canvas immediately.

## Features

- Procedural artwork generation
- Style selection
- Difficulty selection
- Color count selection
- Numbered SVG paint regions
- Tap-to-paint gameplay
- Correct/wrong tap feedback
- Color palette with progress
- Total progress bar
- Hint button
- Undo
- Reset
- Zoom and pan
- Saved generated artworks
- Local progress save
- Custom image upload mode

## Files

- `index.html`
- `style.css`
- `app.js`

## How to run

Open `index.html` in a browser.

For best results, run with a local server:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## GitHub Pages deployment

1. Create a new GitHub repository.
2. Upload:
   - `index.html`
   - `style.css`
   - `app.js`
3. Go to `Settings`.
4. Go to `Pages`.
5. Select `Deploy from branch`.
6. Choose `main` and `/root`.
7. Save.
8. Open the generated GitHub Pages URL.

## Important MVP note

This version procedurally generates playable SVG regions. It does not use AI image generation. The custom image upload mode uses simplified grid-based color quantization. For a commercial version, the next upgrade would be true contour detection, automatic vectorization, and smoother region merging.
