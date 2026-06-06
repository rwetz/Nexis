// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/** Per-theme accent colors for the AnimatedFolder component. */
const FOLDER_COLORS: Record<string, { dark: string; light: string }> = {
  "nexis-default": { dark: "#5227FF", light: "#4318D6" },
  "claude":        { dark: "#d97757", light: "#c15f3c" },
  "tokyo-night":   { dark: "#7aa2f7", light: "#4B80E8" },
  "nord":          { dark: "#81a1c1", light: "#5e81ac" },
  "tide":          { dark: "#6cb6b0", light: "#3d8f89" },
  "sage":          { dark: "#8aaf60", light: "#5d7a45" },
  "catppuccin":    { dark: "#cba6f7", light: "#8839ef" },
  "gruvbox":       { dark: "#d79921", light: "#b57614" },
  "rose-pine":     { dark: "#c4a7e7", light: "#b4637a" },
  "caffeine":      { dark: "#c08040", light: "#8b5e2b" },
};

const FALLBACK = FOLDER_COLORS["nexis-default"];

export function getFolderColor(
  themeId: string,
  resolvedMode: "dark" | "light",
): string {
  return (FOLDER_COLORS[themeId] ?? FALLBACK)[resolvedMode];
}
