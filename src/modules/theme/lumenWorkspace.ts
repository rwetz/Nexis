import { importLumenPalette } from "./lumenExchange";
import type { Theme } from "./types";

export type LumenWorkspaceHandoff = {
  label: string;
  scenePath: string;
  scene: unknown;
  theme: Theme;
};

export function parseLumenWorkspaceHandoff(raw: unknown): LumenWorkspaceHandoff {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("Handoff must be a JSON object");
  const data = raw as Record<string, unknown>;
  if (data.format !== "nexis-lumen-workspace" || data.version !== 1) throw new Error("Unsupported workspace handoff format or version");
  const workspace = data.workspace;
  if (typeof workspace !== "object" || workspace === null || Array.isArray(workspace)) throw new Error("Missing workspace locator");
  const locator = workspace as Record<string, unknown>;
  if (typeof locator.label !== "string" || !locator.label.trim() || locator.label.length > 80 ||
    typeof locator.scenePath !== "string" || !/^lumen\/[a-z0-9-]{1,80}\.nexis-lumen-scene\.json$/.test(locator.scenePath)) {
    throw new Error("Invalid workspace label or scene path");
  }
  const scene = data.scene;
  if (typeof scene !== "object" || scene === null || Array.isArray(scene)) throw new Error("Missing scene");
  const snapshot = scene as Record<string, unknown>;
  if (snapshot.format !== "nexis-lumen-scene" || snapshot.version !== 1) throw new Error("Unsupported scene format or version");
  const settings = snapshot.scene;
  if (typeof settings !== "object" || settings === null || Array.isArray(settings)) throw new Error("Missing scene settings");
  const s = settings as Record<string, unknown>;
  if (typeof s.generator !== "string" || !/^[a-z0-9-]{1,64}$/.test(s.generator) ||
    !Number.isSafeInteger(s.seed) || Number(s.seed) < 0 || Number(s.seed) > 1_000_000_000 ||
    typeof s.mouseStrength !== "number" || !Number.isFinite(s.mouseStrength) || s.mouseStrength < 0 || s.mouseStrength > 1 ||
    typeof s.params !== "object" || s.params === null || Array.isArray(s.params)) throw new Error("Invalid scene settings");
  const params = s.params as Record<string, unknown>;
  if (Object.keys(params).length > 32 || Object.entries(params).some(([key, value]) =>
    !/^u_[a-z0-9_]{1,64}$/.test(key) || typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 1_000_000)) {
    throw new Error("Invalid scene parameters");
  }
  return { label: locator.label.trim(), scenePath: locator.scenePath, scene,
    theme: importLumenPalette(snapshot) };
}
