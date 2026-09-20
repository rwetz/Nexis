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
// The two Cascadia patches lead: Cascadia Code is the default code face, so
// when the user has the patched build installed that is the one to use.
const NERD_FONT_CANDIDATES = [
  "CaskaydiaCove Nerd Font",
  "CaskaydiaCove Nerd Font Mono",
  "CaskaydiaMono Nerd Font",
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
 * Cascadia Code (Microsoft, SIL OFL) is the default: it is the Windows
 * Terminal / VS Code face, so it is the one most likely to already be
 * installed system-wide, and its programming ligatures and tall x-height
 * hold up at the 13-14px this app renders code at.
 *
 * "Cascadia Mono" follows deliberately — it is the same design with
 * ligatures removed, which is what Windows ships preinstalled under that
 * name. JetBrains Mono stays last of the bundled faces as a second opinion
 * on any glyph Cascadia's subsets miss.
 */
const FALLBACK_CHAIN =
  '"Cascadia Code Variable", "Cascadia Code", "Cascadia Mono", "JetBrains Mono", SFMono-Regular, Menlo, monospace';

/**
 * The bundled default code family, by name.
 *
 * Fontsource names its variable builds `<Family> Variable` so they can sit
 * alongside a static install of the same face without colliding. The chain
 * therefore lists the bundled variable build FIRST and the plain name second:
 * the second entry is not redundant, it is the user's own system install of
 * Cascadia Code, which should still win over the further fallbacks if the
 * bundled sheet somehow fails to load.
 */
export const DEFAULT_CODE_FONT_FAMILY = "Cascadia Code Variable";

let detected: string | null = null;
let monoReady: Promise<void> | null = null;

export function ensureMonoFontsLoaded(): Promise<void> {
  if (monoReady) return monoReady;
  if (typeof document === "undefined" || !document.fonts?.load) {
    monoReady = Promise.resolve();
    return monoReady;
  }
  monoReady = Promise.allSettled([
    document.fonts.load('400 14px "Cascadia Code Variable"'),
    document.fonts.load('700 14px "Cascadia Code Variable"'),
    document.fonts.load('italic 400 14px "Cascadia Code Variable"'),
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
