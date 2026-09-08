//! The list view's drill-in: which files are dirty, and what is stashed.
//!
//! Deliberately *not* a second scan. Everything the detail pane shows about
//! the repo as a whole — branch, sync, counts, last commit, stash count —
//! already came back with [`crate::modules::atlas::scan::RepoSummary`], so this returns only
//! the two things a summary cannot carry: the per-file status list and the
//! stash messages. The frontend pairs them with the summary it already holds.

use git2::{Repository, Status, StatusOptions};
use serde::Serialize;
use std::path::Path;

#[derive(Debug, Clone, Serialize)]
pub struct FileChange {
    pub path: String,
    /// Single-letter code for the index side (staged): A M D R T
    pub index: Option<String>,
    /// Single-letter code for the worktree side: M D R T ? (untracked)
    pub worktree: Option<String>,
    pub conflicted: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct RepoDetail {
    pub files: Vec<FileChange>,
    pub stashes: Vec<String>,
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

    Ok(RepoDetail { files, stashes })
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
