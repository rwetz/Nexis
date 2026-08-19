// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

import {
  EXTERNAL_TOOLS,
  currentPlatform,
  installHint,
  knownToolIds,
  toolById,
  type Platform,
} from "./externalTools";
import {
  noteGitErrorIfMissing,
  reportMissingTool,
  useMissingTools,
  visibleMissingTools,
  type ProbeWorkspace,
} from "./missingTools";

const PLATFORMS: Platform[] = ["linux", "macos", "windows"];

describe("the degradation matrix", () => {
  it("covers every language server Nexis can try to start", async () => {
    // The whole point of the feature is coverage. Adding a server without an
    // install hint would silently reintroduce the silent-no-op this replaced,
    // so that failure belongs here rather than in a bug report.
    const { LANGUAGE_SERVERS } = await import("@/modules/lsp/languages");
    for (const id of Object.keys(LANGUAGE_SERVERS)) {
      expect(toolById(id), `no install hint for language server "${id}"`).not.toBeNull();
    }
  });

  it("matches each language server's binary name", async () => {
    // The notice names the binary the user must end up with; if these drift,
    // it names the wrong one.
    const { LANGUAGE_SERVERS } = await import("@/modules/lsp/languages");
    for (const [id, config] of Object.entries(LANGUAGE_SERVERS)) {
      const tool = toolById(id);
      if (!tool) continue; // covered by the test above
      expect(tool.binary, `binary mismatch for "${id}"`).toBe(config.cmd);
    }
  });

  it("gives every tool a name, a binary, and a description of what it enables", () => {
    for (const id of knownToolIds()) {
      const tool = EXTERNAL_TOOLS[id];
      expect(tool.id, `${id}: id must match its key`).toBe(id);
      expect(tool.name.trim().length, `${id}: needs a name`).toBeGreaterThan(0);
      expect(tool.binary.trim().length, `${id}: needs a binary`).toBeGreaterThan(0);
      // "what stops working" is the part that makes the notice actionable.
      expect(tool.enables.trim().length, `${id}: needs an 'enables'`).toBeGreaterThan(10);
      // Which machine the refresh must re-probe on. Getting this wrong
      // answers for a machine the tool never runs on (pitfall #20).
      expect(["host", "workspace"], `${id}: needs a runsIn`).toContain(tool.runsIn);
    }
  });

  it("offers an install command or a docs URL on every platform", () => {
    for (const id of knownToolIds()) {
      const tool = EXTERNAL_TOOLS[id];
      for (const platform of PLATFORMS) {
        const actionable = installHint(tool, platform) !== null || !!tool.docsUrl;
        expect(actionable, `${id}: nothing actionable on ${platform}`).toBe(true);
      }
    }
  });
});

describe("installHint", () => {
  it("returns the platform-specific command", () => {
    const git = EXTERNAL_TOOLS.git;
    expect(installHint(git, "windows")).toContain("winget");
    expect(installHint(git, "macos")).toContain("brew");
  });
});

describe("currentPlatform", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("defaults to linux when the user agent says nothing useful", () => {
    // Must not throw in a non-browser environment — it only picks which
    // command to display, so a wrong guess is cosmetic, but a throw here
    // would take down the status bar.
    expect(PLATFORMS).toContain(currentPlatform());
  });

  it("detects windows and macos from the user agent", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Windows NT 10.0)" });
    expect(currentPlatform()).toBe("windows");
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)" });
    expect(currentPlatform()).toBe("macos");
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (X11; Linux x86_64)" });
    expect(currentPlatform()).toBe("linux");
  });

  it("returns null from installHint when a platform has no command", () => {
    const docsOnly = {
      ...EXTERNAL_TOOLS.git,
      install: { linux: "apt install git" },
    };
    expect(installHint(docsOnly, "windows")).toBeNull();
    expect(installHint(docsOnly, "linux")).toBe("apt install git");
  });
});

describe("missing-tools store", () => {
  beforeEach(() => {
    useMissingTools.setState({ missing: [], dismissed: [] });
  });

  it("records a missing tool once, not per attempt", () => {
    // Every keystroke can retry an LSP session; the notice must not stack.
    reportMissingTool("rust-analyzer");
    reportMissingTool("rust-analyzer");
    expect(useMissingTools.getState().missing).toEqual(["rust-analyzer"]);
  });

  it("ignores ids the matrix does not describe", () => {
    // A bare id with no install hint is worse than saying nothing.
    reportMissingTool("some-unknown-binary");
    expect(useMissingTools.getState().missing).toEqual([]);
  });

  it("clears a tool once it starts working", () => {
    reportMissingTool("gopls");
    useMissingTools.getState().clearMissing("gopls");
    expect(useMissingTools.getState().missing).toEqual([]);
  });

  it("hides a dismissed tool without forgetting it is missing", () => {
    reportMissingTool("gopls");
    useMissingTools.getState().dismiss("gopls");
    const { missing, dismissed } = useMissingTools.getState();
    expect(missing).toEqual(["gopls"]);
    expect(visibleMissingTools(missing, dismissed)).toEqual([]);
  });

  it("resolves visible tools to their matrix entries in report order", () => {
    reportMissingTool("gopls");
    reportMissingTool("rust-analyzer");
    const { missing, dismissed } = useMissingTools.getState();
    expect(visibleMissingTools(missing, dismissed).map((t) => t.id)).toEqual([
      "gopls",
      "rust-analyzer",
    ]);
  });

  it("returns a stable empty list when nothing is missing", () => {
    expect(visibleMissingTools([], [])).toEqual([]);
  });
});

describe("noteGitErrorIfMissing", () => {
  beforeEach(() => {
    useMissingTools.setState({ missing: [], dismissed: [] });
  });

  it("recognises the Rust side's git-unavailable message", () => {
    // Pinned to the exact wording in src-tauri/src/modules/git/errors.rs
    // (GitError::NotInstalled). If that message changes, this fails — which
    // is the point, since the match is the only thing linking them.
    noteGitErrorIfMissing("git is not available on PATH. Install Git and retry.");
    expect(useMissingTools.getState().missing).toEqual(["git"]);
  });

  it("ignores ordinary git errors", () => {
    // A real repo error must not claim git is uninstalled.
    noteGitErrorIfMissing("fatal: not a git repository");
    noteGitErrorIfMissing("error: pathspec 'nope' did not match any file(s)");
    expect(useMissingTools.getState().missing).toEqual([]);
  });
});


describe("refreshing the missing-tools list", () => {
  const LOCAL: ProbeWorkspace = { kind: "local" };

  beforeEach(() => {
    useMissingTools.setState({ missing: [], dismissed: [], refreshing: false });
    invoke.mockReset();
  });

  it("retires a tool that now resolves and keeps the ones that do not", async () => {
    // The bug this exists for: the user runs the install command, and nothing
    // ever re-checks, so the notice stays up claiming a tool is missing.
    reportMissingTool("gopls");
    reportMissingTool("rust-analyzer");
    invoke.mockResolvedValue(["gopls"]);

    const result = await useMissingTools.getState().refresh(LOCAL);

    expect(result).toEqual({ cleared: ["gopls"], error: null });
    expect(useMissingTools.getState().missing).toEqual(["rust-analyzer"]);
  });

  it("probes each tool in the environment it is actually spawned in", async () => {
    // Language servers spawn host-side whatever the workspace is; git follows
    // the workspace into WSL. One round trip per side, not per tool.
    reportMissingTool("git");
    reportMissingTool("gopls");
    invoke.mockResolvedValue([]);
    const wsl: ProbeWorkspace = { kind: "wsl", distro: "Ubuntu" };

    await useMissingTools.getState().refresh(wsl);

    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke).toHaveBeenCalledWith("tool_probe", {
      binaries: ["gopls"],
      workspace: { kind: "local" },
    });
    expect(invoke).toHaveBeenCalledWith("tool_probe", {
      binaries: ["git"],
      workspace: wsl,
    });
  });

  it("does not probe an environment with nothing to check", async () => {
    reportMissingTool("gopls");
    invoke.mockResolvedValue([]);

    await useMissingTools.getState().refresh(LOCAL);

    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("skips dismissed tools", async () => {
    // Dismissed means the user does not want to hear about it; re-probing it
    // would put it back.
    reportMissingTool("gopls");
    useMissingTools.getState().dismiss("gopls");
    reportMissingTool("clangd");
    invoke.mockResolvedValue([]);

    await useMissingTools.getState().refresh(LOCAL);

    expect(invoke).toHaveBeenCalledWith("tool_probe", {
      binaries: ["clangd"],
      workspace: LOCAL,
    });
  });

  it("reports an IPC failure instead of claiming the tool is still missing", async () => {
    reportMissingTool("gopls");
    invoke.mockRejectedValue("ipc exploded");

    const result = await useMissingTools.getState().refresh(LOCAL);

    expect(result.cleared).toEqual([]);
    expect(result.error).toContain("ipc exploded");
    expect(useMissingTools.getState().missing).toEqual(["gopls"]);
  });

  it("ignores a second press while one check is in flight", async () => {
    reportMissingTool("gopls");
    invoke.mockResolvedValue([]);
    const state = useMissingTools.getState();

    const [first, second] = await Promise.all([
      state.refresh(LOCAL),
      state.refresh(LOCAL),
    ]);

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(first).toEqual({ cleared: [], error: null });
    expect(second).toEqual({ cleared: [], error: null });
  });

  it("lowers the in-flight flag even when the probe throws", async () => {
    reportMissingTool("gopls");
    invoke.mockRejectedValue("boom");

    await useMissingTools.getState().refresh(LOCAL);

    expect(useMissingTools.getState().refreshing).toBe(false);
  });
});
