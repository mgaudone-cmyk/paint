# Paint-by-Number V5 - Clean Line-Art Engine

This fixes the unusable grid problem.

## Key changes

- No more square grid borders
- Uses a canvas renderer instead of one SVG path per cell
- Preserves original black outlines
- Groups color areas into clickable regions
- Shows labels only on large enough regions
- Better for cartoon art, princess art, coloring pages, and simple illustrations

## Upload to GitHub

Replace your files with:

- index.html
- style.css
- app.js

Open:

https://mgaudone-cmyk.github.io/paint/?v=7


## V6 changes

- Preview conversion before committing
- Commit button stays disabled until preview is generated
- Fit, Center, and Sections navigation controls
- 9-position quick navigation for large images
- Settings changes invalidate the preview so users can adjust and regenerate before painting
