//! Shared test helpers: building a throwaway git repo on disk.
//!
//! Both the scan and the detail pass need one, and they need it to be a *real*
//! repo — libgit2 reading a fixture is the thing under test, so faking it
//! would test nothing.

use std::path::{Path, PathBuf};
use std::process::Command;

/// A fresh empty directory, unique per test name and process.
pub fn temp_repo(tag: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("atlas-{tag}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("create temp dir");
    dir
}

/// Run git in `dir` with a fixed identity, asserting it succeeded.
pub fn git(dir: &Path, args: &[&str]) {
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
