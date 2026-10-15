import { describe, expect, it } from "vitest";
import { isInside, linkSubject, workspaceFor, type NexisLink } from "./deepLinks";
import { joinPath, parentDir, synapseProjectOfModel } from "./toolLinks";
import { CAPABILITY_TOOL_WINDOWS } from "@/capabilities";
import { TOOL_NAMES } from "@/lib/toolNames";
import { linkFromParams } from "@/windows/epochLinks";

describe("tool links", () => {
  it("finds the Synapse project of an exported model, and nothing else", () => {
    expect(synapseProjectOfModel("C:\\work\\plant-doctor\\model.onnx")).toBe("C:\\work\\plant-doctor");
    expect(synapseProjectOfModel("/work/plant-doctor/model.onnx")).toBe("/work/plant-doctor");
    expect(synapseProjectOfModel("/models/llama.gguf")).toBeNull();
  });

  it("joins and splits paths in the path's own style", () => {
    expect(joinPath("C:\\work\\p", "model.onnx")).toBe("C:\\work\\p\\model.onnx");
    expect(joinPath("C:\\work/p", "model.onnx")).toBe("C:\\work/p/model.onnx");
    expect(joinPath("/work/p/", "model.onnx")).toBe("/work/p/model.onnx");
    expect(parentDir("C:\\work\\p\\model.onnx")).toBe("C:\\work\\p");
  });
});

describe("deep links", () => {
  it("treats separators and drive-letter case as the same path", () => {
    expect(isInside("c:/Work/demo/plant-doctor", "C:\\work\\demo")).toBe(true);
    expect(isInside("C:\\work\\demo", "C:\\work\\demo\\")).toBe(true);
    expect(isInside("C:\\work\\demolition", "C:\\work\\demo")).toBe(false);
    expect(isInside("/home/a/x", null)).toBe(false);
  });

  it("roots a Synapse link at the project's parent", () => {
    const link: NexisLink = { tool: "ml-lab", params: { project: "/w/demo/plant-doctor", run: "r1" } };
    expect(linkSubject(link)).toBe("/w/demo/plant-doctor");
    expect(workspaceFor(link)).toBe("/w/demo");
    const pulse: NexisLink = { tool: "benchmark", params: { model: "/w/demo/plant-doctor/model.onnx" } };
    expect(workspaceFor(pulse)).toBe("/w/demo/plant-doctor");
  });
});

describe("tool names", () => {
  it("are what the launchers show", () => {
    const label = (id: string) => CAPABILITY_TOOL_WINDOWS.find((t) => t.id === id)?.label;
    expect(label("ml-lab")).toBe(TOOL_NAMES.mlLab);
    expect(label("benchmark")).toBe(TOOL_NAMES.benchmark);
    expect(label("svg-studio")).toBe(TOOL_NAMES.svgStudio);
    expect(label("web")).toBe(TOOL_NAMES.web);
    expect(label("documents")).toBe(TOOL_NAMES.documents);
    expect(label("epoch")).toBe(TOOL_NAMES.epoch);
  });

  it("are distinct", () => {
    const names = Object.values(TOOL_NAMES);
    expect(new Set(names).size).toBe(names.length);
  });

  it("open Epoch as its own page, not in the ToolWindowShell", () => {
    expect(CAPABILITY_TOOL_WINDOWS.find((t) => t.id === "epoch")?.page).toBe("epoch.html");
  });
});

describe("Epoch window links", () => {
  it("opens the workspace root only on the open that creates the window", () => {
    expect(linkFromParams({ root: "/w/p" }, true)).toEqual({ project: "/w/p", run: null, dataset: null });
    expect(linkFromParams({ root: "/w/p" }, false)).toBeNull();
  });

  it("always follows an explicit project, run or dataset", () => {
    expect(linkFromParams({ root: "/w", project: "/w/p", run: "r1" }, false)).toEqual({
      project: "/w/p",
      run: "r1",
      dataset: null,
    });
    expect(linkFromParams({ project: "/w/p", dataset: "/w/p/d.csv" }, true)?.dataset).toBe("/w/p/d.csv");
  });
});
