import { describe, expect, it } from "vitest";
import { parseLumenWorkspaceHandoff } from "./lumenWorkspace";

const handoff = {
  format: "nexis-lumen-workspace", version: 1,
  workspace: { label: "Project", scenePath: "lumen/fluid-1000.nexis-lumen-scene.json" },
  scene: {
    format: "nexis-lumen-scene", version: 1,
    palette: { name: "Sky", colors: ["#102030", "#aabbcc"] },
    scene: { generator: "fluid", seed: 1000, params: { u_scale: 0.8 }, mouseStrength: 0.5 },
  },
};

describe("Lumen workspace handoff", () => {
  it("accepts an embedded scene and keeps its safe relative destination", () => {
    const result = parseLumenWorkspaceHandoff(handoff);
    expect(result.scenePath).toBe("lumen/fluid-1000.nexis-lumen-scene.json");
    expect(result.theme.variants.dark?.colors?.primary).toBe("#aabbcc");
  });

  it("rejects traversal, unsupported versions, and invalid scene values", () => {
    expect(() => parseLumenWorkspaceHandoff({ ...handoff, workspace: { ...handoff.workspace, scenePath: "../secret.json" } })).toThrow();
    expect(() => parseLumenWorkspaceHandoff({ ...handoff, version: 2 })).toThrow();
    expect(() => parseLumenWorkspaceHandoff({ ...handoff, scene: { ...handoff.scene, scene: { ...handoff.scene.scene, mouseStrength: Infinity } } })).toThrow();
  });
});
