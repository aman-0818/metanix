"""
PPTX Generator Service  v2
==========================
Converts structured slide JSON from LLM into beautiful .pptx files
with multiple selectable themes, decorative shapes, rich typography,
and Canva / Gamma-quality visual design.
"""
import io
import json
import logging
import math
import os
import random
import re
import uuid
from typing import Optional

from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
from pptx.oxml.ns import qn
from pptx.chart.data import CategoryChartData
from pptx.enum.chart import XL_CHART_TYPE, XL_LEGEND_POSITION

logger = logging.getLogger(__name__)

# ============================================================================
#  THEMES  –  each theme defines colours, fonts, and decorative style
# ============================================================================

THEMES = {
    "midnight": {
        "name": "Midnight Blue",
        "bg":             RGBColor(0x0B, 0x0E, 0x1A),
        "bg_alt":         RGBColor(0x10, 0x14, 0x25),
        "card":           RGBColor(0x16, 0x1B, 0x33),
        "card_hover":     RGBColor(0x1C, 0x22, 0x3E),
        "accent":         RGBColor(0x38, 0x9C, 0xFF),
        "accent2":        RGBColor(0x6C, 0x5C, 0xE7),
        "accent3":        RGBColor(0x00, 0xCE, 0xC9),
        "text":           RGBColor(0xFF, 0xFF, 0xFF),
        "text_secondary": RGBColor(0xB0, 0xBC, 0xD4),
        "text_muted":     RGBColor(0x7A, 0x88, 0xA0),
        "divider":        RGBColor(0x2A, 0x30, 0x4A),
        "heading_font":   "Cambria",
        "body_font":      "Calibri",
        "decorations":    "circles",
    },
    "sunset": {
        "name": "Warm Sunset",
        "bg":             RGBColor(0x1A, 0x0A, 0x1E),
        "bg_alt":         RGBColor(0x22, 0x0E, 0x28),
        "card":           RGBColor(0x2D, 0x14, 0x35),
        "card_hover":     RGBColor(0x3A, 0x1A, 0x42),
        "accent":         RGBColor(0xFF, 0x6B, 0x6B),
        "accent2":        RGBColor(0xFF, 0xA5, 0x02),
        "accent3":        RGBColor(0xFE, 0xCE, 0x3E),
        "text":           RGBColor(0xFF, 0xFF, 0xFF),
        "text_secondary": RGBColor(0xD4, 0xB5, 0xC4),
        "text_muted":     RGBColor(0x9A, 0x80, 0x90),
        "divider":        RGBColor(0x40, 0x20, 0x48),
        "heading_font":   "Trebuchet MS",
        "body_font":      "Candara",
        "decorations":    "angular",
    },
    "forest": {
        "name": "Deep Forest",
        "bg":             RGBColor(0x0A, 0x16, 0x10),
        "bg_alt":         RGBColor(0x0E, 0x1E, 0x15),
        "card":           RGBColor(0x14, 0x2B, 0x1E),
        "card_hover":     RGBColor(0x1A, 0x35, 0x25),
        "accent":         RGBColor(0x00, 0xD9, 0x87),
        "accent2":        RGBColor(0x6C, 0xD9, 0x80),
        "accent3":        RGBColor(0x3E, 0xE8, 0xC8),
        "text":           RGBColor(0xFF, 0xFF, 0xFF),
        "text_secondary": RGBColor(0xB0, 0xD4, 0xC0),
        "text_muted":     RGBColor(0x70, 0x9A, 0x80),
        "divider":        RGBColor(0x1E, 0x3A, 0x28),
        "heading_font":   "Garamond",
        "body_font":      "Calibri",
        "decorations":    "organic",
    },
    "ocean": {
        "name": "Ocean Breeze",
        "bg":             RGBColor(0x04, 0x12, 0x20),
        "bg_alt":         RGBColor(0x08, 0x1A, 0x2C),
        "card":           RGBColor(0x0C, 0x24, 0x3A),
        "card_hover":     RGBColor(0x10, 0x2E, 0x48),
        "accent":         RGBColor(0x00, 0xB4, 0xD8),
        "accent2":        RGBColor(0x48, 0xCA, 0xE4),
        "accent3":        RGBColor(0x90, 0xE0, 0xEF),
        "text":           RGBColor(0xFF, 0xFF, 0xFF),
        "text_secondary": RGBColor(0xA8, 0xD4, 0xE6),
        "text_muted":     RGBColor(0x68, 0x9A, 0xB4),
        "divider":        RGBColor(0x14, 0x38, 0x55),
        "heading_font":   "Corbel",
        "body_font":      "Candara",
        "decorations":    "waves",
    },
    "royal": {
        "name": "Royal Purple",
        "bg":             RGBColor(0x10, 0x08, 0x20),
        "bg_alt":         RGBColor(0x18, 0x0E, 0x2E),
        "card":           RGBColor(0x22, 0x14, 0x3E),
        "card_hover":     RGBColor(0x2C, 0x1A, 0x4E),
        "accent":         RGBColor(0xA8, 0x5C, 0xFF),
        "accent2":        RGBColor(0xD4, 0x5C, 0xFF),
        "accent3":        RGBColor(0xFF, 0x6B, 0xC5),
        "text":           RGBColor(0xFF, 0xFF, 0xFF),
        "text_secondary": RGBColor(0xC8, 0xB8, 0xE8),
        "text_muted":     RGBColor(0x88, 0x78, 0xA8),
        "divider":        RGBColor(0x30, 0x20, 0x50),
        "heading_font":   "Constantia",
        "body_font":      "Corbel",
        "decorations":    "diamonds",
    },
    "clean_light": {
        "name": "Clean Light",
        "bg":             RGBColor(0xFA, 0xFA, 0xFC),
        "bg_alt":         RGBColor(0xF0, 0xF2, 0xF8),
        "card":           RGBColor(0xFF, 0xFF, 0xFF),
        "card_hover":     RGBColor(0xF5, 0xF5, 0xFF),
        "accent":         RGBColor(0x3B, 0x82, 0xF6),
        "accent2":        RGBColor(0x63, 0x66, 0xF1),
        "accent3":        RGBColor(0x06, 0xB6, 0xD4),
        "text":           RGBColor(0x1E, 0x29, 0x3B),
        "text_secondary": RGBColor(0x47, 0x55, 0x69),
        "text_muted":     RGBColor(0x94, 0xA3, 0xB8),
        "divider":        RGBColor(0xE2, 0xE8, 0xF0),
        "heading_font":   "Calibri Light",
        "body_font":      "Calibri",
        "decorations":    "minimal",
    },
    "coral": {
        "name": "Coral Reef",
        "bg":             RGBColor(0x18, 0x0C, 0x14),
        "bg_alt":         RGBColor(0x20, 0x10, 0x1C),
        "card":           RGBColor(0x2C, 0x18, 0x26),
        "card_hover":     RGBColor(0x38, 0x20, 0x30),
        "accent":         RGBColor(0xFF, 0x79, 0x79),
        "accent2":        RGBColor(0xFF, 0xB7, 0x4D),
        "accent3":        RGBColor(0xFF, 0x6B, 0xB5),
        "text":           RGBColor(0xFF, 0xFF, 0xFF),
        "text_secondary": RGBColor(0xE0, 0xC0, 0xD0),
        "text_muted":     RGBColor(0xA0, 0x80, 0x90),
        "divider":        RGBColor(0x3A, 0x22, 0x32),
        "heading_font":   "Candara",
        "body_font":      "Trebuchet MS",
        "decorations":    "circles",
    },
    "arctic": {
        "name": "Arctic Frost",
        "bg":             RGBColor(0xF4, 0xF7, 0xFB),
        "bg_alt":         RGBColor(0xE8, 0xEE, 0xF6),
        "card":           RGBColor(0xFF, 0xFF, 0xFF),
        "card_hover":     RGBColor(0xF0, 0xF4, 0xFA),
        "accent":         RGBColor(0x22, 0x63, 0xEB),
        "accent2":        RGBColor(0x7C, 0x3A, 0xED),
        "accent3":        RGBColor(0x05, 0x91, 0xB2),
        "text":           RGBColor(0x0F, 0x17, 0x2A),
        "text_secondary": RGBColor(0x33, 0x44, 0x55),
        "text_muted":     RGBColor(0x64, 0x74, 0x8B),
        "divider":        RGBColor(0xCB, 0xD5, 0xE1),
        "heading_font":   "Bahnschrift",
        "body_font":      "Corbel",
        "decorations":    "minimal",
    },
    "neon": {
        "name": "Neon Cyberpunk",
        "bg":             RGBColor(0x05, 0x05, 0x0A),
        "bg_alt":         RGBColor(0x0A, 0x0A, 0x14),
        "card":           RGBColor(0x10, 0x10, 0x20),
        "card_hover":     RGBColor(0x16, 0x16, 0x2C),
        "accent":         RGBColor(0x00, 0xFF, 0x9D),
        "accent2":        RGBColor(0xFF, 0x00, 0xE5),
        "accent3":        RGBColor(0x00, 0xD4, 0xFF),
        "text":           RGBColor(0xFF, 0xFF, 0xFF),
        "text_secondary": RGBColor(0xB0, 0xFF, 0xE0),
        "text_muted":     RGBColor(0x60, 0xA0, 0x80),
        "divider":        RGBColor(0x00, 0xFF, 0x9D),
        "heading_font":   "Bahnschrift",
        "body_font":      "Consolas",
        "decorations":    "circles",
    },
    "corporate": {
        "name": "Corporate Gold",
        "bg":             RGBColor(0x0D, 0x13, 0x1F),
        "bg_alt":         RGBColor(0x13, 0x1C, 0x2E),
        "card":           RGBColor(0x1A, 0x26, 0x40),
        "card_hover":     RGBColor(0x22, 0x30, 0x4E),
        "accent":         RGBColor(0xD4, 0xAF, 0x37),
        "accent2":        RGBColor(0xF0, 0xD0, 0x60),
        "accent3":        RGBColor(0xC0, 0x90, 0x20),
        "text":           RGBColor(0xFF, 0xFF, 0xFF),
        "text_secondary": RGBColor(0xD0, 0xD8, 0xF0),
        "text_muted":     RGBColor(0x80, 0x90, 0xB0),
        "divider":        RGBColor(0x2A, 0x38, 0x58),
        "heading_font":   "Cambria",
        "body_font":      "Corbel",
        "decorations":    "angular",
    },
    "bold": {
        "name": "Bold Black",
        "bg":             RGBColor(0x08, 0x08, 0x08),
        "bg_alt":         RGBColor(0x10, 0x10, 0x10),
        "card":           RGBColor(0x18, 0x18, 0x18),
        "card_hover":     RGBColor(0x22, 0x22, 0x22),
        "accent":         RGBColor(0xFF, 0xE0, 0x00),
        "accent2":        RGBColor(0xFF, 0x66, 0x00),
        "accent3":        RGBColor(0xFF, 0xFF, 0xFF),
        "text":           RGBColor(0xFF, 0xFF, 0xFF),
        "text_secondary": RGBColor(0xCC, 0xCC, 0xCC),
        "text_muted":     RGBColor(0x88, 0x88, 0x88),
        "divider":        RGBColor(0x2A, 0x2A, 0x2A),
        "heading_font":   "Franklin Gothic Medium",
        "body_font":      "Arial",
        "decorations":    "minimal",
    },
    "rose_gold": {
        "name": "Rose Gold",
        "bg":             RGBColor(0x1A, 0x12, 0x14),
        "bg_alt":         RGBColor(0x22, 0x18, 0x1C),
        "card":           RGBColor(0x2E, 0x20, 0x24),
        "card_hover":     RGBColor(0x3A, 0x28, 0x2E),
        "accent":         RGBColor(0xE0, 0x90, 0x80),
        "accent2":        RGBColor(0xF0, 0xB8, 0xA8),
        "accent3":        RGBColor(0xC8, 0x70, 0x60),
        "text":           RGBColor(0xFF, 0xFF, 0xFF),
        "text_secondary": RGBColor(0xF0, 0xD8, 0xD0),
        "text_muted":     RGBColor(0xA0, 0x80, 0x78),
        "divider":        RGBColor(0x40, 0x2C, 0x30),
        "heading_font":   "Constantia",
        "body_font":      "Candara",
        "decorations":    "organic",
    },
    "volcano": {
        "name": "Volcano Dark",
        "bg":             RGBColor(0x0E, 0x06, 0x04),
        "bg_alt":         RGBColor(0x18, 0x0A, 0x06),
        "card":           RGBColor(0x24, 0x10, 0x08),
        "card_hover":     RGBColor(0x30, 0x16, 0x0C),
        "accent":         RGBColor(0xFF, 0x52, 0x00),
        "accent2":        RGBColor(0xFF, 0x9A, 0x00),
        "accent3":        RGBColor(0xFF, 0xD0, 0x30),
        "text":           RGBColor(0xFF, 0xFF, 0xFF),
        "text_secondary": RGBColor(0xFF, 0xD8, 0xC0),
        "text_muted":     RGBColor(0xA0, 0x60, 0x40),
        "divider":        RGBColor(0x38, 0x18, 0x10),
        "heading_font":   "Franklin Gothic Medium",
        "body_font":      "Verdana",
        "decorations":    "angular",
    },
    "slate": {
        "name": "Slate Pro",
        "bg":             RGBColor(0xF8, 0xF9, 0xFA),
        "bg_alt":         RGBColor(0xEE, 0xF0, 0xF3),
        "card":           RGBColor(0xFF, 0xFF, 0xFF),
        "card_hover":     RGBColor(0xF4, 0xF6, 0xF8),
        "accent":         RGBColor(0x0D, 0x9E, 0x8E),
        "accent2":        RGBColor(0x0F, 0x76, 0x6E),
        "accent3":        RGBColor(0x38, 0xBD, 0xC0),
        "text":           RGBColor(0x18, 0x21, 0x2E),
        "text_secondary": RGBColor(0x3D, 0x4A, 0x5C),
        "text_muted":     RGBColor(0x7A, 0x88, 0x99),
        "divider":        RGBColor(0xD8, 0xDE, 0xE6),
        "heading_font":   "Corbel",
        "body_font":      "Calibri",
        "decorations":    "minimal",
    },
}

THEME_LIST = list(THEMES.keys())

# Track recent themes to avoid repetition across presentations
_recent_themes: list[str] = []


def _pick_theme(theme_name: Optional[str] = None) -> dict:
    """Return a theme dict; avoids repeating recent themes."""
    global _recent_themes
    if theme_name:
        key = theme_name.lower().replace(" ", "_")
        if key in THEMES:
            _recent_themes.append(key)
            _recent_themes[:] = _recent_themes[-4:]
            return THEMES[key]

    # Pick a theme we haven't used recently
    available = [t for t in THEME_LIST if t not in _recent_themes]
    if not available:
        available = THEME_LIST
    chosen = random.choice(available)
    _recent_themes.append(chosen)
    _recent_themes[:] = _recent_themes[-4:]
    return THEMES[chosen]


# ============================================================================
#  Low-level drawing helpers
# ============================================================================

def _set_slide_bg(slide, color: RGBColor):
    bg = slide.background
    bg.fill.solid()
    bg.fill.fore_color.rgb = color


def _rect(slide, left, top, w, h, color, radius_pt=0):
    """Add a filled rectangle (optionally rounded)."""
    shape_type = MSO_SHAPE.ROUNDED_RECTANGLE if radius_pt else MSO_SHAPE.RECTANGLE
    s = slide.shapes.add_shape(shape_type, left, top, w, h)
    s.fill.solid()
    s.fill.fore_color.rgb = color
    s.line.fill.background()
    s.rotation = 0.0
    return s


def _transparent_shape(slide, shape_type, left, top, w, h, color, alpha_pct=20, rotation=0.0):
    """Generic semi-transparent shape."""
    s = slide.shapes.add_shape(shape_type, left, top, w, h)
    s.fill.solid()
    s.fill.fore_color.rgb = color
    # Access underlying XML directly (s.fill._fill may be a wrapper, not an XML node)
    spPr = s._element.find(qn("p:spPr"))
    if spPr is None:
        spPr = s._element.spPr          # fallback property accessor
    a_solid = spPr.find(qn("a:solidFill"))
    if a_solid is not None:
        clr = a_solid[0]
        alpha_el = clr.makeelement(qn("a:alpha"), {})
        # OOXML's <a:alpha val> IS the opacity, in thousandths (100000 = fully
        # opaque) — alpha_pct is meant the same way (a low alpha_pct like 8 is
        # meant to render as a faint 8%-opaque wash), so no inversion here.
        # The previous (100 - alpha_pct) formula rendered "faint" 8% requests
        # at 92% opacity — solid, saturated shapes overwhelming slide content.
        alpha_el.set("val", str(int(alpha_pct * 1000)))
        clr.append(alpha_el)
    s.line.fill.background()
    if rotation:
        s.rotation = rotation
    return s


def _circle(slide, cx, cy, r, color, alpha_pct=20):
    return _transparent_shape(
        slide, MSO_SHAPE.OVAL,
        int(cx - r), int(cy - r), int(2 * r), int(2 * r),
        color, alpha_pct,
    )


def _diamond(slide, cx, cy, size, color, alpha_pct=15):
    return _transparent_shape(
        slide, MSO_SHAPE.RECTANGLE,
        int(cx - size / 2), int(cy - size / 2), int(size), int(size),
        color, alpha_pct, rotation=45.0,
    )


def _triangle(slide, left, top, w, h, color, alpha_pct=15):
    return _transparent_shape(
        slide, MSO_SHAPE.ISOSCELES_TRIANGLE,
        left, top, w, h, color, alpha_pct,
    )


# ============================================================================
#  Decorative backgrounds – add visual interest per theme style
# ============================================================================

def _rand(rng: random.Random, lo: float, hi: float) -> float:
    """Random float in [lo, hi)."""
    return lo + rng.random() * (hi - lo)


def _rand_accent(rng: random.Random, T) -> RGBColor:
    """Pick a random accent colour from the theme."""
    return rng.choice([T["accent"], T["accent2"], T["accent3"]])


def _decorate_slide(slide, T, prs, idx, rng: random.Random):
    """Add randomised decorative shapes — different every time."""
    W = prs.slide_width
    H = prs.slide_height
    deco = T.get("decorations", "circles")

    # Each slide gets a random decoration sub-variant for uniqueness
    v = rng.randint(0, 5)

    if deco == "circles":
        # 2-4 random circles at random corners / edges
        n_circles = rng.randint(2, 4)
        positions = [
            (Inches(_rand(rng, -1.5, -0.2)), Inches(_rand(rng, -1.5, 0.5))),
            (W - Inches(_rand(rng, 0.2, 1.5)), H - Inches(_rand(rng, 0.5, 1.5))),
            (Inches(_rand(rng, 8, 12)), Inches(_rand(rng, -1, 1))),
            (Inches(_rand(rng, -1, 2)), H - Inches(_rand(rng, -0.5, 1))),
            (W - Inches(_rand(rng, 1, 3)), Inches(_rand(rng, -0.5, 2))),
        ]
        rng.shuffle(positions)
        for i in range(n_circles):
            cx, cy = positions[i]
            r = Inches(_rand(rng, 0.8, 2.5))
            _circle(slide, cx, cy, r, _rand_accent(rng, T), alpha_pct=rng.randint(4, 10))

    elif deco == "angular":
        _triangle(slide, W - Inches(_rand(rng, 2, 4)), Inches(_rand(rng, -1, 0)),
                  Inches(_rand(rng, 3, 5)), Inches(_rand(rng, 2, 4)), _rand_accent(rng, T), alpha_pct=rng.randint(5, 10))
        if v % 2 == 0:
            _transparent_shape(slide, MSO_SHAPE.RECTANGLE, Inches(_rand(rng, -0.5, 0)),
                               H - Inches(_rand(rng, 0.8, 1.8)), Inches(_rand(rng, 2, 4)),
                               Inches(_rand(rng, 1, 2)), _rand_accent(rng, T), alpha_pct=rng.randint(4, 8))
        if v % 3 == 0:
            _triangle(slide, Inches(_rand(rng, -0.5, 1)), Inches(_rand(rng, 3, 5)),
                      Inches(_rand(rng, 1.5, 3)), Inches(_rand(rng, 2, 3)), _rand_accent(rng, T), alpha_pct=5)

    elif deco == "organic":
        n = rng.randint(2, 4)
        spots = [
            (Inches(_rand(rng, -1.5, 0)), H - Inches(_rand(rng, 0.5, 2))),
            (W - Inches(_rand(rng, 0.5, 2)), Inches(_rand(rng, -1.5, 0))),
            (Inches(_rand(rng, 4, 8)), H + Inches(_rand(rng, 0, 1))),
            (Inches(_rand(rng, 9, 12)), Inches(_rand(rng, -1, 1))),
        ]
        rng.shuffle(spots)
        for i in range(n):
            _circle(slide, spots[i][0], spots[i][1],
                    Inches(_rand(rng, 1, 2.8)), _rand_accent(rng, T), alpha_pct=rng.randint(4, 9))

    elif deco == "waves":
        for _ in range(rng.randint(2, 3)):
            _circle(slide, Inches(_rand(rng, -2, 12)), Inches(_rand(rng, -1, 8)),
                    Inches(_rand(rng, 1.5, 3.5)), _rand_accent(rng, T), alpha_pct=rng.randint(3, 8))

    elif deco == "diamonds":
        n = rng.randint(2, 4)
        for _ in range(n):
            _diamond(slide, Inches(_rand(rng, -1, 13)), Inches(_rand(rng, -1, 8)),
                     Inches(_rand(rng, 0.8, 2.2)), _rand_accent(rng, T), alpha_pct=rng.randint(4, 10))

    elif deco == "minimal":
        # Vary the accent bar placement
        if v % 3 == 0:
            _rect(slide, Inches(0), Inches(0), Inches(_rand(rng, 0.06, 0.12)), H, T["accent"])
        elif v % 3 == 1:
            _rect(slide, Inches(0), Inches(0), W, Inches(_rand(rng, 0.03, 0.06)), T["accent"])
        else:
            _rect(slide, Inches(0), H - Inches(0.06), W, Inches(0.04), T["accent"])
            _rect(slide, W - Inches(0.08), Inches(0), Inches(0.06), H, T["accent2"])


# ============================================================================
#  Text helpers (theme-aware)
# ============================================================================

def _set_para_font(p, size=None, color=None, bold=None, name=None, italic=None):
    """Set formatting on both the paragraph's defRPr AND its run(s).

    python-pptx's `paragraph.font` only writes defRPr (the paragraph's
    fallback run properties) — when a run already exists (e.g. after
    `p.text = ...`), that run has no rPr of its own, so PowerPoint and most
    other renderers (LibreOffice, Google Slides, Office web/quick-preview)
    show default/unstyled text instead of the size, color, bold, or font
    actually requested. Real PowerPoint-authored files always carry explicit
    rPr per run, so mirror that here instead of relying on defRPr alone.
    """
    for font in (p.font, *(r.font for r in p.runs)):
        if size is not None:
            font.size = size
        if color is not None:
            font.color.rgb = color
        if bold is not None:
            font.bold = bold
        if name is not None:
            font.name = name
        if italic is not None:
            font.italic = italic


def _textbox(slide, left, top, w, h, text, T, font_size=18,
             color_key="text", bold=False, align=PP_ALIGN.LEFT, font_key="body_font",
             italic=False):
    txBox = slide.shapes.add_textbox(left, top, w, h)
    tf = txBox.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = str(text)
    _set_para_font(p, size=Pt(font_size), color=T[color_key], bold=bold, name=T[font_key],
                   italic=italic or None)
    p.alignment = align
    return txBox


def _rich_text_box(slide, left, top, w, h, text, sub_text, T,
                   main_size=44, sub_size=20, align=PP_ALIGN.CENTER):
    """Title + subtitle in one text frame with proper spacing."""
    txBox = slide.shapes.add_textbox(left, top, w, h)
    tf = txBox.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = str(text)
    _set_para_font(p, size=Pt(main_size), color=T["text"], bold=True, name=T["heading_font"])
    p.alignment = align
    p.space_after = Pt(12)
    if sub_text:
        p2 = tf.add_paragraph()
        p2.text = str(sub_text)
        _set_para_font(p2, size=Pt(sub_size), color=T["text_secondary"], name=T["body_font"])
        p2.alignment = align
    return txBox


def _bullet_list(slide, left, top, w, h, items, T, font_size=16,
                 color_key="text_secondary", icon_char="\u25CF"):
    """Bulleted list with coloured bullet icon."""
    txBox = slide.shapes.add_textbox(left, top, w, h)
    tf = txBox.text_frame
    tf.word_wrap = True

    for i, item in enumerate(items):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        text = re.sub(r"^[\s]*[-*\u2022\u25CF]\s*", "", str(item).strip())
        text = re.sub(r"^[\s]*\d+[.)]\s*", "", text)

        run_bullet = p.add_run()
        run_bullet.text = f"{icon_char}  "
        run_bullet.font.size = Pt(font_size - 2)
        run_bullet.font.color.rgb = T["accent"]
        run_bullet.font.name = T["body_font"]

        run_text = p.add_run()
        run_text.text = text
        run_text.font.size = Pt(font_size)
        run_text.font.color.rgb = T[color_key]
        run_text.font.name = T["body_font"]

        p.space_after = Pt(10)
        p.space_before = Pt(3)
        p.alignment = PP_ALIGN.LEFT

    return txBox


def _number_icon(slide, cx, cy, size, number, T):
    """Numbered circle – great for steps / timelines."""
    s = slide.shapes.add_shape(MSO_SHAPE.OVAL, cx, cy, size, size)
    s.fill.solid()
    s.fill.fore_color.rgb = T["accent"]
    s.line.fill.background()
    tf = s.text_frame
    tf.word_wrap = False
    p = tf.paragraphs[0]
    p.text = str(number)
    _set_para_font(p, size=Pt(int(size / Inches(1) * 18)), color=RGBColor(0xFF, 0xFF, 0xFF),
                   bold=True, name=T["heading_font"])
    p.alignment = PP_ALIGN.CENTER
    tf.paragraphs[0].space_before = Pt(0)
    tf.paragraphs[0].space_after = Pt(0)
    return s


# ============================================================================
#  Slide builders (theme-aware)
# ============================================================================

def _build_title_slide(prs, sd, T, idx, rng, deck_style):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    variant = deck_style["bookend_variant"]

    title = sd.get("title", "Presentation")
    subtitle = sd.get("subtitle", "")
    author = sd.get("author", "")

    if variant == 0:
        # Centred with dual accent bars
        _set_slide_bg(slide, T["bg"])
        _decorate_slide(slide, T, prs, idx, rng)
        bar_w = Inches(_rand(rng, 3, 5))
        _rect(slide, Inches((13.333 - bar_w.inches) / 2), Inches(1.7), bar_w, Inches(0.05), T["accent"])
        _rich_text_box(slide, Inches(1), Inches(2.0), Inches(11.333), Inches(2.5),
                       title, subtitle, T, main_size=48, sub_size=22)
        _rect(slide, Inches((13.333 - bar_w.inches) / 2), Inches(4.8), bar_w, Inches(0.05), T["accent"])
        if author:
            _textbox(slide, Inches(1), Inches(5.5), Inches(11.333), Inches(0.5),
                     author, T, font_size=14, color_key="text_muted", align=PP_ALIGN.CENTER)

    elif variant == 1:
        # Left-aligned with tall accent bar
        _set_slide_bg(slide, T["bg_alt"])
        _decorate_slide(slide, T, prs, idx, rng)
        _rect(slide, Inches(0), Inches(0), Inches(0.15), prs.slide_height, T["accent"])
        _rect(slide, Inches(0.5), Inches(2.8), Inches(5), Inches(0.05), T["accent2"])
        _textbox(slide, Inches(0.8), Inches(1.2), Inches(10), Inches(1.5),
                 title, T, font_size=52, bold=True, color_key="text", font_key="heading_font")
        if subtitle:
            _textbox(slide, Inches(0.8), Inches(3.1), Inches(9), Inches(0.8),
                     subtitle, T, font_size=22, color_key="text_secondary")
        if author:
            _textbox(slide, Inches(0.8), Inches(5.8), Inches(9), Inches(0.5),
                     author, T, font_size=14, color_key="text_muted")

    else:
        # Full-width accent strip + centred big text
        _set_slide_bg(slide, T["bg"])
        _rect(slide, Inches(0), Inches(0), prs.slide_width, Inches(0.08), T["accent"])
        _rect(slide, Inches(0), prs.slide_height - Inches(0.08), prs.slide_width, Inches(0.08), T["accent2"])
        _decorate_slide(slide, T, prs, idx, rng)
        _rich_text_box(slide, Inches(1.5), Inches(2.2), Inches(10.333), Inches(2.5),
                       title, subtitle, T, main_size=50, sub_size=20)
        if author:
            _textbox(slide, Inches(1.5), Inches(5.5), Inches(10.333), Inches(0.5),
                     author, T, font_size=14, color_key="text_muted", align=PP_ALIGN.CENTER)


def _build_section_slide(prs, sd, T, idx, rng, deck_style):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    variant = deck_style["bookend_variant"]
    section_num = sd.get("section_number", "")
    title = sd.get("title", "Section")
    sub = sd.get("subtitle", "")

    if variant == 0:
        # Left bar + number badge
        _set_slide_bg(slide, T["bg_alt"])
        _decorate_slide(slide, T, prs, idx, rng)
        _rect(slide, Inches(0), Inches(0), Inches(0.12), prs.slide_height, T["accent"])
        if section_num:
            _number_icon(slide, Inches(1.2), Inches(1.8), Inches(0.7), section_num, T)
        y_off = 2.8 if section_num else 2.5
        _textbox(slide, Inches(1.2), Inches(y_off), Inches(11), Inches(1.2),
                 title, T, font_size=42, bold=True, color_key="text", font_key="heading_font")
        if sub:
            _textbox(slide, Inches(1.2), Inches(y_off + 1.2), Inches(10), Inches(0.8),
                     sub, T, font_size=18, color_key="text_muted")

    elif variant == 1:
        # Centred with top/bottom bars
        _set_slide_bg(slide, T["bg"])
        _decorate_slide(slide, T, prs, idx, rng)
        bw = Inches(6)
        _rect(slide, Inches((13.333 - 6) / 2), Inches(2.2), bw, Inches(0.04), T["accent"])
        if section_num:
            _textbox(slide, Inches(1), Inches(2.5), Inches(11.333), Inches(0.6),
                     f"Section {section_num}", T, font_size=16, color_key="accent", align=PP_ALIGN.CENTER)
        _textbox(slide, Inches(1), Inches(3.0), Inches(11.333), Inches(1.2),
                 title, T, font_size=44, bold=True, color_key="text",
                 font_key="heading_font", align=PP_ALIGN.CENTER)
        if sub:
            _textbox(slide, Inches(1), Inches(4.3), Inches(11.333), Inches(0.8),
                     sub, T, font_size=18, color_key="text_muted", align=PP_ALIGN.CENTER)
        _rect(slide, Inches((13.333 - 6) / 2), Inches(5.2), bw, Inches(0.04), T["accent"])

    else:
        # Card-style centred section
        _set_slide_bg(slide, T["bg_alt"])
        _decorate_slide(slide, T, prs, idx, rng)
        _rect(slide, Inches(2), Inches(1.8), Inches(9.333), Inches(4), T["card"], radius_pt=12)
        _rect(slide, Inches(2), Inches(1.8), Inches(9.333), Inches(0.06), T["accent"])
        if section_num:
            _number_icon(slide, Inches(5.8), Inches(2.2), Inches(0.7), section_num, T)
        y_off = 3.2 if section_num else 2.8
        _textbox(slide, Inches(2.5), Inches(y_off), Inches(8.333), Inches(1.2),
                 title, T, font_size=40, bold=True, color_key="text",
                 font_key="heading_font", align=PP_ALIGN.CENTER)
        if sub:
            _textbox(slide, Inches(2.5), Inches(y_off + 1.1), Inches(8.333), Inches(0.8),
                     sub, T, font_size=18, color_key="text_muted", align=PP_ALIGN.CENTER)


def _build_content_slide(prs, sd, T, idx, rng, deck_style):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    variant = rng.randint(0, 2)
    title = sd.get("title", "")
    body = sd.get("body", "")
    points = sd.get("points", [])

    # Alternate bg colour for rhythm
    bg = T["bg"] if idx % 2 == 0 else T["bg_alt"]

    if variant == 0:
        # Classic top-bar style
        _set_slide_bg(slide, bg)
        _decorate_slide(slide, T, prs, idx, rng)
        _rect(slide, Inches(0), Inches(0), prs.slide_width, Inches(0.05), T["accent"])
        _textbox(slide, Inches(0.8), Inches(0.35), Inches(11.5), Inches(0.7),
                 title, T, font_size=30, bold=True, color_key="text", font_key="heading_font")
        _rect(slide, Inches(0.8), Inches(1.1), Inches(_rand(rng, 1.8, 3.5)), Inches(0.04), T["accent"])
        if body and not points:
            _textbox(slide, Inches(0.8), Inches(1.5), Inches(11.5), Inches(5.2),
                     body, T, font_size=17, color_key="text_secondary")
        elif points:
            _bullet_list(slide, Inches(0.8), Inches(1.5), Inches(11.5), Inches(5.2), points, T, font_size=17)

    elif variant == 1:
        # Left accent bar + card background for content
        _set_slide_bg(slide, bg)
        _decorate_slide(slide, T, prs, idx, rng)
        _rect(slide, Inches(0), Inches(0), Inches(0.1), prs.slide_height, T["accent"])
        _textbox(slide, Inches(0.6), Inches(0.4), Inches(11.5), Inches(0.7),
                 title, T, font_size=30, bold=True, color_key="text", font_key="heading_font")
        # Content inside a card
        _rect(slide, Inches(0.5), Inches(1.3), Inches(12.3), Inches(5.5), T["card"], radius_pt=8)
        if body and not points:
            _textbox(slide, Inches(1.0), Inches(1.6), Inches(11.3), Inches(5.0),
                     body, T, font_size=17, color_key="text_secondary")
        elif points:
            _bullet_list(slide, Inches(1.0), Inches(1.6), Inches(11.3), Inches(5.0), points, T, font_size=17)

    else:
        # Bottom accent + right-aligned accent bar
        _set_slide_bg(slide, bg)
        _decorate_slide(slide, T, prs, idx, rng)
        _rect(slide, Inches(0), prs.slide_height - Inches(0.06), prs.slide_width, Inches(0.06), T["accent2"])
        _textbox(slide, Inches(0.8), Inches(0.35), Inches(11.5), Inches(0.7),
                 title, T, font_size=30, bold=True, color_key="text", font_key="heading_font")
        _rect(slide, Inches(10), Inches(1.1), Inches(2.5), Inches(0.04), T["accent"])
        if body and not points:
            _textbox(slide, Inches(0.8), Inches(1.5), Inches(11.5), Inches(5.2),
                     body, T, font_size=17, color_key="text_secondary")
        elif points:
            _bullet_list(slide, Inches(0.8), Inches(1.5), Inches(11.5), Inches(5.0), points, T, font_size=17)

    _add_speaker_note(slide, sd)


def _build_two_column_slide(prs, sd, T, idx, rng, deck_style):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    _set_slide_bg(slide, T["bg"])
    _decorate_slide(slide, T, prs, idx, rng)

    _rect(slide, Inches(0), Inches(0), prs.slide_width, Inches(0.05), T["accent"])
    _textbox(slide, Inches(0.8), Inches(0.35), Inches(11.5), Inches(0.7),
             sd.get("title", ""), T, font_size=30, bold=True,
             color_key="text", font_key="heading_font")
    _rect(slide, Inches(0.8), Inches(1.1), Inches(2.5), Inches(0.04), T["accent"])

    # Left card
    left = sd.get("left_column", {})
    _rect(slide, Inches(0.5), Inches(1.5), Inches(5.9), Inches(5.2), T["card"], radius_pt=8)
    _rect(slide, Inches(0.5), Inches(1.5), Inches(5.9), Inches(0.06), T["accent"])
    lt = left.get("title", "")
    if lt:
        _textbox(slide, Inches(0.8), Inches(1.7), Inches(5.3), Inches(0.5),
                 lt, T, font_size=20, bold=True, color_key="accent")
    lp = left.get("points", [])
    if lp:
        _bullet_list(slide, Inches(0.8), Inches(2.4), Inches(5.3), Inches(4.0), lp, T, font_size=15)

    # Right card
    right = sd.get("right_column", {})
    _rect(slide, Inches(6.8), Inches(1.5), Inches(5.9), Inches(5.2), T["card"], radius_pt=8)
    _rect(slide, Inches(6.8), Inches(1.5), Inches(5.9), Inches(0.06), T["accent2"])
    rt = right.get("title", "")
    if rt:
        _textbox(slide, Inches(7.1), Inches(1.7), Inches(5.3), Inches(0.5),
                 rt, T, font_size=20, bold=True, color_key="accent")
    rp = right.get("points", [])
    if rp:
        _bullet_list(slide, Inches(7.1), Inches(2.4), Inches(5.3), Inches(4.0), rp, T, font_size=15)

    _add_speaker_note(slide, sd)


def _build_key_metrics_slide(prs, sd, T, idx, rng, deck_style):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    _set_slide_bg(slide, T["bg"])
    _decorate_slide(slide, T, prs, idx, rng)

    _rect(slide, Inches(0), Inches(0), prs.slide_width, Inches(0.05), T["accent"])
    _textbox(slide, Inches(0.8), Inches(0.35), Inches(11.5), Inches(0.7),
             sd.get("title", "Key Metrics"), T, font_size=30, bold=True,
             color_key="text", font_key="heading_font")
    _rect(slide, Inches(0.8), Inches(1.1), Inches(2.5), Inches(0.04), T["accent"])

    metrics = sd.get("metrics", [])[:8]
    if not metrics:
        return

    cnt = len(metrics)
    per_row = min(cnt, 4)
    card_w_in = 2.8
    gap = 0.35
    total_w = per_row * card_w_in + (per_row - 1) * gap
    start_x = (13.333 - total_w) / 2

    accent_colors = [T["accent"], T["accent2"], T["accent3"], T["accent"]]

    for i, m in enumerate(metrics):
        row, col = divmod(i, 4)
        x = Inches(start_x + col * (card_w_in + gap))
        y = Inches(1.6 + row * 2.8)
        cw = Inches(card_w_in)
        ch = Inches(2.4)

        _rect(slide, x, y, cw, ch, T["card"], radius_pt=8)
        _rect(slide, x, y, cw, Inches(0.05), accent_colors[i % len(accent_colors)])

        _textbox(slide, x, Inches(y.inches + 0.35), cw, Inches(0.9),
                 str(m.get("value", "")), T, font_size=38, bold=True,
                 color_key="accent", align=PP_ALIGN.CENTER, font_key="heading_font")
        _textbox(slide, x, Inches(y.inches + 1.3), cw, Inches(0.7),
                 str(m.get("label", "")), T, font_size=13,
                 color_key="text_muted", align=PP_ALIGN.CENTER)
        desc = m.get("description", "")
        if desc:
            _textbox(slide, x, Inches(y.inches + 1.8), cw, Inches(0.5),
                     desc, T, font_size=10,
                     color_key="text_muted", align=PP_ALIGN.CENTER)

    _add_speaker_note(slide, sd)


def _build_timeline_slide(prs, sd, T, idx, rng, deck_style):
    """Timeline / process steps layout."""
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    _set_slide_bg(slide, T["bg"])
    _decorate_slide(slide, T, prs, idx, rng)

    _rect(slide, Inches(0), Inches(0), prs.slide_width, Inches(0.05), T["accent"])
    _textbox(slide, Inches(0.8), Inches(0.35), Inches(11.5), Inches(0.7),
             sd.get("title", "Timeline"), T, font_size=30, bold=True,
             color_key="text", font_key="heading_font")
    _rect(slide, Inches(0.8), Inches(1.1), Inches(2.5), Inches(0.04), T["accent"])

    steps = sd.get("steps", sd.get("points", []))
    if not steps:
        return

    n = min(len(steps), 6)
    step_w_in = 1.8
    gap = 0.25
    total = n * step_w_in + (n - 1) * gap
    sx = (13.333 - total) / 2

    # Connector line
    line_y = Inches(2.3)
    _rect(slide, Inches(sx + 0.3), line_y, Inches(total - 0.6), Inches(0.03), T["divider"])

    for i, step in enumerate(steps[:n]):
        x = Inches(sx + i * (step_w_in + gap))
        _number_icon(slide, x + Inches(step_w_in / 2 - 0.25), Inches(1.9), Inches(0.5), i + 1, T)

        step_text = step if isinstance(step, str) else step.get("text", step.get("title", ""))
        step_desc = "" if isinstance(step, str) else step.get("description", "")

        _textbox(slide, x, Inches(2.8), Inches(step_w_in), Inches(0.5),
                 str(step_text), T, font_size=13, bold=True,
                 color_key="text", align=PP_ALIGN.CENTER)
        if step_desc:
            _textbox(slide, x, Inches(3.3), Inches(step_w_in), Inches(1.2),
                     str(step_desc), T, font_size=11,
                     color_key="text_muted", align=PP_ALIGN.CENTER)

    _add_speaker_note(slide, sd)


def _build_quote_slide(prs, sd, T, idx, rng, deck_style):
    """Large centred quote slide."""
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    _set_slide_bg(slide, T["bg_alt"])
    _decorate_slide(slide, T, prs, idx, rng)

    _textbox(slide, Inches(1), Inches(1.2), Inches(2), Inches(1.5),
             "\u201C", T, font_size=120, color_key="accent", align=PP_ALIGN.LEFT,
             font_key="heading_font")

    quote = sd.get("quote", sd.get("text", ""))
    _textbox(slide, Inches(1.5), Inches(2.5), Inches(10), Inches(2.5),
             quote, T, font_size=26, color_key="text",
             align=PP_ALIGN.LEFT, font_key="heading_font")

    author = sd.get("author", sd.get("attribution", ""))
    if author:
        _rect(slide, Inches(1.5), Inches(5.2), Inches(2), Inches(0.04), T["accent"])
        _textbox(slide, Inches(1.5), Inches(5.4), Inches(10), Inches(0.5),
                 f"\u2014 {author}", T, font_size=16, color_key="text_muted")

    _add_speaker_note(slide, sd)


def _icon_badge(slide, cx, cy, glyph, T, diameter=Inches(0.6)):
    """Solid-filled circle badge with a centred emoji/glyph — used by icon_grid
    and the image_placeholder fallback (design spec item 3). (cx, cy) is the
    badge's centre point."""
    d = int(diameter)
    left = int(cx) - d // 2
    top = int(cy) - d // 2
    badge = slide.shapes.add_shape(MSO_SHAPE.OVAL, left, top, d, d)
    badge.fill.solid()
    badge.fill.fore_color.rgb = T["card_hover"]
    badge.line.fill.background()
    tf = badge.text_frame
    tf.word_wrap = False
    p = tf.paragraphs[0]
    p.text = str(glyph)
    _set_para_font(p, size=Pt(24), color=T["text"], bold=False, name=T["body_font"])
    p.alignment = PP_ALIGN.CENTER
    return badge


def _build_icon_grid_slide(prs, sd, T, idx, rng, deck_style):
    """Grid of icon-cards with emoji + title + description."""
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    _set_slide_bg(slide, T["bg"])
    _decorate_slide(slide, T, prs, idx, rng)

    _rect(slide, Inches(0), Inches(0), prs.slide_width, Inches(0.05), T["accent"])
    _textbox(slide, Inches(0.8), Inches(0.35), Inches(11.5), Inches(0.7),
             sd.get("title", ""), T, font_size=30, bold=True,
             color_key="text", font_key="heading_font")
    _rect(slide, Inches(0.8), Inches(1.1), Inches(2.5), Inches(0.04), T["accent"])

    items = sd.get("items", sd.get("cards", []))
    if not items:
        return

    n = min(len(items), 6)
    cols = min(n, 3)
    card_w = 3.6
    card_h = 2.4
    gap = 0.4
    total_w = cols * card_w + (cols - 1) * gap
    sx = (13.333 - total_w) / 2

    for i, item in enumerate(items[:n]):
        row, col = divmod(i, cols)
        x = Inches(sx + col * (card_w + gap))
        y = Inches(1.5 + row * (card_h + gap))

        _rect(slide, x, y, Inches(card_w), Inches(card_h), T["card"], radius_pt=8)

        icon = item.get("icon", item.get("emoji", ""))
        title = item.get("title", "")
        desc = item.get("description", "")

        if icon:
            badge_cx = x + Inches(card_w) // 2
            badge_cy = y + Inches(0.5)
            _icon_badge(slide, badge_cx, badge_cy, icon, T, diameter=Inches(0.6))
        _textbox(slide, Inches(x.inches + 0.3), Inches(y.inches + 0.9), Inches(card_w - 0.6), Inches(0.5),
                 title, T, font_size=16, bold=True, color_key="text", align=PP_ALIGN.CENTER)
        if desc:
            _textbox(slide, Inches(x.inches + 0.3), Inches(y.inches + 1.4), Inches(card_w - 0.6), Inches(0.8),
                     desc, T, font_size=12, color_key="text_muted", align=PP_ALIGN.CENTER)

    _add_speaker_note(slide, sd)


def _build_comparison_slide(prs, sd, T, idx, rng, deck_style):
    """Side-by-side comparison (vs/before-after)."""
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    _set_slide_bg(slide, T["bg"])
    _decorate_slide(slide, T, prs, idx, rng)

    _rect(slide, Inches(0), Inches(0), prs.slide_width, Inches(0.05), T["accent"])
    _textbox(slide, Inches(0.8), Inches(0.35), Inches(11.5), Inches(0.7),
             sd.get("title", "Comparison"), T, font_size=30, bold=True,
             color_key="text", font_key="heading_font")
    _rect(slide, Inches(0.8), Inches(1.1), Inches(2.5), Inches(0.04), T["accent"])

    # Left side
    left = sd.get("left", sd.get("before", {}))
    _rect(slide, Inches(0.5), Inches(1.5), Inches(5.8), Inches(5.2), T["card"], radius_pt=8)
    _rect(slide, Inches(0.5), Inches(1.5), Inches(5.8), Inches(0.06), T["accent"])
    lt = left.get("title", "Before") if isinstance(left, dict) else "Before"
    _textbox(slide, Inches(0.8), Inches(1.7), Inches(5.2), Inches(0.5),
             lt, T, font_size=22, bold=True, color_key="accent")
    lp = left.get("points", []) if isinstance(left, dict) else []
    if lp:
        _bullet_list(slide, Inches(0.8), Inches(2.5), Inches(5.2), Inches(3.8), lp, T, font_size=15)

    # VS badge
    vs = slide.shapes.add_shape(MSO_SHAPE.OVAL, Inches(6.1), Inches(3.3), Inches(0.9), Inches(0.9))
    vs.fill.solid()
    vs.fill.fore_color.rgb = T["accent2"]
    vs.line.fill.background()
    tf = vs.text_frame
    p = tf.paragraphs[0]
    p.text = "VS"
    _set_para_font(p, size=Pt(16), color=RGBColor(0xFF, 0xFF, 0xFF), bold=True, name=T["heading_font"])
    p.alignment = PP_ALIGN.CENTER

    # Right side
    right = sd.get("right", sd.get("after", {}))
    _rect(slide, Inches(7.0), Inches(1.5), Inches(5.8), Inches(5.2), T["card"], radius_pt=8)
    _rect(slide, Inches(7.0), Inches(1.5), Inches(5.8), Inches(0.06), T["accent2"])
    rt = right.get("title", "After") if isinstance(right, dict) else "After"
    _textbox(slide, Inches(7.3), Inches(1.7), Inches(5.2), Inches(0.5),
             rt, T, font_size=22, bold=True, color_key="accent")
    rp = right.get("points", []) if isinstance(right, dict) else []
    if rp:
        _bullet_list(slide, Inches(7.3), Inches(2.5), Inches(5.2), Inches(3.8), rp, T, font_size=15)

    _add_speaker_note(slide, sd)


def _build_image_placeholder_slide(prs, sd, T, idx, rng, deck_style):
    """Content + a real generated image, falling back to a rich illustrated
    placeholder card when no image provider is configured or generation fails."""
    from .image_generator import generate_slide_image

    slide = prs.slides.add_slide(prs.slide_layouts[6])
    _set_slide_bg(slide, T["bg"])
    _decorate_slide(slide, T, prs, idx, rng)

    _rect(slide, Inches(0), Inches(0), prs.slide_width, Inches(0.05), T["accent"])
    _textbox(slide, Inches(0.8), Inches(0.35), Inches(11.5), Inches(0.7),
             sd.get("title", ""), T, font_size=30, bold=True,
             color_key="text", font_key="heading_font")
    _rect(slide, Inches(0.8), Inches(1.1), Inches(2.5), Inches(0.04), T["accent"])

    points = sd.get("points", [])
    if points:
        _bullet_list(slide, Inches(0.8), Inches(1.5), Inches(6.5), Inches(5.2), points, T, font_size=16)

    px, py, pw, ph = Inches(8), Inches(1.5), Inches(4.8), Inches(5.0)
    img_desc = sd.get("image_description", sd.get("visual", "Illustrative visual"))

    image_bytes = generate_slide_image(img_desc)
    if image_bytes:
        slide.shapes.add_picture(io.BytesIO(image_bytes), px, py, pw, ph)
    else:
        # Enhanced fallback: illustrated card, not a bare "[caption]" box.
        _rect(slide, px, py, pw, ph, T["card"], radius_pt=8)
        _rect(slide, px, py, pw, Inches(0.06), T["accent"])

        card_cx = px + pw // 2
        card_cy = py + ph // 2

        # Large circle, upper-right corner of the card.
        _circle(slide, px + int(pw * 0.85), py + int(ph * 0.18),
                Inches(0.9), T["accent"], alpha_pct=40)
        # Diamond, lower-left of the card.
        _diamond(slide, px + int(pw * 0.22), py + int(ph * 0.82),
                 Inches(1.0), T["accent2"], alpha_pct=30)
        # Small circle, centered.
        _circle(slide, card_cx, card_cy, Inches(0.5), T["accent3"], alpha_pct=25)

        icon = sd.get("icon", "\U0001F5BC")  # 🖼
        badge_cy = py + Inches(1.3)
        _icon_badge(slide, card_cx, badge_cy, icon, T, diameter=Inches(1.2))

        _textbox(slide, px + Inches(0.3), badge_cy + Inches(1.0), pw - Inches(0.6), Inches(1.5),
                 img_desc, T, font_size=13, color_key="text_secondary",
                 align=PP_ALIGN.CENTER, italic=True)

    _add_speaker_note(slide, sd)


def _build_thank_you_slide(prs, sd, T, idx, rng, deck_style):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    variant = deck_style["bookend_variant"]
    title = sd.get("title", "Thank You!")
    subtitle = sd.get("subtitle", "")
    contact = sd.get("contact", "")

    if variant == 0:
        # Centred with dual accent bars
        _set_slide_bg(slide, T["bg_alt"])
        _decorate_slide(slide, T, prs, idx, rng)
        bw = Inches(_rand(rng, 2.5, 4))
        _rect(slide, Inches((13.333 - bw.inches) / 2), Inches(1.8), bw, Inches(0.05), T["accent"])
        _rich_text_box(slide, Inches(1), Inches(2.2), Inches(11.333), Inches(2.5),
                       title, subtitle, T, main_size=48, sub_size=20)
        _rect(slide, Inches((13.333 - bw.inches) / 2), Inches(4.8), bw, Inches(0.05), T["accent"])
        if contact:
            _textbox(slide, Inches(1), Inches(5.3), Inches(11.333), Inches(0.5),
                     contact, T, font_size=14, color_key="text_muted", align=PP_ALIGN.CENTER)

    elif variant == 1:
        # Full-width gradient bars top & bottom
        _set_slide_bg(slide, T["bg"])
        _rect(slide, Inches(0), Inches(0), prs.slide_width, Inches(0.12), T["accent"])
        _rect(slide, Inches(0), prs.slide_height - Inches(0.12), prs.slide_width, Inches(0.12), T["accent2"])
        _decorate_slide(slide, T, prs, idx, rng)
        _rich_text_box(slide, Inches(1.5), Inches(2.0), Inches(10.333), Inches(2.5),
                       title, subtitle, T, main_size=52, sub_size=20)
        if contact:
            _textbox(slide, Inches(1.5), Inches(5.5), Inches(10.333), Inches(0.5),
                     contact, T, font_size=14, color_key="text_muted", align=PP_ALIGN.CENTER)

    else:
        # Card centred
        _set_slide_bg(slide, T["bg_alt"])
        _decorate_slide(slide, T, prs, idx, rng)
        cw, ch = Inches(8), Inches(3.5)
        _rect(slide, Inches((13.333 - 8) / 2), Inches(2), cw, ch, T["card"], radius_pt=12)
        _rect(slide, Inches((13.333 - 8) / 2), Inches(2), cw, Inches(0.06), T["accent"])
        _rich_text_box(slide, Inches((13.333 - 8) / 2 + 0.5), Inches(2.4), Inches(7), Inches(2),
                       title, subtitle, T, main_size=44, sub_size=18)
        if contact:
            _textbox(slide, Inches((13.333 - 8) / 2), Inches(4.6), cw, Inches(0.5),
                     contact, T, font_size=13, color_key="text_muted", align=PP_ALIGN.CENTER)


def _build_table_slide(prs, sd, T, idx, rng, deck_style):
    """Data table layout: header row + banded data rows."""
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    _set_slide_bg(slide, T["bg"])
    _decorate_slide(slide, T, prs, idx, rng)

    _rect(slide, Inches(0), Inches(0), prs.slide_width, Inches(0.05), T["accent"])
    _textbox(slide, Inches(0.8), Inches(0.35), Inches(11.5), Inches(0.7),
             sd.get("title", "Table"), T, font_size=30, bold=True,
             color_key="text", font_key="heading_font")
    _rect(slide, Inches(0.8), Inches(1.1), Inches(2.5), Inches(0.04), T["accent"])

    headers = sd.get("headers", [])
    data_rows = sd.get("rows", [])
    if not headers or not data_rows:
        _add_speaker_note(slide, sd)
        return

    truncated = 0
    if len(data_rows) > 10:
        truncated = len(data_rows) - 10
        data_rows = data_rows[:10]
        note = (sd.get("speaker_note") or "").strip()
        sd["speaker_note"] = f"{note} (+{truncated} more rows not shown)".strip()

    n_rows = len(data_rows)
    if truncated:
        header_size = body_size = 10
    elif n_rows <= 6:
        header_size, body_size = 14, 13
    elif n_rows <= 10:
        header_size, body_size = 12, 11
    else:
        header_size = body_size = 10

    # Long-cell truncation only kicks in for wide tables (design spec item 4).
    truncate_cells = len(headers) >= 6

    def _cell_text(value) -> str:
        text = str(value)
        if truncate_cells and len(text) > 20:
            text = text[:17] + "..."
        return text

    n_cols = len(headers)
    graphic_frame = slide.shapes.add_table(
        n_rows + 1, n_cols, Inches(0.8), Inches(1.5), Inches(11.5), Inches(5.2))
    table = graphic_frame.table

    for c, header_text in enumerate(headers):
        cell = table.cell(0, c)
        cell.fill.solid()
        cell.fill.fore_color.rgb = T["accent"]
        cell.text = _cell_text(header_text)
        _set_para_font(cell.text_frame.paragraphs[0], size=Pt(header_size),
                       color=RGBColor(0xFF, 0xFF, 0xFF), bold=True, name=T["heading_font"])

    for r, row in enumerate(data_rows):
        band = T["card"] if r % 2 == 0 else T["card_hover"]
        for c in range(n_cols):
            value = row[c] if c < len(row) else ""
            cell = table.cell(r + 1, c)
            cell.fill.solid()
            cell.fill.fore_color.rgb = band
            cell.text = _cell_text(value)
            _set_para_font(cell.text_frame.paragraphs[0], size=Pt(body_size),
                           color=T["text"], name=T["body_font"])

    # ponytail: python-pptx's table border XML API is awkward for a single
    # horizontal-only rule; alternating row-fill banding already gives the
    # visual separation the spec asks for, so explicit border-drawing is
    # skipped here (spec explicitly allows this trade-off).
    for r in range(n_rows + 1):
        for c in range(n_cols):
            cell = table.cell(r, c)
            cell.margin_left = Inches(0.1)
            cell.margin_right = Inches(0.1)
            cell.margin_top = Inches(0.05)
            cell.margin_bottom = Inches(0.05)

    _add_speaker_note(slide, sd)


_CHART_TYPE_MAP = {
    "bar": XL_CHART_TYPE.COLUMN_CLUSTERED,
    "line": XL_CHART_TYPE.LINE_MARKERS,
    "pie": XL_CHART_TYPE.PIE,
}


def _build_chart_slide(prs, sd, T, idx, rng, deck_style):
    """Native PowerPoint chart (bar / line / pie)."""
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    _set_slide_bg(slide, T["bg"])
    _decorate_slide(slide, T, prs, idx, rng)

    _rect(slide, Inches(0), Inches(0), prs.slide_width, Inches(0.05), T["accent"])
    _textbox(slide, Inches(0.8), Inches(0.35), Inches(11.5), Inches(0.7),
             sd.get("title", "Chart"), T, font_size=30, bold=True,
             color_key="text", font_key="heading_font")
    _rect(slide, Inches(0.8), Inches(1.1), Inches(2.5), Inches(0.04), T["accent"])

    chart_type = sd.get("chart_type", "bar")
    xl_type = _CHART_TYPE_MAP.get(chart_type, XL_CHART_TYPE.COLUMN_CLUSTERED)

    categories = sd.get("categories", [])
    series_list = sd.get("series", [])[:4]
    if not categories or not series_list:
        _add_speaker_note(slide, sd)
        return

    chart_data = CategoryChartData()
    chart_data.categories = categories
    for s in series_list:
        chart_data.add_series(s.get("name", ""), s.get("values", []))

    graphic_frame = slide.shapes.add_chart(
        xl_type, Inches(0.8), Inches(1.5), Inches(11.5), Inches(5.2), chart_data)
    chart = graphic_frame.chart

    series_colors = [T["accent"], T["accent2"], T["accent3"], T["text_secondary"]]
    for i, plot_series in enumerate(chart.plots[0].series):
        plot_series.format.fill.solid()
        plot_series.format.fill.fore_color.rgb = series_colors[i % len(series_colors)]

    chart.has_legend = True
    chart.legend.position = (XL_LEGEND_POSITION.RIGHT if chart_type == "pie"
                              else XL_LEGEND_POSITION.BOTTOM)
    chart.legend.include_in_layout = False

    # Chart XML styling is finicky (esp. for pie charts, which lack axes) —
    # an unstyled-but-correct chart is an acceptable degraded result, so this
    # is best-effort only.
    try:
        chart.category_axis.tick_labels.font.color.rgb = T["text_muted"]
        chart.value_axis.tick_labels.font.color.rgb = T["text_muted"]
        chart.value_axis.major_gridlines.format.line.color.rgb = T["divider"]
    except Exception as e:
        logger.warning("Chart axis styling skipped for slide %d (%s): %s", idx, chart_type, e)

    _add_speaker_note(slide, sd)


# ============================================================================
#  Speaker notes helper
# ============================================================================

def _add_speaker_note(slide, sd):
    note = sd.get("speaker_note", "")
    if note:
        slide.notes_slide.notes_text_frame.text = note


# ============================================================================
#  Layout dispatcher
# ============================================================================

_SLIDE_BUILDERS = {
    "title":              _build_title_slide,
    "section":            _build_section_slide,
    "content":            _build_content_slide,
    "two_column":         _build_two_column_slide,
    "key_metrics":        _build_key_metrics_slide,
    "timeline":           _build_timeline_slide,
    "quote":              _build_quote_slide,
    "icon_grid":          _build_icon_grid_slide,
    "comparison":         _build_comparison_slide,
    "image_placeholder":  _build_image_placeholder_slide,
    "thank_you":          _build_thank_you_slide,
    "table":              _build_table_slide,
    "chart":              _build_chart_slide,
}


# ============================================================================
#  Slide-number footer
# ============================================================================

def _add_slide_numbers(prs, T):
    total = len(prs.slides)
    for i, slide in enumerate(prs.slides):
        _textbox(slide, prs.slide_width - Inches(1.2), prs.slide_height - Inches(0.45),
                 Inches(1), Inches(0.35),
                 f"{i + 1} / {total}", T, font_size=9,
                 color_key="text_muted", align=PP_ALIGN.RIGHT)


# ============================================================================
#  Brand logo
# ============================================================================

_BRANDING_DIR = os.path.join(os.path.dirname(__file__), "..", "static", "branding")


def _relative_luminance(color: RGBColor) -> float:
    """0..1 luminance estimate, used only for a light/dark threshold at 0.5."""
    hex_str = str(color)
    r = int(hex_str[0:2], 16)
    g = int(hex_str[2:4], 16)
    b = int(hex_str[4:6], 16)
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255


def _add_logo(prs, T, logo_dir):
    """Stamp the AIonOS logo on every slide (bottom-left) plus a larger
    top-left mark on the title slide — light logo on dark backgrounds,
    dark logo on light backgrounds."""
    logo_file = "aionos-logo-light.png" if _relative_luminance(T["bg"]) < 0.5 else "aionos-logo-dark.png"
    logo_path = os.path.join(logo_dir, logo_file)
    if not os.path.isfile(logo_path):
        return

    for i, slide in enumerate(prs.slides):
        slide.shapes.add_picture(
            logo_path, Inches(0.4), prs.slide_height - Inches(0.4) - Inches(0.28),
            height=Inches(0.28))
        if i == 0:
            slide.shapes.add_picture(logo_path, Inches(0.4), Inches(0.4), height=Inches(0.5))


# ============================================================================
#  Main entry point
# ============================================================================

def generate_pptx(slides_json: list[dict], title: str = "Presentation",
                  theme: Optional[str] = None,
                  output_dir: Optional[str] = None) -> str:
    """
    Generate a beautiful .pptx from structured slide data.

    Args:
        slides_json: Slide dicts from LLM, each with 'layout' + layout-specific keys.
        title:       Presentation title (used in filename).
        theme:       Theme name or None for auto-detect / random.
                     Options: midnight, sunset, forest, ocean, royal, clean_light,
                              coral, arctic, neon, corporate, bold, rose_gold,
                              volcano, slate.
        output_dir:  Output directory (defaults to media/presentations/).

    Returns:
        Relative path from MEDIA_ROOT (e.g. "presentations/xyz.pptx").
    """
    from django.conf import settings

    if output_dir is None:
        output_dir = os.path.join(settings.MEDIA_ROOT, "presentations")
    os.makedirs(output_dir, exist_ok=True)

    # Pick theme from JSON metadata or arg or random
    meta_theme = None
    if slides_json and isinstance(slides_json[0], dict):
        meta_theme = slides_json[0].get("theme")
    T = _pick_theme(theme or meta_theme)

    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)

    # One RNG instance shared by every builder call in this generation, so a
    # single deck reads as visually cohesive — never seeded explicitly, so
    # different generations still vary.
    rng = random.Random()
    deck_style = {"bookend_variant": rng.randint(0, 2)}

    for idx, sd in enumerate(slides_json):
        layout = sd.get("layout", "content")
        builder = _SLIDE_BUILDERS.get(layout, _build_content_slide)
        try:
            builder(prs, sd, T, idx, rng, deck_style)
        except Exception as e:
            logger.error("Slide %d (layout=%s) error: %s", idx, layout, e)
            _build_content_slide(prs, sd, T, idx, rng, deck_style)

    _add_slide_numbers(prs, T)

    try:
        _add_logo(prs, T, _BRANDING_DIR)
    except Exception as e:
        logger.warning("Failed to add brand logo: %s", e)

    safe_title = re.sub(r"[^\w\s-]", "", title)[:50].strip().replace(" ", "_") or "presentation"
    filename = f"{safe_title}_{uuid.uuid4().hex[:8]}.pptx"
    filepath = os.path.join(output_dir, filename)

    prs.save(filepath)
    logger.info("Generated PPTX [theme=%s]: %s (%d slides)", T["name"], filepath, len(prs.slides))

    return f"presentations/{filename}"


def get_available_themes() -> list[dict]:
    """Return list of available themes with preview colors for frontend."""
    result = []
    for k, v in THEMES.items():
        # Convert RGBColor objects to CSS hex strings for the frontend
        def _hex(color) -> str:
            try:
                return f"#{str(color)}"
            except Exception:
                return "#888888"

        result.append({
            "id": k,
            "name": v["name"],
            "preview_colors": [
                _hex(v.get("accent", "")),
                _hex(v.get("accent2", "")),
                _hex(v.get("bg", "")),
            ],
        })
    return result


# ============================================================================
#  JSON parser – robust multi-strategy with markdown fallback
# ============================================================================

def _try_parse_json_obj(text: str) -> Optional[dict]:
    """Try to parse text as a JSON object; return dict or None."""
    try:
        data = json.loads(text)
        if isinstance(data, dict):
            return data
    except (json.JSONDecodeError, ValueError):
        pass
    return None


def _try_parse_json_list(text: str) -> Optional[list]:
    """Try to parse text as a JSON array; return list or None."""
    try:
        data = json.loads(text)
        if isinstance(data, list):
            return data
    except (json.JSONDecodeError, ValueError):
        pass
    return None


def _extract_slides(data) -> Optional[list[dict]]:
    """Given parsed JSON (dict or list), extract the slides array."""
    if isinstance(data, dict) and "slides" in data and isinstance(data["slides"], list):
        return data["slides"]
    if isinstance(data, list) and len(data) > 0 and isinstance(data[0], dict):
        return data
    return None


def _find_outermost_json_object(text: str) -> Optional[str]:
    """Find the largest balanced { ... } block containing '"slides"'."""
    best = None
    for i, ch in enumerate(text):
        if ch == '{':
            depth = 0
            for j in range(i, len(text)):
                if text[j] == '{':
                    depth += 1
                elif text[j] == '}':
                    depth -= 1
                    if depth == 0:
                        candidate = text[i:j + 1]
                        if '"slides"' in candidate:
                            if best is None or len(candidate) > len(best):
                                best = candidate
                        break
    return best


def _parse_markdown_slides(content: str) -> Optional[list[dict]]:
    """Fallback: convert markdown-formatted slide descriptions into slide JSON."""
    slides = []
    # Split on ### or --- slide separators
    parts = re.split(r'(?:^|\n)(?:#{1,3}\s+Slide\s+\d+|\n---\n)', content, flags=re.IGNORECASE)

    for part in parts:
        part = part.strip()
        if not part:
            continue

        # Extract title
        title_m = re.search(r'(?:Title|title)[:\s]+(.+)', part)
        title = title_m.group(1).strip().rstrip('*').strip() if title_m else ''

        # Extract subtitle
        sub_m = re.search(r'(?:Subtitle|subtitle)[:\s]+(.+)', part)
        subtitle = sub_m.group(1).strip() if sub_m else ''

        # Extract bullet points
        points = re.findall(r'^\s*[-*]\s+(.+)', part, re.MULTILINE)

        # Extract quote
        quote_m = re.search(r'(?:Quote|quote)[:\s]+["\u201C]?(.+?)["\u201D]?\s*$', part, re.MULTILINE)

        if not title and not points and not quote_m:
            continue

        # Determine layout based on content
        lower = part.lower()
        if 'title slide' in lower or ('title' in lower and len(slides) == 0):
            slides.append({'layout': 'title', 'title': title, 'subtitle': subtitle})
        elif 'thank you' in lower or 'thank_you' in lower:
            slides.append({'layout': 'thank_you', 'title': title or 'Thank You!', 'subtitle': subtitle})
        elif quote_m:
            author_m = re.search(r'(?:Author|author|Attribution)[:\s]+(.+)', part)
            slides.append({
                'layout': 'quote',
                'quote': quote_m.group(1).strip(),
                'author': author_m.group(1).strip() if author_m else '',
            })
        elif 'section' in lower and not points:
            slides.append({'layout': 'section', 'title': title, 'subtitle': subtitle})
        elif points:
            slides.append({'layout': 'content', 'title': title, 'points': points})
        elif title:
            slides.append({'layout': 'content', 'title': title, 'points': []})

    return slides if len(slides) >= 2 else None


def parse_llm_slides(llm_content: str) -> Optional[list[dict]]:
    """Extract structured slide JSON from LLM response using multiple strategies."""

    # ---- Strategy 1: fenced ```json ... ``` ----
    m = re.search(r'```(?:json)?\s*\n(.*?)\n\s*```', llm_content, re.DOTALL)
    if m:
        obj = _try_parse_json_obj(m.group(1))
        if obj:
            slides = _extract_slides(obj)
            if slides:
                return slides
        lst = _try_parse_json_list(m.group(1))
        if lst:
            slides = _extract_slides(lst)
            if slides:
                return slides

    # ---- Strategy 2: balanced braces containing "slides" ----
    block = _find_outermost_json_object(llm_content)
    if block:
        obj = _try_parse_json_obj(block)
        if obj:
            slides = _extract_slides(obj)
            if slides:
                return slides

    # ---- Strategy 3: bare JSON array [{...}, ...] ----
    m = re.search(r'\[\s*\{', llm_content)
    if m:
        # Find the start and try to parse from there
        start = m.start()
        for end in range(len(llm_content), start, -1):
            if llm_content[end - 1] == ']':
                lst = _try_parse_json_list(llm_content[start:end])
                if lst:
                    slides = _extract_slides(lst)
                    if slides:
                        return slides
                # This candidate ']' didn't produce valid slides — keep
                # backing off to earlier ']' candidates instead of giving up.

    # ---- Strategy 4: markdown fallback ----
    logger.info("JSON parsing failed, trying markdown fallback")
    slides = _parse_markdown_slides(llm_content)
    if slides:
        logger.info("Markdown fallback produced %d slides", len(slides))
        return slides

    logger.warning("Could not parse slides from LLM response")
    return None


def extract_presentation_metadata(llm_content: str) -> tuple[Optional[str], Optional[list[str]]]:
    """Extract theme and style_suggestions from the LLM response wrapper.
    Returns (theme, style_suggestions)."""
    # Try fenced JSON first
    m = re.search(r'```(?:json)?\s*\n(.*?)\n\s*```', llm_content, re.DOTALL)
    if m:
        obj = _try_parse_json_obj(m.group(1))
        if obj:
            return obj.get('theme'), obj.get('style_suggestions')

    # Try bare JSON object
    block = _find_outermost_json_object(llm_content)
    if block:
        obj = _try_parse_json_obj(block)
        if obj:
            return obj.get('theme'), obj.get('style_suggestions')

    return None, None
