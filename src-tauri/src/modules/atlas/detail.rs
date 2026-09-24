//! The list view's drill-in: which files are dirty, and what is stashed.
//!
//! Deliberately *not* a second scan. Everything the detail pane shows about
//! the repo as a whole — branch, sync, counts, last commit, stash count —
//! already came back with [`crate::modules::atlas::scan::RepoSummary`], so this returns only
//! the two things a summary cannot carry: the per-file status list and the
//! stash messages. The frontend pairs them with the summary it already holds.

use chrono::{DateTime, FixedOffset};
use git2::{Repository, Status, StatusOptions};
use serde::Serialize;
use std::collections::BTreeMap;
use std::path::Path;

/// Days of history the contribution heatmap walks. 53 weeks is what the graph
/// draws; the walk stops as soon as it passes that, so an ancient repo costs
/// the same as a young one.
const ACTIVITY_DAYS: i64 = 371;
/// Hard ceiling on commits visited, so a repo with a pathological commit rate
/// cannot stall the drill-in.
const ACTIVITY_MAX_COMMITS: usize = 20_000;

#[derive(Debug, Clone, Serialize)]
pub struct FileChange {
    pub path: String,
    /// Single-letter code for the index side (staged): A M D R T
    pub index: Option<String>,
    /// Single-letter code for the worktree side: M D R T ? (untracked)
    pub worktree: Option<String>,
    pub conflicted: bool,
}

/// One day's commit count for the contribution heatmap.
///
/// `date` is `YYYY-MM-DD` in the **committing author's own timezone**, which
/// is what `git log --format=%ad` reports and what a contribution graph is
/// expected to show: the day the person was working, not the UTC day that
/// instant fell in.
#[derive(Debug, Clone, Serialize)]
pub struct ActivityDay {
    pub date: String,
    pub count: u32,
}

#[derive(Debug, Clone, Serialize)]
pub struct RepoDetail {
    pub files: Vec<FileChange>,
    pub stashes: Vec<String>,
    /// Only days with at least one commit. The frontend fills the gaps.
    pub activity: Vec<ActivityDay>,
}

/// Daily commit counts over the last [`ACTIVITY_DAYS`] days.
///
/// Uses the `git2` revwalk rather than shelling out to `git log`, because
/// Atlas is host-scoped and deliberately unauthorized: its repos are
/// arbitrary paths discovered under `scan_root`, never entries in the
/// workspace registry, so the CLI path's `authorized_repo_root` check could
/// never pass for them. See the module note in `mod.rs` and the Atlas vault
/// note on why this panel answers for the host machine only.
///
/// Walking is cheap because nothing is diffed -- only each commit's time is
/// read, and the walk stops at the first commit older than the window.
fn repo_activity(repo: &Repository) -> Vec<ActivityDay> {
    let mut walk = match repo.revwalk() {
        Ok(w) => w,
        Err(_) => return Vec::new(),
    };
    // An empty repository has no HEAD to push. That is a repo with no
    // activity, which the heatmap renders perfectly well as an empty grid.
    if walk.push_head().is_err() {
        return Vec::new();
    }

    let now = chrono::Utc::now().timestamp();
    let cutoff = now - ACTIVITY_DAYS * 86_400;

    let mut counts: BTreeMap<String, u32> = BTreeMap::new();
    for (seen, oid) in walk.flatten().enumerate() {
        if seen >= ACTIVITY_MAX_COMMITS {
            break;
        }
        let Ok(commit) = repo.find_commit(oid) else {
            continue;
        };
        let time = commit.time();
        if time.seconds() < cutoff {
            // Revwalk is newest-first by default, so the first commit older
            // than the window means every remaining one is too.
            break;
        }
        let Some(offset) = FixedOffset::east_opt(time.offset_minutes() * 60) else {
            continue;
        };
        let Some(dt) = DateTime::from_timestamp(time.seconds(), 0) else {
            continue;
        };
        let local = dt.with_timezone(&offset);
        *counts
            .entry(local.format("%Y-%m-%d").to_string())
            .or_insert(0) += 1;
    }

    counts
        .into_iter()
        .map(|(date, count)| ActivityDay { date, count })
        .collect()
}

pub fn repo_detail(path: &Path) -> Result<RepoDetail, String> {
    let mut repo = Repository::open(path).map_err(|e| e.message().to_string())?;

    let mut opts = StatusOptions::new();
    opts.include_untracked(true)
        .recurse_untracked_dirs(true)
        .exclude_submodules(true);
    let statuses = repo
        .statuses(Some(&mut opts))
        .map_err(|e| e.message().to_string())?;

    let mut files: Vec<FileChange> = Vec::with_capacity(statuses.len());
    for entry in statuses.iter() {
        let s = entry.status();
        let path = entry.path().unwrap_or("<invalid utf-8>").to_string();
        let index = index_code(s);
        let worktree = worktree_code(s);
        let conflicted = s.is_conflicted();
        if index.is_none() && worktree.is_none() && !conflicted {
            continue; // ignored/clean entries
        }
        files.push(FileChange {
            path,
            index,
            worktree,
            conflicted,
        });
    }
    files.sort_by(|a, b| a.path.cmp(&b.path));
    // `statuses` borrows `repo`; stash_foreach below needs `&mut repo`.
    drop(statuses);

    let mut stashes: Vec<String> = Vec::new();
    let _ = repo.stash_foreach(|_, msg, _| {
        stashes.push(msg.to_string());
        true
    });

    let activity = repo_activity(&repo);

    Ok(RepoDetail {
        files,
        stashes,
        activity,
    })
}

fn index_code(s: Status) -> Option<String> {
    let c = if s.is_index_new() {
        'A'
    } else if s.is_index_modified() {
        'M'
    } else if s.is_index_deleted() {
        'D'
    } else if s.is_index_renamed() {
        'R'
    } else if s.is_index_typechange() {
        'T'
    } else {
        return None;
    };
    Some(c.to_string())
}

fn worktree_code(s: Status) -> Option<String> {
    let c = if s.is_wt_new() {
        '?'
    } else if s.is_wt_modified() {
        'M'
    } else if s.is_wt_deleted() {
        'D'
    } else if s.is_wt_renamed() {
        'R'
    } else if s.is_wt_typechange() {
        'T'
    } else {
        return None;
    };
    Some(c.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::modules::atlas::testutil::{git, temp_repo};

    #[test]
    fn lists_staged_and_untracked_files() {
        let tmp = temp_repo("detail");
        git(&tmp, &["init", "-b", "main"]);
        std::fs::write(tmp.join("a.txt"), "hello").unwrap();
        git(&tmp, &["add", "a.txt"]);
        git(&tmp, &["commit", "-m", "first commit"]);
        std::fs::write(tmp.join("a.txt"), "changed").unwrap();
        std::fs::write(tmp.join("b.txt"), "untracked").unwrap();

        let detail = repo_detail(&tmp).expect("detail ok");
        assert_eq!(detail.files.len(), 2);
        let a = detail.files.iter().find(|f| f.path == "a.txt").unwrap();
        assert_eq!(a.worktree.as_deref(), Some("M"));
        let b = detail.files.iter().find(|f| f.path == "b.txt").unwrap();
        assert_eq!(b.worktree.as_deref(), Some("?"));
        assert!(detail.stashes.is_empty());

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn errors_on_non_repo() {
        let tmp = temp_repo("detail-nonrepo");
        assert!(repo_detail(&tmp).is_err());
        let _ = std::fs::remove_dir_all(&tmp);
    }
}
