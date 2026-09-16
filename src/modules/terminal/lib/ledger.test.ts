import { ledgerStorage } from "@/platform/ledger-storage";
// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  forgetLedgerEntry,
  forgetLedgerSince,
  queryLedger,
  readLedgerOutput,
  recordCommand,
  searchLedgerOutput,
  setLedgerPrivacyResolver,
  setLedgerWorkspaceSource,
  forgetLedgerWorkspace,
  ledgerStats,
  parseRecord,
  pruneLedger,
  workspaceLedgerId,
} from "./ledger";

vi.mock("@/platform/ledger-storage", () => ({
  ledgerStorage: {
    ledgerAppend: vi.fn(),
    ledgerWriteOutput: vi.fn(),
    ledgerReadOutput: vi.fn(),
    ledgerRead: vi.fn(),
    ledgerStats: vi.fn(),
    ledgerQuery: vi.fn(),
    ledgerSearchOutput: vi.fn(),
    ledgerForgetEntry: vi.fn(),
    ledgerForgetSince: vi.fn(),
    ledgerForgetWorkspace: vi.fn(),
    ledgerPrune: vi.fn(),
  },
}));

beforeEach(() => {
  vi.mocked(ledgerStorage.ledgerStats).mockReset();
  vi.mocked(ledgerStorage.ledgerForgetSince).mockReset();
  vi.mocked(ledgerStorage.ledgerForgetWorkspace).mockReset();
  vi.mocked(ledgerStorage.ledgerPrune).mockReset();
  vi.mocked(ledgerStorage.ledgerAppend).mockReset();
  vi.mocked(ledgerStorage.ledgerWriteOutput).mockReset();
  vi.mocked(ledgerStorage.ledgerQuery).mockReset();
  vi.mocked(ledgerStorage.ledgerSearchOutput).mockReset();
  vi.mocked(ledgerStorage.ledgerForgetEntry).mockReset();
  vi.mocked(ledgerStorage.ledgerReadOutput).mockReset();
  setLedgerPrivacyResolver(() => false);
  setLedgerWorkspaceSource(() => "C:/ws");
});

/** The record `ledgerAppend` was called with, parsed back. */
function appended() {
  const calls = vi.mocked(ledgerStorage.ledgerAppend).mock.calls;
  const call = calls[calls.length - 1];
  return call ? parseRecord(call[1]) : null;
}

describe("recordCommand", () => {
  it("redacts the command line and the output before they reach IPC", async () => {
    // The tripwire in pitfall-guards.test.ts asserts the *source* calls
    // redactSensitive; this asserts the bytes that actually leave. A command
    // line is precisely where an API key ends up, and this store is durable.
    await recordCommand({
      leafId: 1,
      workspaceRoot: "C:/ws",
      cwd: "C:/ws",
      argv: "curl -H 'Authorization: Bearer sk-ant-api03-SECRETVALUE12345'",
      exitCode: 0,
      startedAt: 10,
      endedAt: 30,
      output: "OPENAI_API_KEY=sk-proj-ANOTHERSECRET0987654321",
    });

    const record = appended();
    expect(record).not.toBeNull();
    expect(record?.argv).not.toContain("SECRETVALUE12345");
    const blobCalls = vi.mocked(ledgerStorage.ledgerWriteOutput).mock.calls;
    const output = blobCalls[blobCalls.length - 1]?.[2];
    expect(output).toBeDefined();
    expect(output).not.toContain("ANOTHERSECRET0987654321");
  });

  it("computes the duration from the two timestamps", async () => {
    await recordCommand({
      leafId: 1,
      workspaceRoot: "C:/ws",
      cwd: "C:/ws",
      argv: "ls",
      exitCode: 0,
      startedAt: 1_000,
      endedAt: 1_250,
    });
    expect(appended()?.durationMs).toBe(250);
  });

  it("names a blob only when there is output to put in one", async () => {
    await recordCommand({
      leafId: 1,
      workspaceRoot: "C:/ws",
      cwd: "C:/ws",
      argv: "true",
      exitCode: 0,
      startedAt: 1,
      endedAt: 2,
      output: "   \n  ",
    });
    expect(ledgerStorage.ledgerWriteOutput).not.toHaveBeenCalled();
    expect(appended()?.outputId).toBeUndefined();
  });

  /**
   * The OSC 133 handler gates on this too — that is where the decision record
   * puts the gate. This is the second lock on the same door, because the
   * failure it prevents is silent.
   */
  it("records nothing for a private terminal or without a workspace", async () => {
    setLedgerPrivacyResolver(() => true);
    expect(
      await recordCommand({
        leafId: 1,
        workspaceRoot: "C:/ws",
        cwd: "C:/ws",
        argv: "ls",
        exitCode: 0,
        startedAt: 1,
        endedAt: 2,
      }),
    ).toBeNull();

    setLedgerPrivacyResolver(() => false);
    expect(
      await recordCommand({
        leafId: 1,
        workspaceRoot: null,
        cwd: "",
        argv: "ls",
        exitCode: 0,
        startedAt: 1,
        endedAt: 2,
      }),
    ).toBeNull();
    expect(ledgerStorage.ledgerAppend).not.toHaveBeenCalled();
  });

  it("never lets a failed write break the terminal it watches", async () => {
    vi.mocked(ledgerStorage.ledgerAppend).mockRejectedValue(new Error("disk full"));
    await expect(
      recordCommand({
        leafId: 1,
        workspaceRoot: "C:/ws",
        cwd: "C:/ws",
        argv: "ls",
        exitCode: 0,
        startedAt: 1,
        endedAt: 2,
      }),
    ).resolves.toBeNull();
  });
});

describe("workspaceLedgerId", () => {
  it("survives the Rust side's id charset", () => {
    // validate_id in ledger.rs accepts alphanumerics and hyphens, 64 max —
    // an id it rejects is a workspace that can never record anything.
    const id = workspaceLedgerId("C:\\Users\\ryan\\Dev\\Nexis");
    expect(id).toMatch(/^[A-Za-z0-9-]{1,64}$/);
  });

  it("gives one workspace one id across the forms its path takes", () => {
    // Pitfall #23: the same root reaches the frontend as a verbatim prefix,
    // with either separator, and with or without a trailing slash. All four
    // are the same project and must not each grow their own ledger.
    const canonical = workspaceLedgerId("C:/Users/ryan/Dev/Nexis");
    expect(workspaceLedgerId("//?/C:/Users/ryan/Dev/Nexis")).toBe(canonical);
    expect(workspaceLedgerId("C:\\Users\\ryan\\Dev\\Nexis")).toBe(canonical);
    expect(workspaceLedgerId("C:/Users/ryan/Dev/Nexis/")).toBe(canonical);
    expect(workspaceLedgerId("C:/Users/ryan/Dev/NEXIS")).toBe(canonical);
  });

  it("keeps unrelated projects apart", () => {
    expect(workspaceLedgerId("C:/a/one")).not.toBe(workspaceLedgerId("C:/a/two"));
  });
});

describe("retention and forgetting", () => {
  it("converts the output cap from MB to bytes for the Rust side", () => {
    // ledger_prune takes bytes; the preference is in MB because that is what
    // a person picks. Getting this conversion wrong caps a 256 MB budget at
    // 256 bytes, which silently deletes every blob on the next open.
    void pruneLedger("C:/ws", {
      maxRecords: 50_000,
      maxAgeDays: 90,
      maxOutputMb: 256,
    });
    expect(ledgerStorage.ledgerPrune).toHaveBeenCalledWith(
      expect.objectContaining({ maxBlobBytes: 256 * 1024 * 1024 }),
    );
  });

  it("does nothing at all without a workspace", async () => {
    await pruneLedger(null, { maxRecords: 1, maxAgeDays: 1, maxOutputMb: 1 });
    expect(await ledgerStats(null)).toBeNull();
    expect(await forgetLedgerSince(null, 0)).toBe(0);
    await forgetLedgerWorkspace(null);
    expect(ledgerStorage.ledgerPrune).not.toHaveBeenCalled();
    expect(ledgerStorage.ledgerStats).not.toHaveBeenCalled();
    expect(ledgerStorage.ledgerForgetSince).not.toHaveBeenCalled();
    expect(ledgerStorage.ledgerForgetWorkspace).not.toHaveBeenCalled();
  });

  it("never lets housekeeping break opening a workspace", async () => {
    vi.mocked(ledgerStorage.ledgerPrune).mockRejectedValue(new Error("disk full"));
    vi.mocked(ledgerStorage.ledgerStats).mockRejectedValue(new Error("nope"));
    await expect(
      pruneLedger("C:/ws", { maxRecords: 1, maxAgeDays: 1, maxOutputMb: 1 }),
    ).resolves.toBeUndefined();
    await expect(ledgerStats("C:/ws")).resolves.toBeNull();
  });

  /**
   * A forget gesture that reports nothing is indistinguishable from one that
   * silently failed, so the count is propagated rather than swallowed — and
   * unlike prune, a failure here must reach the user.
   */
  it("reports how many records a windowed forget removed", async () => {
    vi.mocked(ledgerStorage.ledgerForgetSince).mockResolvedValue(7);
    await expect(forgetLedgerSince("C:/ws", 1000)).resolves.toBe(7);

    vi.mocked(ledgerStorage.ledgerForgetSince).mockRejectedValue(new Error("locked"));
    await expect(forgetLedgerSince("C:/ws", 1000)).rejects.toThrow("locked");
  });
});

describe("reading", () => {
  const line = JSON.stringify({
    id: "cmd-1",
    startedAt: 1,
    endedAt: 2,
    durationMs: 1,
    cwd: "/x",
    argv: "cargo build",
    exitCode: 0,
  });

  it("fills in the query defaults the Rust side expects", async () => {
    vi.mocked(ledgerStorage.ledgerQuery).mockResolvedValue([]);
    await queryLedger("C:/ws", { limit: 10 });
    expect(ledgerStorage.ledgerQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        query: { query: "", exit: null, dedupe: false, limit: 10 },
      }),
    );
  });

  /**
   * A line the reader cannot parse is dropped rather than surfaced. A blank
   * row in a history list is worse than one fewer row.
   */
  it("drops unparsable lines instead of rendering blanks", async () => {
    vi.mocked(ledgerStorage.ledgerQuery).mockResolvedValue([line, "corrupt", "{}"]);
    const records = await queryLedger("C:/ws", { limit: 10 });
    expect(records).toHaveLength(1);
    expect(records[0].argv).toBe("cargo build");
  });

  it("pairs each output hit with its record, and skips a hit it cannot", async () => {
    vi.mocked(ledgerStorage.ledgerSearchOutput).mockResolvedValue([
      { line, snippet: "error: boom", matches: 3 },
      { line: "corrupt", snippet: "error: orphan", matches: 1 },
    ]);
    const hits = await searchLedgerOutput("C:/ws", "error", 10);
    expect(hits).toHaveLength(1);
    expect(hits[0].record.argv).toBe("cargo build");
    expect(hits[0].matches).toBe(3);
  });

  it("does not send an empty output search to the backend", async () => {
    expect(await searchLedgerOutput("C:/ws", "   ", 10)).toEqual([]);
    expect(ledgerStorage.ledgerSearchOutput).not.toHaveBeenCalled();
  });

  it("treats a missing output blob as absent rather than as an error", async () => {
    vi.mocked(ledgerStorage.ledgerReadOutput).mockRejectedValue(new Error("gone"));
    await expect(readLedgerOutput("C:/ws", "out-1")).resolves.toBeNull();
  });

  it("does nothing when there is no workspace to read or forget in", async () => {
    expect(await queryLedger(null, { limit: 10 })).toEqual([]);
    expect(await searchLedgerOutput(null, "x", 10)).toEqual([]);
    expect(await readLedgerOutput(null, "out-1")).toBeNull();
    await forgetLedgerEntry(null, "cmd-1");
    expect(ledgerStorage.ledgerQuery).not.toHaveBeenCalled();
    expect(ledgerStorage.ledgerForgetEntry).not.toHaveBeenCalled();
  });

  it("forgets one entry by id", async () => {
    vi.mocked(ledgerStorage.ledgerForgetEntry).mockResolvedValue(undefined);
    await forgetLedgerEntry("C:/ws", "cmd-1");
    expect(ledgerStorage.ledgerForgetEntry).toHaveBeenCalledWith(
      expect.stringMatching(/^ws-/),
      "cmd-1",
    );
  });
});

describe("parseRecord", () => {
  it("accepts a well-formed record and rejects everything else", () => {
    const line = JSON.stringify({
      id: "cmd-1",
      startedAt: 1,
      endedAt: 2,
      durationMs: 1,
      cwd: "/x",
      argv: "ls",
      exitCode: 0,
    });
    expect(parseRecord(line)?.argv).toBe("ls");
    expect(parseRecord("not json")).toBeNull();
    expect(parseRecord("[1,2,3]")).toBeNull();
    // A line missing a field every reader depends on is not a record.
    expect(parseRecord('{"id":"a"}')).toBeNull();
  });
});
