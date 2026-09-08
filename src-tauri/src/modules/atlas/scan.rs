//! Per-repo aggregate stats — the one scan behind both views. The list reads
//! the git half (branch, sync, changes, last commit, stashes); the map reads
//! the size half (files, bytes, language mix) and builds an island from it.
//! Read-only: git state comes from libgit2, size and language mix from a
//! single filesystem walk. Cheap enough to run for every repo on every
//! refresh, with rayon fanning the repos out.

use crate::modules::atlas::walk::{self, WalkResult};
use git2::{BranchType, ErrorCode, Repository, Status, StatusOptions};
use serde::Serialize;
use std::collections::HashMap;
use std::path::Path;

/// The head commit, as much of it as either view shows.
#[derive(Debug, Clone, Serialize, Default)]
pub struct CommitInfo {
    pub summary: String,
    pub author: String,
    /// Unix seconds — the frontend renders relative time.
    pub time: i64,
    pub hash: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct LangSlice {
    pub lang: String,
    pub bytes: u64,
    pub files: usize,
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct RepoSummary {
    pub path: String,
    pub name: String,
    pub branch: String,
    pub detached: bool,
    pub staged: usize,
    pub unstaged: usize,
    pub untracked: usize,
    pub conflicted: usize,
    pub ahead: usize,
    pub behind: usize,
    pub upstream: Option<String>,
    pub stash_count: usize,
    /// Read by both views: the list renders it as a column, the map dims an
    /// island by its age. `None` on a repo with no commits yet.
    pub last_commit: Option<CommitInfo>,
    pub files: usize,
    pub dirs: usize,
    pub bytes: u64,
    /// Top languages by bytes, descending. Becomes the island's skyline.
    pub langs: Vec<LangSlice>,
    pub truncated: bool,
    pub error: Option<String>,
}


/// Everything one pass over a repo yields. The atlas only wants `summary` and
/// drops the rest; the city needs all three, and getting them together is what
/// keeps drilling in from walking the tree — and opening the repo — twice.
pub struct RepoScan {
    pub summary: RepoSummary,
    pub walked: WalkResult,
    pub repo: Option<Repository>,
}

/// One walk, one `Repository::open`, one status pass.
pub fn scan_repo(path: &Path, limit: usize) -> RepoScan {
    let mut sum = RepoSummary {
        path: path.display().to_string(),
        name: path
            .file_name()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_else(|| path.display().to_string()),
        ..Default::default()
    };

    let mut repo = match Repository::open(path) {
        Ok(r) => Some(r),
        Err(e) => {
            sum.error = Some(e.message().to_string());
            None
        }
    };

    // `&mut` because counting stashes needs it; the borrow ends before the
    // walk below takes `repo` by shared reference.
    if let Some(repo) = &mut repo {
        if let Err(e) = fill_git(repo, &mut sum) {
            sum.error = Some(e.message().to_string());
        }
    }

    let walked = walk::walk_repo(path, repo.as_ref(), limit);
    fill_size(&walked, &mut sum);
    RepoScan {
        summary: sum,
        walked,
        repo,
    }
}

/// Aggregate stats alone — the atlas path, which never looks at the file list.
pub fn summarize(path: &Path, limit: usize) -> RepoSummary {
    scan_repo(path, limit).summary
}

fn fill_size(walked: &WalkResult, sum: &mut RepoSummary) {
    sum.files = walked.files.len();
    sum.dirs = walked.dirs;
    sum.truncated = walked.truncated;

    let mut by_lang: HashMap<&'static str, (u64, usize)> = HashMap::new();
    for f in &walked.files {
        sum.bytes += f.bytes;
        let slot = by_lang.entry(f.lang).or_insert((0, 0));
        slot.0 += f.bytes;
        slot.1 += 1;
    }
    let mut langs: Vec<LangSlice> = by_lang
        .into_iter()
        .map(|(lang, (bytes, files))| LangSlice {
            lang: lang.to_string(),
            bytes,
            files,
        })
        .collect();
    langs.sort_by(|a, b| b.bytes.cmp(&a.bytes).then_with(|| a.lang.cmp(&b.lang)));
    // Headroom, because the atlas drops the inert slices (images, binaries,
    // fonts, lockfiles) before it draws. Truncating to 8 here can leave a repo
    // with five kinds of asset and only three of its actual languages.
    langs.truncate(12);
    sum.langs = langs;
}

fn fill_git(repo: &mut Repository, sum: &mut RepoSummary) -> Result<(), git2::Error> {
    match repo.head() {
        Ok(head) => {
            if repo.head_detached().unwrap_or(false) {
                sum.detached = true;
                sum.branch = head
                    .peel_to_commit()
                    .map(|c| c.id().to_string()[..7].to_string())
                    .unwrap_or_else(|_| "HEAD".into());
            } else {
                sum.branch = head.shorthand().unwrap_or("HEAD").to_string();
            }
            if let Ok(commit) = head.peel_to_commit() {
                sum.last_commit = Some(CommitInfo {
                    summary: commit.summary().unwrap_or("").to_string(),
                    author: commit.author().name().unwrap_or("").to_string(),
                    time: commit.time().seconds(),
                    hash: commit.id().to_string()[..7].to_string(),
                });
            }
        }
        // Freshly-initialized repo with no commits: HEAD points at an unborn
        // branch — surface its name instead of erroring out.
        Err(e) if e.code() == ErrorCode::UnbornBranch => {
            if let Ok(head_ref) = repo.find_reference("HEAD") {
                if let Some(target) = head_ref.symbolic_target() {
                    sum.branch = target
                        .strip_prefix("refs/heads/")
                        .unwrap_or(target)
                        .to_string();
                }
            }
        }
        Err(e) => return Err(e),
    }

    let mut opts = StatusOptions::new();
    opts.include_untracked(true).exclude_submodules(true);
    let statuses = repo.statuses(Some(&mut opts))?;
    for entry in statuses.iter() {
        count_status(entry.status(), sum);
    }
    // `statuses` borrows `repo`; stash_foreach below needs `&mut repo`.
    drop(statuses);

    if !sum.detached && !sum.branch.is_empty() {
        if let Ok(local) = repo.find_branch(&sum.branch, BranchType::Local) {
            if let Ok(up) = local.upstream() {
                if let Ok(Some(name)) = up.name() {
                    sum.upstream = Some(name.to_string());
                }
                if let (Some(l), Some(u)) = (local.get().target(), up.get().target()) {
                    if let Ok((ahead, behind)) = repo.graph_ahead_behind(l, u) {
                        sum.ahead = ahead;
                        sum.behind = behind;
                    }
                }
            }
        }
    }

    let mut stash_count = 0usize;
    let _ = repo.stash_foreach(|_, _, _| {
        stash_count += 1;
        true
    });
    sum.stash_count = stash_count;

    Ok(())
}

fn count_status(s: Status, sum: &mut RepoSummary) {
    if s.is_conflicted() {
        sum.conflicted += 1;
        return;
    }
    if s.is_wt_new() {
        sum.untracked += 1;
    }
    if s.is_index_new()
        || s.is_index_modified()
        || s.is_index_deleted()
        || s.is_index_renamed()
        || s.is_index_typechange()
    {
        sum.staged += 1;
    }
    if s.is_wt_modified() || s.is_wt_deleted() || s.is_wt_renamed() || s.is_wt_typechange() {
        sum.unstaged += 1;
    }
}

/// Per-file working-tree state, keyed by repo-relative path. Files carry this
/// straight onto their building: coral roof for modified, outline for untracked.
pub fn status_map(repo: &Repository) -> HashMap<String, String> {
    let mut opts = StatusOptions::new();
    opts.include_untracked(true)
        .recurse_untracked_dirs(true)
        .exclude_submodules(true);
    let Ok(statuses) = repo.statuses(Some(&mut opts)) else {
        return HashMap::new();
    };
    let mut out = HashMap::new();
    for entry in statuses.iter() {
        let Some(path) = entry.path() else { continue };
        if let Some(code) = code_for(entry.status()) {
            out.insert(path.to_string(), code.to_string());
        }
    }
    out
}

/// One letter per file, worktree side preferred over index — the city only has
/// room for a single signal per building.
fn code_for(s: Status) -> Option<&'static str> {
    if s.is_conflicted() {
        return Some("C");
    }
    if s.is_wt_new() {
        return Some("?");
    }
    if s.is_wt_modified() || s.is_index_modified() {
        return Some("M");
    }
    if s.is_index_new() {
        return Some("A");
    }
    if s.is_wt_deleted() || s.is_index_deleted() {
        return Some("D");
    }
    if s.is_wt_renamed() || s.is_index_renamed() {
        return Some("R");
    }
    if s.is_wt_typechange() || s.is_index_typechange() {
        return Some("T");
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::modules::atlas::testutil::{git, temp_repo};

    /// One pass has to satisfy both views at once: the git fields the list
    /// renders and the size/language fields the map builds from.
    #[test]
    fn one_scan_serves_both_views() {
        let tmp = temp_repo("scan");
        git(&tmp, &["init", "-b", "main"]);
        std::fs::write(
            tmp.join("a.rs"),
            "fn main() {}
",
        )
        .unwrap();
        git(&tmp, &["add", "a.rs"]);
        git(&tmp, &["commit", "-m", "first commit"]);
        std::fs::write(
            tmp.join("a.rs"),
            "fn main() { todo!() }
",
        )
        .unwrap();
        std::fs::write(tmp.join("b.txt"), "untracked").unwrap();

        let sum = summarize(&tmp, 20_000);
        assert_eq!(sum.error, None);

        // git half — what the list column reads
        assert_eq!(sum.branch, "main");
        assert_eq!(sum.unstaged, 1);
        assert_eq!(sum.untracked, 1);
        // Was `sum.dirty()`; the helper was only ever reachable from here, and
        // the frontend computes the same sum in `types.ts` for display.
        assert_eq!(
            sum.staged + sum.unstaged + sum.untracked + sum.conflicted,
            2
        );
        assert_eq!(sum.stash_count, 0);
        let commit = sum.last_commit.as_ref().expect("has last commit");
        assert_eq!(commit.summary, "first commit");
        assert_eq!(commit.hash.len(), 7);
        assert_eq!(commit.author, "t");

        // size half — what the map builds an island from
        assert_eq!(sum.files, 2);
        assert!(sum.bytes > 0);
        assert!(sum.langs.iter().any(|l| l.lang == "Rust"));

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn counts_stashes() {
        let tmp = temp_repo("scan-stash");
        git(&tmp, &["init", "-b", "main"]);
        std::fs::write(tmp.join("a.txt"), "one").unwrap();
        git(&tmp, &["add", "a.txt"]);
        git(&tmp, &["commit", "-m", "first"]);
        std::fs::write(tmp.join("a.txt"), "two").unwrap();
        git(&tmp, &["stash"]);

        assert_eq!(summarize(&tmp, 20_000).stash_count, 1);
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn reports_error_for_non_repo() {
        let tmp = temp_repo("scan-nonrepo");
        let sum = summarize(&tmp, 20_000);
        assert!(sum.error.is_some());
        let _ = std::fs::remove_dir_all(&tmp);
    }
}
