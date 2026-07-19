#!/usr/bin/env python3
"""Generate the Nexis theme set.

Every Nexis theme is cut from one shared OKLCH ramp (DARK/LIGHT below): the
lightness steps are identical across the set, and only hue and chroma change
per theme. That is what makes the six read as a family rather than six
unrelated palettes, and it is why every one of them lands on the same
contrast profile.

Run it to regenerate `src/modules/theme/themes/<id>.ts` in place:

    python3 scripts/generate-theme-palettes.py

It refuses to emit anything if a palette drops below a contrast floor, so a
tweak that makes something unreadable fails here rather than in review. The
same floors are asserted at test time in themes.contrast.test.ts — the .ts
files are the shipped artefact, this script is how they were derived.
"""
import math, os, sys

# ---------- OKLCH -> sRGB ----------
def _f(x):
    return 12.92 * x if x <= 0.0031308 else 1.055 * (x ** (1 / 2.4)) - 0.055

def oklch_to_rgb(L, C, h):
    hr = math.radians(h)
    a, b = C * math.cos(hr), C * math.sin(hr)
    l_ = L + 0.3963377774 * a + 0.2158037573 * b
    m_ = L - 0.1055613458 * a - 0.0638541728 * b
    s_ = L - 0.0894841775 * a - 1.2914855480 * b
    l, m, s = l_ ** 3, m_ ** 3, s_ ** 3
    r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
    g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
    bl = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    return r, g, bl

def in_gamut(rgb, eps=1e-4):
    return all(-eps <= c <= 1 + eps for c in rgb)

def hex_of(L, C, h):
    """Clip chroma until the colour fits sRGB, then emit #rrggbb."""
    lo, hi = 0.0, C
    if not in_gamut(oklch_to_rgb(L, C, h)):
        for _ in range(30):
            mid = (lo + hi) / 2
            if in_gamut(oklch_to_rgb(L, mid, h)):
                lo = mid
            else:
                hi = mid
        C = lo
    r, g, b = oklch_to_rgb(L, C, h)
    out = []
    for c in (r, g, b):
        v = _f(min(1.0, max(0.0, c)))
        out.append(round(v * 255))
    return "#%02x%02x%02x" % tuple(out)

# ---------- WCAG contrast ----------
def _lin(c):
    c /= 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def relum(hx):
    h = hx.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    return 0.2126 * _lin(r) + 0.7152 * _lin(g) + 0.0722 * _lin(b)

def contrast(a, b):
    la, lb = relum(a), relum(b)
    if la < lb:
        la, lb = lb, la
    return (la + 0.05) / (lb + 0.05)

# ---------- the ramp ----------
# One ramp shared by every theme in the set: only hue and chroma change.
# L values are OKLCH lightness; the resulting WCAG contrasts are asserted below.
DARK = {
    "background":  (0.180, 0.012, "base"),
    "sidebar":     (0.155, 0.012, "base"),
    "card":        (0.215, 0.013, "base"),
    "popover":     (0.215, 0.013, "base"),
    "secondary":   (0.262, 0.014, "base"),
    "muted":       (0.262, 0.014, "base"),
    "accent":      (0.288, 0.016, "base"),
    "foreground":  (0.928, 0.012, "base"),
    "mutedFg":     (0.700, 0.018, "base"),
    "primary":     (0.760, "acc",  "accent"),
    "destructive": (0.660, 0.170, 25.0),
}
LIGHT = {
    "background":  (0.980, 0.006, "base"),
    "sidebar":     (0.958, 0.007, "base"),
    "card":        (1.000, 0.000, "base"),
    "popover":     (1.000, 0.000, "base"),
    "secondary":   (0.936, 0.011, "base"),
    "muted":       (0.936, 0.011, "base"),
    "accent":      (0.922, 0.014, "base"),
    "foreground":  (0.268, 0.020, "base"),
    "mutedFg":     (0.512, 0.020, "base"),
    "primary":     (0.520, "acc",  "accent"),
    "destructive": (0.505, 0.190, 27.0),
}

# ANSI slot hues (deg) — shifted per theme by `ansiShift`.
ANSI_HUES = [None, 27.0, 145.0, 85.0, 255.0, 320.0, 195.0, None]

# ANSI lightness ramp, shared across the set.
ANSI_DARK = {"norm": 0.705, "bright": 0.820, "black": 0.265,
             "brightBlack": 0.470, "white": 0.855, "brightWhite": 0.960}
ANSI_LIGHT = {"norm": 0.560, "bright": 0.485, "black": 0.300,
              "brightBlack": 0.500, "white": 0.552, "brightWhite": 0.290}

THEMES = [
    # id, name, description, baseHue, baseCmul, accentHue, accentC,
    # ansiShift, ansiC, editor
    ("aurelian", "Aurelian", "Warm gold over deep umber — low glare, long sessions.",
     70.0, 1.0, 78.0, 0.150, -4.0, 0.140, ("atomone", "xcode-light")),
    ("cinder", "Cinder", "Near-neutral graphite with one restrained steel accent.",
     250.0, 0.30, 244.0, 0.070, 0.0, 0.110, ("github-dark", "github-light")),
    ("halcyon", "Halcyon", "Indigo and violet — the Nexis signature palette.",
     291.0, 1.0, 292.0, 0.170, 4.0, 0.145, ("aura", "github-light")),
    ("meridian", "Meridian", "Deep marine blue under a bright cobalt accent.",
     255.0, 1.0, 259.0, 0.160, 2.0, 0.138, ("tokyo-night", "github-light")),
    ("thicket", "Thicket", "Forest greens with a moss accent — quiet and matte.",
     152.0, 1.0, 150.0, 0.140, -3.0, 0.132, ("atomone", "github-light")),
    ("vermillion", "Vermillion", "Clay and rose over charcoal — warm, high energy.",
     18.0, 1.0, 22.0, 0.160, 3.0, 0.148, ("aura", "xcode-light")),
]


def build_variant(dark, base_h, base_c_mul, acc_h, acc_c, ansi_shift, ansi_c):
    ramp = DARK if dark else LIGHT
    def col(key):
        L, C, H = ramp[key]
        h = base_h if H == "base" else (acc_h if H == "accent" else H)
        c = acc_c if C == "acc" else (C * base_c_mul if H == "base" else C)
        return hex_of(L, c, h)

    bg, fg = col("background"), col("foreground")
    prim = col("primary")
    colors = {
        "background": bg,
        "foreground": fg,
        "card": col("card"), "cardForeground": fg,
        "popover": col("popover"), "popoverForeground": fg,
        "primary": prim,
        "primaryForeground": hex_of(0.180 if dark else 0.995, 0.010 * base_c_mul, base_h),
        "secondary": col("secondary"), "secondaryForeground": fg,
        "muted": col("muted"), "mutedForeground": col("mutedFg"),
        "accent": col("accent"), "accentForeground": fg,
        "destructive": col("destructive"),
        "border": rgba(fg, 0.10 if dark else 0.14),
        "input": rgba(fg, 0.14 if dark else 0.18),
        "ring": prim,
        "sidebar": col("sidebar"), "sidebarForeground": fg,
        "sidebarPrimary": prim,
        "sidebarPrimaryForeground": hex_of(0.180 if dark else 0.995, 0.010 * base_c_mul, base_h),
        "sidebarAccent": col("accent"), "sidebarAccentForeground": fg,
        "sidebarBorder": rgba(fg, 0.10 if dark else 0.14),
        "sidebarRing": prim,
        "radius": "0.5rem",
    }

    a = ANSI_DARK if dark else ANSI_LIGHT
    ansi = []
    for i in range(16):
        bright = i >= 8
        slot = i % 8
        if slot == 0:
            ansi.append(hex_of(a["brightBlack"] if bright else a["black"],
                               0.016 * base_c_mul, base_h))
        elif slot == 7:
            ansi.append(hex_of(a["brightWhite"] if bright else a["white"],
                               0.014 * base_c_mul, base_h))
        else:
            h = ANSI_HUES[slot] + ansi_shift
            L = a["bright"] if bright else a["norm"]
            C = ansi_c * (1.14 if bright else 1.0)
            ansi.append(hex_of(L, C, h))

    terminal = {
        "cursor": prim,
        "cursorAccent": bg,
        "selection": rgba(prim, 0.26 if dark else 0.20),
        "ansi": ansi,
    }
    return colors, terminal


def rgba(hx, alpha):
    h = hx.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    return f"rgba({r},{g},{b},{alpha:.2f})"


# ---------- emit + verify ----------
def check(label, got, floor, failures):
    if got < floor:
        failures.append(f"{label}: {got:.2f} < {floor}")


def main():
    out = {}
    failures = []
    for tid, name, desc, bh, bcm, ah, ac, ash, anc, editor in THEMES:
        variants = {}
        for mode, dark in (("dark", True), ("light", False)):
            colors, terminal = build_variant(dark, bh, bcm, ah, ac, ash, anc)
            variants[mode] = {"colors": colors, "terminal": terminal}
            bg, fg = colors["background"], colors["foreground"]
            p = f"{tid}/{mode}"
            check(f"{p} foreground", contrast(fg, bg), 11.0, failures)
            check(f"{p} mutedForeground", contrast(colors["mutedForeground"], bg), 4.5, failures)
            check(f"{p} primary", contrast(colors["primary"], bg), 4.5, failures)
            check(f"{p} primaryFg-on-primary",
                  contrast(colors["primaryForeground"], colors["primary"]), 4.5, failures)
            check(f"{p} destructive", contrast(colors["destructive"], bg), 4.0, failures)
            check(f"{p} fg-on-card", contrast(fg, colors["card"]), 9.0, failures)
            check(f"{p} fg-on-sidebar", contrast(fg, colors["sidebar"]), 10.0, failures)
            check(f"{p} fg-on-muted", contrast(fg, colors["muted"]), 7.0, failures)
            a = terminal["ansi"]
            for i in list(range(1, 7)) + list(range(9, 15)):
                check(f"{p} ansi[{i}]", contrast(a[i], bg), 4.0, failures)
            check(f"{p} ansi[7]", contrast(a[7], bg), 4.5, failures)
            check(f"{p} ansi[15]", contrast(a[15], bg), 7.0, failures)
            check(f"{p} ansi[8] (dim/comment)", contrast(a[8], bg), 2.6, failures)
        out[tid] = {"id": tid, "name": name, "description": desc,
                    "editorTheme": {"dark": editor[0], "light": editor[1]},
                    "variants": variants,
                    "folder": {"dark": variants["dark"]["colors"]["primary"],
                               "light": variants["light"]["colors"]["primary"]}}
    if failures:
        print("CONTRAST FAILURES:", file=sys.stderr)
        for f in failures:
            print("  " + f, file=sys.stderr)
        sys.exit(1)
    return out


# ---------- render to TypeScript ----------
THEMES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                          "..", "src", "modules", "theme", "themes")

TS_HEADER = """// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import type { Theme } from "../types";
"""


def camel(tid):
    parts = tid.split("-")
    return parts[0] + "".join(p.capitalize() for p in parts[1:])


def ts_colors(c, indent):
    pad = " " * indent
    return "\n".join(f'{pad}{k}: "{v}",' for k, v in c.items())


def ts_ansi(ansi, indent):
    pad = " " * indent
    return "\n".join(pad + " ".join(f'"{x}",' for x in ansi[i:i + 4])
                     for i in range(0, 16, 4))


def ts_variant(v, indent):
    pad = " " * indent
    c, t = v["colors"], v["terminal"]
    return (
        f"{pad}colors: {{\n{ts_colors(c, indent + 2)}\n{pad}}},\n"
        f"{pad}terminal: {{\n"
        f'{pad}  cursor: "{t["cursor"]}",\n'
        f'{pad}  cursorAccent: "{t["cursorAccent"]}",\n'
        f'{pad}  selection: "{t["selection"]}",\n'
        f"{pad}  ansi: [\n{ts_ansi(t['ansi'], indent + 4)}\n{pad}  ],\n"
        f"{pad}}},\n"
    )


def render(data):
    for tid, t in data.items():
        body = (
            f"{TS_HEADER}\n"
            f"export const {camel(tid)}: Theme = {{\n"
            f'  id: "{tid}",\n'
            f'  name: "{t["name"]}",\n'
            f'  description: "{t["description"]}",\n'
            f'  editorTheme: {{ dark: "{t["editorTheme"]["dark"]}", '
            f'light: "{t["editorTheme"]["light"]}" }},\n'
            f"  variants: {{\n"
            f"    dark: {{\n{ts_variant(t['variants']['dark'], 6)}    }},\n"
            f"    light: {{\n{ts_variant(t['variants']['light'], 6)}    }},\n"
            f"  }},\n"
            f"}};\n"
        )
        path = os.path.join(THEMES_DIR, f"{tid}.ts")
        with open(path, "w") as f:
            f.write(body)
        print(f"wrote {os.path.relpath(path)}")
    print("\nfolderColor.ts entries — paste these if an accent changed:")
    for tid, t in data.items():
        pad = " " * (13 - len(tid))
        print(f'  "{tid}":{pad}{{ dark: "{t["folder"]["dark"]}", '
              f'light: "{t["folder"]["light"]}" }},')


if __name__ == "__main__":
    render(main())
