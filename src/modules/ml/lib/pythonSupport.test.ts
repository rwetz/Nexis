// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { describe, expect, it } from "vitest";
import {
  parsePythonMinor,
  torchSupport,
  torchSupportWarning,
  TORCH_MAX_MINOR,
  TORCH_MIN_MINOR,
} from "./pythonSupport";

describe("parsePythonMinor", () => {
  it("reads every form Python reports itself as", () => {
    // pyvenv.cfg
    expect(parsePythonMinor("3.12.1")).toBe(12);
    // `python --version`
    expect(parsePythonMinor("Python 3.14.0")).toBe(14);
    // pre-release
    expect(parsePythonMinor("3.13.0rc1")).toBe(13);
    expect(parsePythonMinor("Python 3.9")).toBe(9);
  });

  it("declines to guess outside CPython 3.x", () => {
    expect(parsePythonMinor("Python 2.7.18")).toBeNull();
    expect(parsePythonMinor("4.0.0")).toBeNull();
    expect(parsePythonMinor("not a version")).toBeNull();
    expect(parsePythonMinor(null)).toBeNull();
    expect(parsePythonMinor(undefined)).toBeNull();
    expect(parsePythonMinor("")).toBeNull();
  });
});

describe("torchSupport", () => {
  it("brackets the supported range", () => {
    expect(torchSupport(`3.${TORCH_MIN_MINOR}.0`)).toBe("ok");
    expect(torchSupport(`3.${TORCH_MAX_MINOR}.2`)).toBe("ok");
    expect(torchSupport(`3.${TORCH_MAX_MINOR + 1}.0`)).toBe("too-new");
    expect(torchSupport(`3.${TORCH_MIN_MINOR - 1}.0`)).toBe("too-old");
  });

  it("is 'unknown' rather than wrong when the version can't be read", () => {
    expect(torchSupport(null)).toBe("unknown");
    expect(torchSupport("Python 2.7.18")).toBe("unknown");
  });
});

describe("torchSupportWarning", () => {
  // The whole point of the check: a too-new interpreter fails only after
  // pip has downloaded, so the warning has to arrive before the ~3 GB does.
  it("warns for a too-new interpreter and names the escape hatch", () => {
    const warning = torchSupportWarning(`Python 3.${TORCH_MAX_MINOR + 1}.0`);
    expect(warning).toMatch(/no wheels/i);
    expect(warning).toMatch(/standalone engine/i);
  });

  it("stays silent for a supported or unreadable version", () => {
    expect(torchSupportWarning(`3.${TORCH_MAX_MINOR}.0`)).toBeNull();
    expect(torchSupportWarning(null)).toBeNull();
  });
});
