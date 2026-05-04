# Paint-by-Number V8 - Edge-Aware Engine

Version: V8
Cache bust: ?v=9
Engine: Edge-aware segmentation

## Why this version exists

Previous versions used coarse pixel clustering, which created blocky and confusing mosaics. V8 uses edge detection first, then grows paint regions inside edge boundaries.

## Key upgrades

- Edge-first segmentation
- Cleaner black outline preservation
- Higher-resolution working canvas
- Better preview before commit
- Line art / anime / photo modes
- Detail and edge strength controls
- Better label placement
- Fit, Center, and Sections navigation

## Upload

Replace GitHub files with:

- index.html
- style.css
- app.js

Open:

https://mgaudone-cmyk.github.io/paint/?v=9
