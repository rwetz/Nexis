import { describe, expect, it } from "vitest";
import {
  attentionItems,
  attentionScore,
  displayOrder,
  hygieneCount,
  prsFor,
  staleBranchCount,
  type PrCounts,
  type RepoHealth,
  type RepoSummary,
} from "./types";

const HEALTH: RepoHealth = {
  default_branch: "main",
  merged_branches: [],
  gone_branches: [],
  inactive_branches: [],
  worktrees: 0,
  github: null,
};

function repo(name: string, over: Partial<RepoSummary> = {}, health: Partial<RepoHealth> = {}): RepoSummary {
  return {
    path: `/dev/${name}`,
    name,
    branch: "main",
    detached: false,
    staged: 0,
    unstaged: 0,
    untracked: 0,
    conflicted: 0,
    ahead: 0,
    behind: 0,
    upstream: "origin/main",
    stash_count: 0,
    last_commit: null,
    files: 1,
    dirs: 0,
    bytes: 1,
    langs: [],
    truncated: false,
    error: null,
    ...over,
    health: { ...HEALTH, ...health },
  };
}

const PRS: Record<string, PrCounts> = {
  "rwetz/busy": { total: 5, dependabot: 4, human: 1 },
  "rwetz/quiet": { total: 0, dependabot: 0, human: 0 },
};

describe("repo hygiene", () => {
  it("a clean repo needs nothing", () => {
    expect(attentionItems(repo("clean"), PRS)).toEqual([]);
    expect(hygieneCount(repo("clean"), PRS)).toBe(0);
  });

  it("lists every reason, in a fixed order, with readable labels", () => {
    const r = repo(
      "ateru",
      { unstaged: 2, untracked: 1 },
      {
        merged_branches: ["codex/ui"],
        gone_branches: ["feat/toasts"],
        worktrees: 1,
        github: "rwetz/busy",
      },
    );
    expect(staleBranchCount(r)).toBe(2);
    expect(attentionItems(r, PRS).map((i) => i.label)).toEqual([
      "3 uncommitted files",
      "2 stale branches",
      "1 linked worktree",
      "5 open PRs (4 Dependabot)",
    ]);
    // The map beacon leaves uncommitted files to the coral tint.
    expect(hygieneCount(r, PRS)).toBe(2 + 1 + 5);
  });

  it("PR counts only apply once gh has answered for that repo", () => {
    const unknown = repo("x", {}, { github: "rwetz/unknown" });
    expect(prsFor(unknown, PRS)).toBeNull();
    expect(attentionItems(unknown, PRS)).toEqual([]);
    expect(prsFor(repo("y", {}, { github: "rwetz/quiet" }), PRS)).toEqual(PRS["rwetz/quiet"]);
    expect(attentionItems(repo("y", {}, { github: "rwetz/quiet" }), PRS)).toEqual([]);
  });

  it("a repo that failed to scan is not flagged", () => {
    expect(attentionItems(repo("broken", { error: "nope", unstaged: 3 }), PRS)).toEqual([]);
  });
});

describe("displayOrder for the list", () => {
  const clean = repo("alpha");
  const dirty = repo("bravo", { unstaged: 30 });
  const branches = repo("charlie", { last_commit: { summary: "", author: "", time: 100, hash: "" } }, {
    merged_branches: ["a", "b", "c"],
  });
  const all = [branches, clean, dirty];

  it("defaults to alphabetical, and the map keeps the scan order", () => {
    expect(displayOrder(all, "list").map((r) => r.name)).toEqual(["alpha", "bravo", "charlie"]);
    expect(displayOrder(all, "map")).toBe(all);
  });

  it("the attention filter hides repos with nothing to tidy", () => {
    const rows = displayOrder(all, "list", { sort: "name", attentionOnly: true, prs: {} });
    expect(rows.map((r) => r.name)).toEqual(["bravo", "charlie"]);
  });

  it("sorts by attention, weighting branches over a pile of files", () => {
    // 30 files cap at 20 * 0.5 = 10; three branches are 3 * 2 = 6.
    expect(attentionScore(dirty, {})).toBe(10);
    expect(attentionScore(branches, {})).toBe(6);
    const rows = displayOrder(all, "list", { sort: "attention", attentionOnly: false, prs: {} });
    expect(rows.map((r) => r.name)).toEqual(["bravo", "charlie", "alpha"]);
  });

  it("sorts by changes and by most recent commit, ties by name", () => {
    const view = (sort: "changes" | "recent") => ({ sort, attentionOnly: false, prs: {} });
    expect(displayOrder(all, "list", view("changes")).map((r) => r.name)).toEqual([
      "bravo",
      "alpha",
      "charlie",
    ]);
    expect(displayOrder(all, "list", view("recent")).map((r) => r.name)).toEqual([
      "charlie",
      "alpha",
      "bravo",
    ]);
  });
});
