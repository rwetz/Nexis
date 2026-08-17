// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { describe, expect, it } from "vitest";

import { LOCAL_WORKSPACE, workspaceEnvForPath, type WorkspaceEnv } from "./env";

const WSL: WorkspaceEnv = { kind: "wsl", distro: "Ubuntu" };

describe("workspaceEnvForPath", () => {
  it("reads the distro out of a \\\\wsl.localhost UNC path", () => {
    expect(
      workspaceEnvForPath("\\\\wsl.localhost\\Ubuntu\\home\\ryan\\dev", LOCAL_WORKSPACE),
    ).toEqual({ kind: "wsl", distro: "Ubuntu" });
  });

  it("reads the distro out of the legacy \\\\wsl$ UNC path", () => {
    expect(
      workspaceEnvForPath("\\\\wsl$\\Debian\\home\\ryan", LOCAL_WORKSPACE),
    ).toEqual({ kind: "wsl", distro: "Debian" });
  });

  it("accepts forward slashes in the UNC form", () => {
    // Several call sites normalise backslashes to '/' before this runs.
    expect(
      workspaceEnvForPath("//wsl.localhost/Ubuntu-22.04/home/ryan", LOCAL_WORKSPACE),
    ).toEqual({ kind: "wsl", distro: "Ubuntu-22.04" });
  });

  it("switches back to local when moving from WSL to a drive-letter path", () => {
    // The regression that mattered: leaving the env on WSL here would send
    // wsl.exe at a Windows path.
    expect(workspaceEnvForPath("C:\\Users\\ryan\\dev", WSL)).toEqual(LOCAL_WORKSPACE);
    expect(workspaceEnvForPath("D:/projects", WSL)).toEqual(LOCAL_WORKSPACE);
  });

  it("keeps the current distro for a POSIX path while already in WSL", () => {
    // /home/ryan/dev names no distro, so the only sane answer is the one we
    // are already in — this is the Recent Workspaces case for a WSL repo.
    expect(workspaceEnvForPath("/home/ryan/dev/scratch", WSL)).toEqual(WSL);
  });

  it("treats a POSIX path as local when not in WSL (Linux/macOS hosts)", () => {
    expect(workspaceEnvForPath("/home/ryan/dev/Nexis", LOCAL_WORKSPACE)).toEqual(
      LOCAL_WORKSPACE,
    );
  });

  it("does not mistake a directory merely named 'wsl' for a distro root", () => {
    expect(workspaceEnvForPath("C:\\wsl\\notadistro", LOCAL_WORKSPACE)).toEqual(
      LOCAL_WORKSPACE,
    );
  });
});
