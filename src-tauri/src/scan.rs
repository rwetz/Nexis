//! Per-repo aggregate stats — the data behind the atlas view, where every repo
//! is one island. Read-only: git state comes from libgit2, size and language
//! mix from a single filesystem walk. Cheap enough to run for every repo on
//! every refresh, with rayon fanning the repos out.

use crate::walk::{self, WalkResult};
use git2::{BranchType, ErrorCode, Repository, Status, StatusOptions};
use serde::Serialize;
use std::collections::HashMap;
use std::path::Path;

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
    /// Unix seconds of the last commit — drives the "age" dimming in the atlas.
    pub last_commit_time: Option<i64>,
    pub last_commit_summary: Option<String>,
    pub files: usize,
    pub dirs: usize,
    pub bytes: u64,
    /// Top languages by bytes, descending. Becomes the island's skyline.
    pub langs: Vec<LangSlice>,
    pub truncated: bool,
    pub error: Option<String>,
}

impl RepoSummary {
    pub fn dirty(&self) -> usize {
        self.staged + self.unstaged + self.untracked + self.conflicted
    }
}

pub fn summarize(path: &Path, limit: usize) -> RepoSummary {
    let mut sum = RepoSummary {
        path: path.display().to_string(),
        name: path
            .file_name()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_else(|| path.display().to_string()),
        ..Default::default()
    };

    let repo = match Repository::open(path) {
        Ok(r) => Some(r),
        Err(e) => {
            sum.error = Some(e.message().to_string());
            None
        }
    };

    if let Some(repo) = &repo {
        if let Err(e) = fill_git(repo, &mut sum) {
            sum.error = Some(e.message().to_string());
        }
    }

    let walked = walk::walk_repo(path, repo.as_ref(), limit);
    fill_size(&walked, &mut sum);
    sum
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
    langs.truncate(8);
    sum.langs = langs;
}

fn fill_git(repo: &Repository, sum: &mut RepoSummary) -> Result<(), git2::Error> {
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
                sum.last_commit_time = Some(commit.time().seconds());
                sum.last_commit_summary = commit.summary().map(str::to_string);
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
    for entry in repo.statuses(Some(&mut opts))?.iter() {
        count_status(entry.status(), sum);
    }

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
