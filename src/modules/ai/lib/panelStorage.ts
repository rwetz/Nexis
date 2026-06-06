// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

const PANEL_HEIGHT_KEY = "nexis.ai.panelHeight";

export function readAiPanelHeight(fallback: number): number {
  try {
    const raw = localStorage.getItem(PANEL_HEIGHT_KEY);
    const n = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isFinite(n) && n > 80 ? n : fallback;
  } catch {
    return fallback;
  }
}

export function saveAiPanelHeight(px: number): void {
  try {
    localStorage.setItem(PANEL_HEIGHT_KEY, String(Math.round(px)));
  } catch {
    // ignore
  }
}
