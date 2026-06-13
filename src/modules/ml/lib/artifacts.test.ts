// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseConfusionMatrix, readConfusionMatrix } from "./artifacts";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@/modules/workspace", () => ({
  currentWorkspaceEnv: () => ({ kind: "local" }),
}));

describe("parseConfusionMatrix", () => {
  it("accepts a well-formed matrix and coerces labels to strings", () => {
    const cm = parseConfusionMatrix({
      labels: [0, 1],
      matrix: [
        [5, 1],
        [2, 4],
      ],
    });
    expect(cm).toEqual({
      labels: ["0", "1"],
      matrix: [
        [5, 1],
        [2, 4],
      ],
    });
  });

  it("rejects a ragged matrix (row length must equal label count)", () => {
    expect(
      parseConfusionMatrix({ labels: ["a", "b"], matrix: [[1, 2], [3]] }),
    ).toBeNull();
  });

  it("rejects a matrix whose row count differs from the label count", () => {
    expect(
      parseConfusionMatrix({ labels: ["a", "b"], matrix: [[1, 2]] }),
    ).toBeNull();
  });

  it("rejects non-numeric / non-finite cells", () => {
    expect(
      parseConfusionMatrix({ labels: ["a"], matrix: [["x"]] }),
    ).toBeNull();
    expect(
      parseConfusionMatrix({ labels: ["a"], matrix: [[Number.NaN]] }),
    ).toBeNull();
  });

  it("rejects empty labels and non-object input", () => {
    expect(parseConfusionMatrix({ labels: [], matrix: [] })).toBeNull();
    expect(parseConfusionMatrix(null)).toBeNull();
    expect(parseConfusionMatrix("not a matrix")).toBeNull();
    expect(parseConfusionMatrix({ labels: ["a"] })).toBeNull();
  });
});

describe("readConfusionMatrix", () => {
  let invokeMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const core = await import("@tauri-apps/api/core");
    invokeMock = vi.mocked(core.invoke);
    invokeMock.mockReset();
  });

  it("reads + parses a text artifact", async () => {
    invokeMock.mockResolvedValue({
      kind: "text",
      content: JSON.stringify({ labels: ["a", "b"], matrix: [[1, 0], [0, 1]] }),
      size: 40,
    });
    await expect(readConfusionMatrix("/x/cm.json")).resolves.toEqual({
      labels: ["a", "b"],
      matrix: [[1, 0], [0, 1]],
    });
  });

  it("returns null for a non-text result", async () => {
    invokeMock.mockResolvedValue({ kind: "binary", size: 10 });
    await expect(readConfusionMatrix("/x/cm.json")).resolves.toBeNull();
  });

  it("returns null on malformed JSON instead of throwing", async () => {
    invokeMock.mockResolvedValue({ kind: "text", content: "{ not json", size: 9 });
    await expect(readConfusionMatrix("/x/cm.json")).resolves.toBeNull();
  });

  it("returns null when the IPC call fails", async () => {
    invokeMock.mockRejectedValue(new Error("missing"));
    await expect(readConfusionMatrix("/x/cm.json")).resolves.toBeNull();
  });
});
