// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/** Per-theme accent colors for the AnimatedFolder component. */
const FOLDER_COLORS: Record<string, { dark: string; light: string }> = {
  // Nexis themes — each entry is the theme's own `primary`.
  "nexis-default": { dark: "#5227FF", light: "#4318D6" },
  "halcyon":       { dark: "#b3a0ff", light: "#6e4fc1" },
  "meridian":      { dark: "#81b2ff", light: "#2865c3" },
  "cinder":        { dark: "#8bb7db", light: "#446d8f" },
  "aurelian":      { dark: "#e5a323", light: "#8b6000" },
  "thicket":       { dark: "#68ca80", light: "#0a7e3a" },
  "vermillion":    { dark: "#ff8987", light: "#b3363d" },
  // The loud half of the Nexis set.
  "hotwire":       { dark: "#ff8798", light: "#bc1f4b" },
  "tangerine":     { dark: "#ff8f51", light: "#a74900" },
  "sulfur":        { dark: "#d0af00", light: "#7c6700" },
  "acid":          { dark: "#8ec629", light: "#527700" },
  "absinthe":      { dark: "#00d097", light: "#007c59" },
  "cyanotype":     { dark: "#00c9cf", light: "#00787b" },
  "glacier":       { dark: "#00c5ea", light: "#00758d" },
  "ultramarine":   { dark: "#96acff", light: "#4759d1" },
  "ultraviolet":   { dark: "#d190ff", light: "#8a3db8" },
  "synthwave":     { dark: "#fd7ad6", light: "#aa2b8a" },
  // Community themes.
  "tokyo-night":   { dark: "#7aa2f7", light: "#4B80E8" },
  "catppuccin":    { dark: "#cba6f7", light: "#8839ef" },
  "nord":          { dark: "#81a1c1", light: "#5e81ac" },
  "gruvbox":       { dark: "#d79921", light: "#b57614" },
  "rose-pine":     { dark: "#c4a7e7", light: "#b4637a" },
};

const FALLBACK = FOLDER_COLORS["nexis-default"];

export function getFolderColor(
  themeId: string,
  resolvedMode: "dark" | "light",
): string {
  return (FOLDER_COLORS[themeId] ?? FALLBACK)[resolvedMode];
}
