# AtomPDF Brand Spec

## The Mark

The AtomPDF mark is a high-contrast serif capital A above a hairline rule. It
borrows the visual language of a publisher's imprint and a page marker while
staying abstract enough to work as an app icon.

The stacked lockup reads `Atom`, a rule, then `PDF`. The horizontal lockup
places the small mark before the full `AtomPDF` wordmark. The wordmark-only
version is for places where the mark already appears nearby.

## Colour

| Token | Hex | Use |
| --- | --- | --- |
| Ink | `#17140F` | Primary artwork, app tile |
| Paper | `#FFFDF9` | Reversed artwork, app tile glyph |
| Teal rule | `#008573` | Rule in brand artwork |
| Icon teal | `#12A594` | Rule in favicon and app icon |

The in-app mark uses `currentColor` for the A and the current theme accent for
the rule. The master files use the fixed palette above.

## Clear Space

Keep at least one quarter of the capital A height clear on every side. No type,
interface border, image edge, or second logo may enter that area. For the
horizontal lockup, measure from the tallest part of the A.

## Minimum Sizes

| File | Digital minimum | Print minimum |
| --- | --- | --- |
| Mark | 16 px high | 6 mm high |
| Stacked lockup | 100 px wide | 24 mm wide |
| Horizontal lockup | 120 px wide | 30 mm wide |
| Wordmark only | 100 px wide | 26 mm wide |
| App icon | 24 px square | 8 mm square |

Use the mark below 100 px wide instead of shrinking a lockup. The 16 px cut is
already simplified; do not add detail back into it.

## Approved Backgrounds

- Ink on Paper, warm white, or another light neutral.
- Paper on Ink, charcoal, or another dark neutral.
- The teal rule may switch to Paper in a strictly one-colour reproduction.
- Avoid busy photography behind the thin rule. If a photograph is unavoidable,
  place the mark on a solid paper or ink field first.

## File Inventory

| File | Purpose |
| --- | --- |
| `atom-pdf-mark.svg` | Primary small-cut mark, ink |
| `atom-pdf-mark-inverse.svg` | Reversed small-cut mark, paper |
| `atom-pdf-stacked.svg` | Primary stacked lockup |
| `atom-pdf-stacked-inverse.svg` | Reversed stacked lockup |
| `atom-pdf-horizontal.svg` | Mark plus full wordmark |
| `atom-pdf-wordmark.svg` | Wordmark without the mark |
| `atom-pdf-app-icon.svg` | 64 px app icon and favicon source |
| `symbol-sheet.svg` | Brand overview board |
| `preview.html` | Full size, contrast, and context test sheet |
| `build_brand.py` | Reproducible outline generator |
| `fonts/BodoniModa.ttf` | Source typeface, SIL Open Font License 1.1 |
| `fonts/OFL.txt` | Font licence text |
| `renders/` | PNG proofs and app screenshots |

## Where It Lives In The App

| Path | Role |
| --- | --- |
| `src/components/BrandMark.tsx` | Inline small-cut SVG used by the UI |
| `public/favicon.svg` | Browser tab icon |
| `public/apple-touch-icon.png` | 180 px home-screen icon |
| `src/App.tsx` | 29 px mark in the top bar |
| `src/components/AccessGate.tsx` | 46 px mark on the password screen |

## Usage Rules

- Keep the A and rule as a single lockup; do not reposition the rule.
- Do not stretch, outline, add shadows, or place the mark on a gradient.
- Do not substitute a live font for the outlined masters.
- Use the inverse artwork on dark fields; do not rely on CSS filters.
- Keep the app icon tile intact at small sizes. Use the bare mark when a tile
  would compete with an existing container.

## Production Notes

The masters are outlined SVG paths generated from Bodoni Moda. The typeface is
licensed for logo use through the SIL Open Font License 1.1, and the font file
plus its licence are included in `fonts/` so the artwork can be regenerated at
any time. The final artwork does not depend on the font being installed on the
user's machine. Trademark clearance still requires a separate professional
search.