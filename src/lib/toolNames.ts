// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * The names people see for Nexis's separate-window tools.
 *
 * One place on purpose: a tool is named in its launcher, its window chrome,
 * the command palette, the pack picker, onboarding and the AI tool
 * descriptions, and a rename that misses one of them reads as two different
 * tools. Ids (`ml-lab`, `benchmark`, ...) never change with the names: saved
 * launcher order, enabled packs and deep links all key on the id.
 *
 * Formerly: ML Lab → Synapse, Benchmark → Pulse, SVG Studio → Vellum,
 * Web → Portal, Documents → Quill.
 */
export const TOOL_NAMES = {
  /** Train and try small models (id `ml-lab`). */
  mlLab: "Synapse",
  /** Time local models (id `benchmark`). */
  benchmark: "Pulse",
  /** Explore data, configs and past runs; the standalone Nexis Epoch app (id `epoch`). */
  epoch: "Epoch",
  /** SVG drawing, palettes, icons and animation (id `svg-studio`). */
  svgStudio: "Vellum",
  /** Web development tools, HTTP client and previews (id `web`). */
  web: "Portal",
  /** Markdown and Word documents (id `documents`). */
  documents: "Quill",
  /** The map of your repositories (id `atlas`). */
  atlas: "Atlas",
} as const;

export type ToolNameKey = keyof typeof TOOL_NAMES;
