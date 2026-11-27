//! Repo hygiene: the leftovers a repo accumulates when nobody is looking.
//!
//! The working-tree half of "does this repo need attention" (staged, modified,
//! untracked, conflicted) is already in `scan.rs`. This module adds the half a
//! status pass cannot see: local branches that have outlived their purpose,
//! linked worktrees still hanging around, and which GitHub repo the origin
//! points at so the open-PR count (`prs.rs`) can be joined back on.
//!
//! Everything here is a read of refs and config through libgit2. Nothing is
//! fetched, so "gone" means "gone as of the last fetch", exactly what
//! `git branch -vv` would say.

use git2::{BranchType, Oid, Repository};
use serde::Serialize;

/// One branch only ever lands in one bucket, in this priority order: merged
/// beats gone beats inactive. A squash-merged PR whose remote branch was
/// deleted is "gone" but not "merged" (the squash commit is not the branch
/// tip), which is why both exist.
#[derive(Debug, Clone, Serialize, Default, PartialEq, Eq)]
pub struct RepoHealth {
    /// The branch the others are measured against: `origin/HEAD` if the clone
    /// recorded one, otherwise a local `main` or `master`. `None` means merged
    /// detection was skipped, not that nothing was merged.
    pub default_branch: Option<String>,
    /// Local branches whose tip is already reachable from the default branch.
    pub merged_branches: Vec<String>,
    /// Local branches whose configured upstream no longer exists (`[gone]`).
    pub gone_branches: Vec<String>,
    /// Local branches with no commit in `stale_days`, not already counted above.
    pub inactive_branches: Vec<String>,
    /// Linked worktrees (`git worktree list` minus the main one).
    pub worktrees: usize,
    /// `owner/name` of the github.com repo the origin remote points at.
    pub github: Option<String>,
}

/// Classify every local branch, count worktrees, find the GitHub slug.
///
/// `now` is a parameter so the inactivity cutoff is testable without waiting
/// a month.
pub fn repo_health(repo: &Repository, now: i64, stale_days: u32) -> RepoHealth {
    let mut out = RepoHealth {
        worktrees: repo.worktrees().map(|w| w.len()).unwrap_or(0),
        github: github_slug(repo),
        ..Default::default()
    };

    let base = default_base(repo);
    out.default_branch = base.as_ref().map(|b| b.name.clone());

    let head = repo
        .head()
        .ok()
        .filter(|h| h.is_branch())
        .and_then(|h| h.shorthand().ok().map(str::to_string));
    let cutoff = now - i64::from(stale_days) * 86_400;

    let Ok(branches) = repo.branches(Some(BranchType::Local)) else {
        return out;
    };
    for (branch, _) in branches.flatten() {
        let Ok(Some(name)) = branch.name() else {
            continue;
        };
        let name = name.to_string();
        // The default branch is the yardstick, and the checked-out branch is
        // where you are standing: neither is a cleanup candidate.
        if Some(&name) == out.default_branch.as_ref() || Some(&name) == head.as_ref() {
            continue;
        }
        let Ok(tip) = branch.get().peel_to_commit() else {
            continue;
        };

        if let Some(base) = &base {
            if base.tips.iter().any(|&b| is_merged(repo, tip.id(), b)) {
                out.merged_branches.push(name);
                continue;
            }
        }
        if upstream_gone(repo, &branch) {
            out.gone_branches.push(name);
            continue;
        }
        if tip.time().seconds() < cutoff {
            out.inactive_branches.push(name);
        }
    }
    out
}

struct Base {
    name: String,
    /// The local branch and its remote-tracking counterpart, whichever exist.
    /// A branch merged on GitHub shows up in `origin/main` before the local
    /// `main` is pulled, so both count.
    tips: Vec<Oid>,
}

fn default_base(repo: &Repository) -> Option<Base> {
    let from_origin = repo
        .find_reference("refs/remotes/origin/HEAD")
        .ok()
        .and_then(|r| r.symbolic_target().ok().flatten().map(str::to_string))
        .and_then(|t| t.strip_prefix("refs/remotes/origin/").map(str::to_string));

    let name = from_origin.or_else(|| {
        ["main", "master"]
            .into_iter()
            .find(|n| repo.find_branch(n, BranchType::Local).is_ok())
            .map(str::to_string)
    })?;

    let tips: Vec<Oid> = [
        format!("refs/heads/{name}"),
        format!("refs/remotes/origin/{name}"),
    ]
    .iter()
    .filter_map(|r| repo.refname_to_id(r).ok())
    .collect();
    if tips.is_empty() {
        return None;
    }
    Some(Base { name, tips })
}

fn is_merged(repo: &Repository, tip: Oid, base: Oid) -> bool {
    tip == base || repo.graph_descendant_of(base, tip).unwrap_or(false)
}

/// Upstream is configured but its ref is not there any more. A branch that
/// never had an upstream is not gone, it is just local.
fn upstream_gone(repo: &Repository, branch: &git2::Branch) -> bool {
    let Ok(refname) = branch.get().name() else {
        return false;
    };
    let Ok(upstream) = repo.branch_upstream_name(refname) else {
        return false;
    };
    let Ok(upstream) = upstream.as_str() else {
        return false;
    };
    repo.find_reference(upstream).is_err()
}

/// `owner/name` for the origin remote (or, failing that, the first remote)
/// when it points at github.com.
fn github_slug(repo: &Repository) -> Option<String> {
    let names = repo.remotes().ok()?;
    let mut ordered: Vec<&str> = names.iter().flatten().flatten().collect();
    ordered.sort_by_key(|n| *n != "origin");
    ordered.into_iter().find_map(|n| {
        let remote = repo.find_remote(n).ok()?;
        parse_github_url(remote.url().ok()?)
    })
}

/// Accepts the three spellings GitHub hands out: `https://github.com/o/r(.git)`,
/// `git@github.com:o/r(.git)` and `ssh://git@github.com/o/r(.git)`.
///
/// The result is later interpolated into a GraphQL query, so both halves are
/// restricted to the characters GitHub itself allows in owner and repo names.
pub fn parse_github_url(url: &str) -> Option<String> {
    let url = url.trim();
    let rest = url
        .strip_prefix("https://github.com/")
        .or_else(|| url.strip_prefix("http://github.com/"))
        .or_else(|| url.strip_prefix("git@github.com:"))
        .or_else(|| url.strip_prefix("ssh://git@github.com/"))
        .or_else(|| url.strip_prefix("git://github.com/"))?;
    let rest = rest.trim_end_matches('/');
    let rest = rest.strip_suffix(".git").unwrap_or(rest);
    let (owner, name) = rest.split_once('/')?;
    (valid_slug_part(owner) && valid_slug_part(name)).then(|| format!("{owner}/{name}"))
}

pub fn valid_slug_part(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 100
        && s.chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::modules::atlas::testutil::{git, git_at, temp_repo};
    use std::path::Path;

    const DAY: i64 = 86_400;
    /// 2026-11-01T00:00:00Z, the "now" every test measures inactivity from.
    const NOW: i64 = 1_793_491_200;

    fn commit(dir: &Path, file: &str, msg: &str) {
        std::fs::write(dir.join(file), msg).unwrap();
        git(dir, &["add", file]);
        git(dir, &["commit", "-m", msg]);
    }

    fn open(dir: &Path) -> Repository {
        Repository::open(dir).unwrap()
    }

    /// A repo with a bare `origin`, `main` pushed and `origin/HEAD` recorded,
    /// the shape a real clone has.
    fn cloned_shape(tag: &str) -> (std::path::PathBuf, std::path::PathBuf) {
        let remote = temp_repo(&format!("{tag}-remote"));
        git(&remote, &["init", "--bare", "-b", "main"]);
        let dir = temp_repo(tag);
        git(&dir, &["init", "-b", "main"]);
        commit(&dir, "a.txt", "root");
        git(&dir, &["remote", "add", "origin", remote.to_str().unwrap()]);
        git(&dir, &["push", "-u", "origin", "main"]);
        git(&dir, &["remote", "set-head", "origin", "main"]);
        (dir, remote)
    }

    #[test]
    fn classifies_merged_gone_and_inactive_branches() {
        let (dir, remote) = cloned_shape("health-classify");

        // merged: has its own commit, then merged into main with a merge commit
        git(&dir, &["switch", "-c", "feat/done"]);
        commit(&dir, "done.txt", "done");
        git(&dir, &["switch", "main"]);
        git(&dir, &["merge", "--no-ff", "feat/done", "-m", "merge done"]);
        git(&dir, &["push", "origin", "main"]);

        // gone: pushed with an upstream, then the remote branch deleted (what
        // GitHub's "delete branch" after a squash merge leaves behind)
        git(&dir, &["switch", "-c", "feat/squashed"]);
        commit(&dir, "sq.txt", "squashed");
        git(&dir, &["push", "-u", "origin", "feat/squashed"]);
        git(&dir, &["push", "origin", "--delete", "feat/squashed"]);

        // inactive: unmerged, no upstream, last commit 90 days before NOW
        git(&dir, &["switch", "main"]);
        git(&dir, &["switch", "-c", "spike/old"]);
        std::fs::write(dir.join("old.txt"), "old").unwrap();
        git(&dir, &["add", "old.txt"]);
        git_at(&dir, &["commit", "-m", "old"], NOW - 90 * DAY);

        // active: unmerged, no upstream, committed yesterday -- not stale
        git(&dir, &["switch", "main"]);
        git(&dir, &["switch", "-c", "wip/fresh"]);
        std::fs::write(dir.join("fresh.txt"), "fresh").unwrap();
        git(&dir, &["add", "fresh.txt"]);
        git_at(&dir, &["commit", "-m", "fresh"], NOW - DAY);

        git(&dir, &["switch", "main"]);

        let h = repo_health(&open(&dir), NOW, 30);
        assert_eq!(h.default_branch.as_deref(), Some("main"));
        assert_eq!(h.merged_branches, vec!["feat/done"]);
        assert_eq!(h.gone_branches, vec!["feat/squashed"]);
        assert_eq!(h.inactive_branches, vec!["spike/old"]);
        assert_eq!(h.worktrees, 0);

        // A longer window makes the 90-day branch fresh again.
        let lenient = repo_health(&open(&dir), NOW, 120);
        assert!(lenient.inactive_branches.is_empty());

        let _ = std::fs::remove_dir_all(&dir);
        let _ = std::fs::remove_dir_all(&remote);
    }

    #[test]
    fn merged_on_the_remote_counts_before_local_main_is_pulled() {
        let (dir, remote) = cloned_shape("health-remote-merge");
        git(&dir, &["switch", "-c", "feat/pr"]);
        commit(&dir, "pr.txt", "pr");
        // Simulate GitHub merging the PR: origin/main advances to the branch
        // tip, the local main does not move.
        git(&dir, &["push", "origin", "feat/pr:main"]);
        git(&dir, &["fetch", "origin"]);
        git(&dir, &["switch", "main"]);

        let h = repo_health(&open(&dir), NOW, 30);
        assert_eq!(h.merged_branches, vec!["feat/pr"]);

        let _ = std::fs::remove_dir_all(&dir);
        let _ = std::fs::remove_dir_all(&remote);
    }

    #[test]
    fn checked_out_and_default_branches_are_never_stale() {
        let dir = temp_repo("health-head");
        git(&dir, &["init", "-b", "main"]);
        std::fs::write(dir.join("a.txt"), "a").unwrap();
        git(&dir, &["add", "a.txt"]);
        git_at(&dir, &["commit", "-m", "ancient"], NOW - 400 * DAY);
        // Same tip as main, so it would count as merged if it were not HEAD.
        git(&dir, &["switch", "-c", "current"]);

        let h = repo_health(&open(&dir), NOW, 30);
        // No origin: falls back to the local main.
        assert_eq!(h.default_branch.as_deref(), Some("main"));
        assert!(h.merged_branches.is_empty(), "{h:?}");
        assert!(h.inactive_branches.is_empty(), "{h:?}");
        assert!(h.gone_branches.is_empty(), "{h:?}");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn without_a_default_branch_only_merged_detection_is_skipped() {
        let dir = temp_repo("health-nodefault");
        git(&dir, &["init", "-b", "trunk"]);
        std::fs::write(dir.join("a.txt"), "a").unwrap();
        git(&dir, &["add", "a.txt"]);
        git_at(&dir, &["commit", "-m", "old"], NOW - 60 * DAY);
        git(&dir, &["branch", "side"]);

        let h = repo_health(&open(&dir), NOW, 30);
        assert_eq!(h.default_branch, None);
        assert!(h.merged_branches.is_empty());
        assert_eq!(h.inactive_branches, vec!["side"]);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn counts_linked_worktrees() {
        let dir = temp_repo("health-wt");
        git(&dir, &["init", "-b", "main"]);
        commit(&dir, "a.txt", "a");
        let wt = temp_repo("health-wt-linked");
        let _ = std::fs::remove_dir_all(&wt);
        git(
            &dir,
            &["worktree", "add", "-b", "side", wt.to_str().unwrap()],
        );

        let h = repo_health(&open(&dir), NOW, 30);
        assert_eq!(h.worktrees, 1);
        // The branch checked out in the worktree is level with main: it is a
        // merged branch like any other, which is the point -- it is still
        // something to clean up.
        assert_eq!(h.merged_branches, vec!["side"]);

        // Opened from inside the linked worktree, the count is the same.
        assert_eq!(repo_health(&open(&wt), NOW, 30).worktrees, 1);

        let _ = std::fs::remove_dir_all(&wt);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn finds_the_github_slug_preferring_origin() {
        let dir = temp_repo("health-slug");
        git(&dir, &["init", "-b", "main"]);
        git(
            &dir,
            &["remote", "add", "fork", "git@github.com:someone/fork.git"],
        );
        git(
            &dir,
            &[
                "remote",
                "add",
                "origin",
                "https://github.com/rwetz/nexis.git",
            ],
        );
        assert_eq!(
            repo_health(&open(&dir), NOW, 30).github.as_deref(),
            Some("rwetz/nexis")
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn parses_github_urls_and_rejects_everything_else() {
        for (url, want) in [
            ("https://github.com/rwetz/Nexis.git", Some("rwetz/Nexis")),
            ("https://github.com/rwetz/Nexis", Some("rwetz/Nexis")),
            ("https://github.com/rwetz/Nexis/", Some("rwetz/Nexis")),
            (
                "git@github.com:rwetz/nexis-atlas.git",
                Some("rwetz/nexis-atlas"),
            ),
            ("ssh://git@github.com/o/r.js.git", Some("o/r.js")),
            ("https://gitlab.com/o/r.git", None),
            ("https://github.example.com/o/r.git", None),
            ("https://github.com/o", None),
            // Anything that could break out of a GraphQL string literal.
            ("https://github.com/o/r\"){x}", None),
            ("https://github.com/o/r/extra", None),
        ] {
            assert_eq!(parse_github_url(url).as_deref(), want, "{url}");
        }
    }
}
