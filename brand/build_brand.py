"""Build the AtomPDF brand kit from Bodoni Moda outlines.

Every mark is emitted as pure SVG paths (no live text, no rasters) so the
files stay sharp at any size and can be embedded directly in the app.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont


ROOT = Path(__file__).resolve().parent
FONT_DIR = ROOT / "fonts"

INK = "#17140F"
PAPER = "#FFFDF9"
TEAL = "#008573"
ICON_TEAL = "#12a594"


def load_font(name: str, axes: dict[str, float] | None = None) -> TTFont:
    font = TTFont(str(FONT_DIR / name))
    if axes and "fvar" in font:
        font = instantiateVariableFont(font, axes)
    return font


# Large optical size for display lockups, small optical size for the mark:
# Bodoni Moda thickens its hairlines at small opsz, which keeps the "A"
# readable in a 16 px favicon.
BODONI = load_font("BodoniModa.ttf", {"wght": 600, "opsz": 72})
BODONI_SMALL = load_font("BodoniModa.ttf", {"wght": 650, "opsz": 9})
BODONI_MED = load_font("BodoniModa.ttf", {"wght": 500, "opsz": 72})


@dataclass
class Box:
    x0: float
    y0: float
    x1: float
    y1: float

    @property
    def width(self) -> float:
        return self.x1 - self.x0

    @property
    def height(self) -> float:
        return self.y1 - self.y0


def union(boxes: list[Box]) -> Box:
    return Box(
        min(b.x0 for b in boxes),
        min(b.y0 for b in boxes),
        max(b.x1 for b in boxes),
        max(b.y1 for b in boxes),
    )


NUMBER = re.compile(r"-?(?:\d+\.\d+(?:[eE][-+]?\d+)?|\d+[eE][-+]?\d+)")


def compact(path: str) -> str:
    """Trim glyph coordinates to two decimals; invisible, but halves file size."""
    def fmt(match: re.Match[str]) -> str:
        value = round(float(match.group()), 2)
        if value == 0:
            return "0"
        return f"{value:.2f}".rstrip("0").rstrip(".")

    return NUMBER.sub(fmt, path)


def glyph_run(
    font: TTFont,
    text: str,
    x: float,
    baseline: float,
    size: float,
    tracking: float = 0.0,
    kern: dict[str, float] | None = None,
) -> tuple[str, Box]:
    """Outline a string and return its ink bounds, not its advance width."""
    kern = kern or {}
    scale = size / font["head"].unitsPerEm
    glyphs = font.getGlyphSet()
    cmap = font.getBestCmap()
    cursor = x
    previous: str | None = None
    parts: list[str] = []
    boxes: list[Box] = []

    for ch in text:
        if previous is not None:
            cursor += kern.get(previous + ch, 0.0)
        name = cmap[ord(ch)]
        glyph = glyphs[name]

        pen = SVGPathPen(glyphs)
        bounds = BoundsPen(glyphs)
        transform = (scale, 0, 0, -scale, cursor, baseline)
        glyph.draw(TransformPen(pen, transform))
        glyph.draw(TransformPen(bounds, transform))
        parts.append(compact(pen.getCommands()))
        if bounds.bounds is not None:
            boxes.append(Box(*bounds.bounds))

        cursor += font["hmtx"][name][0] * scale + tracking
        previous = ch

    return " ".join(parts), union(boxes)


def cap_height(font: TTFont) -> float:
    cmap = font.getBestCmap()
    glyphs = font.getGlyphSet()
    pen = BoundsPen(glyphs)
    glyphs[cmap[ord("A")]].draw(pen)
    return pen.bounds[3] - pen.bounds[1]


def text_at_cap(
    font: TTFont,
    text: str,
    x: float,
    baseline: float,
    cap: float,
    tracking: float = 0.0,
) -> tuple[str, Box]:
    size = cap * font["head"].unitsPerEm / cap_height(font)
    return glyph_run(font, text, x, baseline, size, tracking)


def centered_text(
    font: TTFont,
    text: str,
    cx: float,
    baseline: float,
    size: float,
    tracking: float = 0.0,
    kern: dict[str, float] | None = None,
) -> tuple[str, Box]:
    """Draw a run and shift it so its ink is centred on cx."""
    probe, box = glyph_run(font, text, 0.0, baseline, size, tracking, kern)
    shift = cx - (box.x0 + box.x1) / 2
    body, box = glyph_run(font, text, shift, baseline, size, tracking, kern)
    return body, box


def crop(body: str, box: Box, pad_ratio: float = 0.08) -> tuple[str, int, int]:
    """Wrap artwork in a viewBox cropped to its ink with optical padding."""
    pad = max(box.width, box.height) * pad_ratio
    width = box.width + pad * 2
    height = box.height + pad * 2
    wrapped = (
        f'  <g transform="translate({pad - box.x0:.2f} {pad - box.y0:.2f})">\n'
        f"{body}\n  </g>"
    )
    return wrapped, round(width, 2), round(height, 2)


def svg(width: float, height: float, body: str, title: str) -> str:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width:g} {height:g}" '
        f'width="{width:g}" height="{height:g}" role="img" aria-labelledby="title">\n'
        f'  <title id="title">{title}</title>\n{body}\n</svg>\n'
    )


def write(name: str, content: str) -> None:
    (ROOT / name).write_text(content, encoding="utf-8")
    print(f"wrote {name}")


def mark_art(cap: float = 34, rule_weight: float = 1.8, gap: float = 5.0) -> tuple[str, Box, Box]:
    """Serif A over a rule: the small-size cut of the wordmark.

    Coordinates are anchored at an arbitrary origin; callers crop.
    """
    baseline = cap
    size = cap * BODONI_SMALL["head"].unitsPerEm / cap_height(BODONI_SMALL)
    body, box = centered_text(BODONI_SMALL, "A", 0.0, baseline, size, tracking=0)

    rule_width = box.width * 1.05
    rule_y = box.y1 + gap
    rule = Box(-rule_width / 2, rule_y, rule_width / 2, rule_y + rule_weight)
    return body, box, rule


def build_mark(color: str = INK, rule_color: str | None = None) -> tuple[str, float, float]:
    body, abox, rbox = mark_art()
    art = (
        f'    <g fill="{color}"><path d="{body}"/></g>\n'
        f'    <rect x="{rbox.x0:.2f}" y="{rbox.y0:.2f}" width="{rbox.width:.2f}" '
        f'height="{rbox.height:.2f}" fill="{rule_color or color}"/>'
    )
    wrapped, width, height = crop(art, union([abox, rbox]), 0.09)
    return wrapped, width, height


def build_stacked(color: str = INK, rule_opacity: float = 1.0) -> tuple[str, float, float]:
    cap = 62
    atom_size = cap * BODONI["head"].unitsPerEm / cap_height(BODONI)
    atom_body, atom_box = centered_text(BODONI, "Atom", 0.0, cap, atom_size, tracking=-1.4)

    rule_width = atom_box.width * 0.80
    rule_y = atom_box.y1 + 26
    rule = Box(-rule_width / 2, rule_y, rule_width / 2, rule_y + 2.2)

    pdf_cap = 27
    pdf_size = pdf_cap * BODONI_MED["head"].unitsPerEm / cap_height(BODONI_MED)
    pdf_body, pdf_box = centered_text(BODONI_MED, "PDF", 0.0, rule.y1 + 30 + pdf_cap, pdf_size, tracking=9)

    art = (
        f'    <g fill="{color}"><path d="{atom_body}"/></g>\n'
        f'    <rect x="{rule.x0:.2f}" y="{rule.y0:.2f}" width="{rule.width:.2f}" '
        f'height="{rule.height:.2f}" fill="{color}" opacity="{rule_opacity}"/>\n'
        f'    <g fill="{color}"><path d="{pdf_body}"/></g>'
    )
    wrapped, width, height = crop(art, union([atom_box, rule, pdf_box]), 0.10)
    return wrapped, width, height


def build_wordmark(color: str = INK, stacked_pdf: bool = False) -> tuple[str, float, float]:
    cap = 64
    atom_size = cap * BODONI["head"].unitsPerEm / cap_height(BODONI)
    atom_body, atom_box = glyph_run(BODONI, "Atom", 0.0, cap, atom_size, tracking=-1.6)

    pdf_cap = 47 if stacked_pdf else 48
    pdf_size = pdf_cap * BODONI_MED["head"].unitsPerEm / cap_height(BODONI_MED)
    gap = 13
    pdf_body, pdf_box = glyph_run(
        BODONI_MED, "PDF", atom_box.x1 + gap, cap, pdf_size, tracking=6.5
    )
    art = f'    <g fill="{color}"><path d="{atom_body}"/><path d="{pdf_body}"/></g>'
    wrapped, width, height = crop(art, union([atom_box, pdf_box]), 0.07)
    return wrapped, width, height


def build_horizontal(color: str = INK) -> tuple[str, float, float]:
    """Mark, then the AtomPDF wordmark, baseline-aligned."""
    mark_body, mark_box, mark_rule = mark_art(cap=52, rule_weight=2.6, gap=7)

    cap = 50
    atom_size = cap * BODONI["head"].unitsPerEm / cap_height(BODONI)
    atom_x = mark_rule.x1 + 46
    atom_body, atom_box = glyph_run(BODONI, "Atom", atom_x, cap, atom_size, tracking=-1.2)
    pdf_size = 36 * BODONI_MED["head"].unitsPerEm / cap_height(BODONI_MED)
    pdf_body, pdf_box = glyph_run(
        BODONI_MED, "PDF", atom_box.x1 + 12, cap, pdf_size, tracking=5.4
    )

    art = (
        f'    <g fill="{color}">\n'
        f'      <path d="{mark_body}"/>\n'
        f'      <path d="{atom_body}"/>\n'
        f'      <path d="{pdf_body}"/>\n'
        f'    </g>\n'
        f'    <rect x="{mark_rule.x0:.2f}" y="{mark_rule.y0:.2f}" width="{mark_rule.width:.2f}" '
        f'height="{mark_rule.height:.2f}" fill="{color}"/>'
    )
    wrapped, width, height = crop(art, union([mark_box, mark_rule, atom_box, pdf_box]), 0.09)
    return wrapped, width, height


def build_app_icon(size: int = 64) -> str:
    """Dark tile, paper A, teal rule. Used for favicon and app icons."""
    body, abox, rbox = mark_art(cap=30, rule_weight=2.2, gap=5.4)
    # Centre the mark's ink inside the tile.
    ink = union([abox, rbox])
    dx = (size - ink.width) / 2 - ink.x0
    dy = (size - ink.height) / 2 - ink.y0
    radius = size * 0.2
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" '
        f'width="{size}" height="{size}" role="img" aria-labelledby="title">\n'
        f'  <title id="title">AtomPDF</title>\n'
        f'  <rect width="{size}" height="{size}" rx="{radius:g}" fill="{INK}"/>\n'
        f'  <g transform="translate({dx:.3f} {dy:.3f})">\n'
        f'    <g fill="{PAPER}"><path d="{body}"/></g>\n'
        f'    <rect x="{rbox.x0:.2f}" y="{rbox.y0:.2f}" width="{rbox.width:.2f}" '
        f'height="{rbox.height:.2f}" fill="{ICON_TEAL}"/>\n'
        f'  </g>\n'
        f'</svg>\n'
    )


def build_symbol_sheet() -> str:
    """Brand board: both lockups, the small cut and the app icon."""
    stacked, sw, sh = build_stacked()
    horizontal, hw, hh = build_horizontal()
    mark, mw, mh = build_mark()
    reversed_stacked, rsw, rsh = build_stacked(PAPER)
    W, H = 1200, 820
    s1 = 330 / sw
    s2 = 560 / hw
    s3 = 120 / mw
    band_w, band_h = 420, 230
    s4 = 150 / rsh
    inner_w = rsw * s4
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">\n'
        f'  <rect width="{W}" height="{H}" fill="#F6F3EC"/>\n'
        f'  <g transform="translate(96 90) scale({s1:.4f})">{stacked}</g>\n'
        f'  <g transform="translate(530 90) scale({s2:.4f})">{horizontal}</g>\n'
        f'  <g transform="translate(560 360) scale({s3:.4f})">{mark}</g>\n'
        f'  <g transform="translate(96 470)">'
        f'    <rect width="{band_w}" height="{band_h}" rx="6" fill="{INK}"/>'
        f'    <g transform="translate({(band_w - inner_w) / 2:.2f} {(band_h - 150) / 2:.2f}) scale({s4:.4f})">'
        f'      {reversed_stacked}'
        f'    </g>'
        f'  </g>\n'
        f'  <g transform="translate(560 560)">{build_app_icon(128)}</g>\n'
        f'</svg>\n'
    )


def main() -> None:
    entries = {
        "atom-pdf-mark.svg": (build_mark(), "AtomPDF mark"),
        "atom-pdf-mark-inverse.svg": (build_mark(PAPER), "AtomPDF mark, reversed"),
        "atom-pdf-stacked.svg": (build_stacked(), "AtomPDF stacked lockup"),
        "atom-pdf-stacked-inverse.svg": (build_stacked(PAPER), "AtomPDF stacked lockup, reversed"),
        "atom-pdf-horizontal.svg": (build_horizontal(), "AtomPDF horizontal lockup"),
        "atom-pdf-wordmark.svg": (build_wordmark(), "AtomPDF wordmark"),
    }
    for name, ((body, width, height), title) in entries.items():
        write(name, svg(width, height, body, title))

    write("atom-pdf-app-icon.svg", build_app_icon())
    write("symbol-sheet.svg", build_symbol_sheet())


if __name__ == "__main__":
    main()
