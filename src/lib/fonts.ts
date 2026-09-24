// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

// Ordered by preference. A Nerd Font patch is always preferred over the
// bundled face because the terminal needs the private-use glyph range that
// powerline prompts (starship, oh-my-posh, p10k) draw with — an unpatched
// family renders those as tofu no matter how good it looks otherwise.
//
// The Geist Mono patch leads: Geist Mono is the default code face, so when
// the user has the patched build installed that is the one to use.
const NERD_FONT_CANDIDATES = [
  "GeistMono Nerd Font",
  "GeistMono Nerd Font Mono",
  "JetBrainsMono Nerd Font",
  "JetBrainsMono Nerd Font Mono",
  "JetBrainsMonoNL Nerd Font",
  "FiraCode Nerd Font",
  "FiraCode Nerd Font Mono",
  "MesloLGS NF",
  "MesloLGM Nerd Font",
  "Hack Nerd Font",
  "Hack Nerd Font Mono",
  "Iosevka Nerd Font",
  "Iosevka Term Nerd Font",
  "SauceCodePro Nerd Font",
  "Hasklug Nerd Font",
];

/**
 * The bundled chain, used when no Nerd Font is installed.
 *
 * Geist Mono is the default: it is the mono half of the family the interface
 * is set in, so code and chrome share a skeleton and an x-height rather than
 * being two unrelated faces sharing a window. JetBrains Mono follows because
 * its bundled subsets cover Cyrillic and Geist Mono's do not.
 *
 * Fontsource names its variable builds `<Family> Variable` so they can sit
 * alongside a static install of the same face without colliding. The chain
 * therefore lists the bundled variable build FIRST and the plain name second:
 * the second entry is not redundant, it is the user's own system install.
 */
const FALLBACK_CHAIN =
  '"Geist Mono Variable", "Geist Mono", "JetBrains Mono", SFMono-Regular, Menlo, monospace';

/** The bundled default code family, by name. */
export const DEFAULT_CODE_FONT_FAMILY = "Geist Mono Variable";

let detected: string | null = null;
let monoReady: Promise<void> | null = null;

export function ensureMonoFontsLoaded(): Promise<void> {
  if (monoReady) return monoReady;
  if (typeof document === "undefined" || !document.fonts?.load) {
    monoReady = Promise.resolve();
    return monoReady;
  }
  monoReady = Promise.allSettled([
    document.fonts.load('400 14px "Geist Mono Variable"'),
    document.fonts.load('700 14px "Geist Mono Variable"'),
    document.fonts.load('400 14px "JetBrains Mono"'),
    document.fonts.load('700 14px "JetBrains Mono"'),
  ]).then(() => undefined);
  return monoReady;
}

export function detectMonoFontFamily(): string {
  if (detected) return detected;
  if (typeof document === "undefined" || !document.fonts) {
    detected = FALLBACK_CHAIN;
    return detected;
  }
  for (const f of NERD_FONT_CANDIDATES) {
    try {
      if (document.fonts.check(`12px "${f}"`)) {
        detected = `"${f}", ${FALLBACK_CHAIN}`;
        return detected;
      }
    } catch {
      // Some browsers throw on invalid font shorthand; ignore.
    }
  }
  detected = FALLBACK_CHAIN;
  return detected;
}
