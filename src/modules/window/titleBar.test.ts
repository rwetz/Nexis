// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CAPABILITY_TOOL_WINDOWS } from "@/capabilities";
import { macTitleBarOptions, TITLE_BAR_HEIGHT, TRAFFIC_LIGHT_X, trafficLightY } from "./titleBar";
import { toolTitleBarHeight } from "./toolWindow";

const root = resolve(__dirname, "../../..");

describe("traffic light placement", () => {
  it("centres the lights on the bar", () => {
    expect(trafficLightY(TITLE_BAR_HEIGHT.standard)).toBe(20);
    expect(trafficLightY(TITLE_BAR_HEIGHT.featured)).toBe(28);
    expect(trafficLightY(TITLE_BAR_HEIGHT.design)).toBe(24);
    expect(TRAFFIC_LIGHT_X).toBeLessThan(80 - 54);
    expect(macTitleBarOptions()).toEqual({ titleBarStyle: "overlay", hiddenTitle: true });
  });

  it("never uses Tauri's trafficLightPosition, which tao keeps applying in fullscreen", () => {
    // tao re-applies it on every drawRect, fullscreen included, and pushes
    // the buttons out of the reveal strip: no way out of fullscreen. The
    // backend places them instead (traffic_lights.rs).
    for (const f of ["src-tauri/tauri.conf.json", "src-tauri/tauri.e2e.conf.json"]) {
      expect(readFileSync(resolve(root, f), "utf8")).not.toMatch(/trafficLightPosition/);
    }
    for (const f of ["src/platform/windows.ts", "src/modules/window/titleBar.ts"]) {
      expect(readFileSync(resolve(root, f), "utf8")).not.toMatch(/trafficLightPosition\s*:/);
    }
  });

  it("centres the main header's lights on its 40pt bar", () => {
    const header = readFileSync(resolve(root, "src/modules/header/Header.tsx"), "utf8");
    expect(header).toMatch(/flex h-10 shrink-0 items-center/);
    expect(header).toMatch(/centreTrafficLights\(TITLE_BAR_HEIGHT\.standard\)/);
  });

  it("knows the header height of every tool window", () => {
    for (const tool of CAPABILITY_TOOL_WINDOWS) {
      const h = toolTitleBarHeight(tool);
      if (tool.page) expect(h).toBe(TITLE_BAR_HEIGHT.design);
      else expect(h).toBe(tool.header === "featured" ? TITLE_BAR_HEIGHT.featured : TITLE_BAR_HEIGHT.standard);
    }
    expect(CAPABILITY_TOOL_WINDOWS.length).toBeGreaterThan(5);
  });

  it("matches the TitleBar height nexis-design draws for Epoch", () => {
    const bar = readFileSync(resolve(root, "node_modules/@nexis/design/src/components/TitleBar.tsx"), "utf8");
    expect(bar).toMatch(/relative flex h-12 shrink-0/);
  });
});
