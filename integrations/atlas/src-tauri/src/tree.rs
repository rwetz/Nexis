//! The nested file tree behind the city view: directories become terraces,
//! files become buildings. Line counts are what give buildings their height,
//! so they are counted for real (not estimated from bytes) for every text file
//! under `MAX_READ_BYTES`, in parallel.

use crate::lang;
use crate::scan::{self, RepoSummary};
use rayon::prelude::*;
use serde::Serialize;
use std::collections::{BTreeMap, HashMap};
use std::path::Path;
use std::time::Instant;

/// Files bigger than this are sized by bytes only — reading a 40 MB generated
/// blob to learn it has a lot of lines is not worth the stall.
const MAX_READ_BYTES: u64 = 1 << 20;

#[derive(Debug, Clone, Serialize)]
pub struct TreeNode {
    pub name: String,
    /// Repo-relative, `/`-separated. Empty string for the root.
    pub path: String,
    pub is_dir: bool,
    pub bytes: u64,
    pub lines: u64,
    /// Dominant language of the subtree for directories; own language for files.
    pub lang: String,
    /// Working-tree state letter (M A D R T C ?) — files only.
    pub status: Option<String>,
    /// Dirty files in this subtree (0 or 1 for a file).
    pub dirty: usize,
    pub children: Vec<TreeNode>,
}

#[derive(Debug, Clone, Serialize)]
pub struct RepoCity {
    pub summary: RepoSummary,
    pub root: TreeNode,
    pub elapsed_ms: u64,
}

pub fn build(root: &Path, limit: usize) -> Result<RepoCity, String> {
    let started = Instant::now();
    // One pass: the summary, the file list and the open repo all come from the
    // same walk. Doing `summarize` and then walking again cost two full
    // traversals of the tree on every drill-in.
    let scan::RepoScan {
        summary,
        walked,
        repo,
    } = scan::scan_repo(root, limit);
    // Per-file codes need the recursive-untracked variant, which is a
    // different query from the counts `summarize` already took.
    let statuses = repo.as_ref().map(scan::status_map).unwrap_or_default();

    let leaves: Vec<(String, Leaf)> = walked
        .files
        .par_iter()
        .map(|f| {
            let lines = count_lines(&root.join(&f.rel), f.bytes, f.lang);
            let status = statuses.get(&f.rel).cloned();
            (
                f.rel.clone(),
                Leaf {
                    bytes: f.bytes,
                    lines,
                    lang: f.lang,
                    status,
                },
            )
        })
        .collect();

    let mut builder = Builder::default();
    for (rel, leaf) in leaves {
        builder.insert(&rel, leaf);
    }

    let name = root
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| root.display().to_string());

    Ok(RepoCity {
        root: builder.finish(name, String::new()),
        summary,
        elapsed_ms: started.elapsed().as_millis() as u64,
    })
}

/// Newline count, plus one for a final line with no trailing newline. Falls
/// back to 0 for binaries and unreadable files — those are sized by bytes.
fn count_lines(path: &Path, bytes: u64, lang: &str) -> u64 {
    if bytes == 0 || bytes > MAX_READ_BYTES || !lang::is_countable(lang) {
        return 0;
    }
    let Ok(data) = std::fs::read(path) else {
        return 0;
    };
    // A NUL byte in the first block means it is not really text, whatever the
    // extension claimed.
    if data.iter().take(8192).any(|b| *b == 0) {
        return 0;
    }
    let newlines = data.iter().filter(|b| **b == b'\n').count() as u64;
    if data.last() == Some(&b'\n') {
        newlines
    } else {
        newlines + 1
    }
}

struct Leaf {
    bytes: u64,
    lines: u64,
    lang: &'static str,
    status: Option<String>,
}

#[derive(Default)]
struct Builder {
    children: BTreeMap<String, Builder>,
    leaf: Option<Leaf>,
}

impl Builder {
    fn insert(&mut self, rel: &str, leaf: Leaf) {
        match rel.split_once('/') {
            Some((head, rest)) => self
                .children
                .entry(head.to_string())
                .or_default()
                .insert(rest, leaf),
            None => {
                self.children.entry(rel.to_string()).or_default().leaf = Some(leaf);
            }
        }
    }

    fn finish(self, name: String, path: String) -> TreeNode {
        if let Some(leaf) = self.leaf {
            let dirty = usize::from(leaf.status.is_some());
            return TreeNode {
                name,
                path,
                is_dir: false,
                bytes: leaf.bytes,
                lines: leaf.lines,
                lang: leaf.lang.to_string(),
                status: leaf.status,
                dirty,
                children: Vec::new(),
            };
        }

        let mut children: Vec<TreeNode> = self
            .children
            .into_iter()
            .map(|(child_name, child)| {
                let child_path = if path.is_empty() {
                    child_name.clone()
                } else {
                    format!("{path}/{child_name}")
                };
                child.finish(child_name, child_path)
            })
            .collect();
        // Biggest first: the treemap squarifies in this order, and a stable
        // sort keeps a repo laid out identically between refreshes.
        children.sort_by(|a, b| {
            b.bytes
                .cmp(&a.bytes)
                .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
        });

        let mut bytes = 0;
        let mut lines = 0;
        let mut dirty = 0;
        let mut by_lang: HashMap<String, u64> = HashMap::new();
        for c in &children {
            bytes += c.bytes;
            lines += c.lines;
            dirty += c.dirty;
            if !c.is_dir {
                *by_lang.entry(c.lang.clone()).or_default() += c.bytes;
            }
        }
        let lang = by_lang
            .into_iter()
            .max_by(|a, b| a.1.cmp(&b.1).then_with(|| b.0.cmp(&a.0)))
            .map(|(l, _)| l)
            .unwrap_or_else(|| "Other".to_string());

        TreeNode {
            name,
            path,
            is_dir: true,
            bytes,
            lines,
            lang,
            status: None,
            dirty,
            children,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command;

    fn git(dir: &Path, args: &[&str]) {
        let out = Command::new("git")
            .args(args)
            .current_dir(dir)
            .env("GIT_AUTHOR_NAME", "t")
            .env("GIT_AUTHOR_EMAIL", "t@t")
            .env("GIT_COMMITTER_NAME", "t")
            .env("GIT_COMMITTER_EMAIL", "t@t")
            .output()
            .expect("git runs");
        assert!(
            out.status.success(),
            "git {args:?}: {}",
            String::from_utf8_lossy(&out.stderr)
        );
    }

    #[test]
    fn builds_a_city_from_a_small_repo() {
        let tmp = std::env::temp_dir().join(format!("atlas-tree-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(tmp.join("src")).unwrap();
        git(&tmp, &["init", "-b", "main"]);
        std::fs::write(tmp.join("src/main.rs"), "fn main() {}\nfn other() {}\n").unwrap();
        std::fs::write(tmp.join("README.md"), "# hi\n").unwrap();
        std::fs::write(tmp.join(".gitignore"), "ignored.txt\n").unwrap();
        std::fs::write(tmp.join("ignored.txt"), "invisible\n").unwrap();
        git(&tmp, &["add", "-A"]);
        git(&tmp, &["commit", "-m", "first"]);
        std::fs::write(tmp.join("README.md"), "# hi\n# again\n").unwrap();

        let city = build(&tmp, 1000).expect("builds");
        assert_eq!(city.summary.branch, "main");
        assert_eq!(city.summary.unstaged, 1);
        assert!(city.root.is_dir);

        let names: Vec<&str> = city.root.children.iter().map(|c| c.name.as_str()).collect();
        assert!(names.contains(&"src"), "got {names:?}");
        assert!(names.contains(&"README.md"), "got {names:?}");
        assert!(!names.contains(&"ignored.txt"), "gitignore not honored");

        let src = city.root.children.iter().find(|c| c.name == "src").unwrap();
        assert_eq!(src.children[0].lines, 2);
        assert_eq!(src.lang, "Rust");

        let readme = city
            .root
            .children
            .iter()
            .find(|c| c.name == "README.md")
            .unwrap();
        assert_eq!(readme.status.as_deref(), Some("M"));
        assert_eq!(city.root.dirty, 1);

        let _ = std::fs::remove_dir_all(&tmp);
    }
}
