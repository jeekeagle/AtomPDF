# AtomPDF Identity: Approved Direction

## Decision

- Date: 2026-11-01
- User selection: **F**
- Direction name: **Serif Imprint**
- Source concept: round 3 concept `f-serif-imprint.svg` (kept locally in `design-demos/`)

The approved idea is an editorial serif A set over a fine rule: a publisher's
imprint, a page marker, and an atomic unit in one form. The square period from
the concept round was replaced by the rule so the mark reads more clearly at
small sizes and carries the AtomPDF teal accent.

## Production Interpretation

- Typeface source: Bodoni Moda, outlined to paths for the master artwork.
- Display lockups: high-contrast Bodoni at `wght 600` and `opsz 72`.
- Small cut: Bodoni at `wght 650` and `opsz 9`, tuned so the hairline and A
  survive at 16-29 px.
- No live text, raster imagery, filters, or masks in the master files.
- The app header and access screen use the inline `BrandMark` component so the
  mark inherits the current text colour and theme accent.

## Applied In The App

- `src/components/BrandMark.tsx`: inline small-cut SVG for the app.
- `src/App.tsx`: 29 px mark in the top bar.
- `src/components/AccessGate.tsx`: 46 px mark on the access screen.
- `public/favicon.svg`: 32 px app tile with the small cut.
- `public/apple-touch-icon.png`: 180 px app icon.
- `index.html`: title, theme colour, favicon, and Apple touch icon.

## Status

The brand kit lives in `brand/` and is integrated in the app. Earlier concept rounds stay in the local `design-demos/` folder and are not part of the repository.
