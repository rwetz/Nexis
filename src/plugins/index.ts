// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * ALL_PLUGINS — the canonical list of first-party plugins activated at startup.
 * Add new plugins here. Order determines activation sequence.
 */
import { pythonPlugin } from "./python";
import { containersPlugin } from "./containers";

export const ALL_PLUGINS = [pythonPlugin, containersPlugin] as const;
