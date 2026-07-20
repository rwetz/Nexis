// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

// Panic-lint gate: no `.unwrap()`/`.expect()` in production code here.
// Tests may still panic (allow-*-in-tests in clippy.toml). CI's
// `clippy -- -D warnings` turns a new one into a build failure.
#![warn(clippy::unwrap_used, clippy::expect_used)]

use crate::modules::git::types::GitChangedFile;

#[derive(Default)]
pub struct PorcelainV2 {
    pub branch: String,
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub is_detached: bool,
    pub files: Vec<GitChangedFile>,
}

pub fn parse_porcelain_v2(stdout: &str) -> PorcelainV2 {
    let mut out = PorcelainV2 {
        branch: "HEAD".into(),
        ..Default::default()
    };
    let mut tokens = stdout.split('\0').filter(|t| !t.is_empty()).peekable();
    while let Some(tok) = tokens.next() {
        if let Some(rest) = tok.strip_prefix("# branch.head ") {
            out.branch = rest.to_string();
            out.is_detached = rest == "(detached)";
            continue;
        }
        if let Some(rest) = tok.strip_prefix("# branch.upstream ") {
            out.upstream = Some(rest.to_string());
            continue;
        }
        if let Some(rest) = tok.strip_prefix("# branch.ab ") {
            let mut parts = rest.split_ascii_whitespace();
            if let Some(a) = parts.next() {
                out.ahead = a.trim_start_matches('+').parse().unwrap_or(0);
            }
            if let Some(b) = parts.next() {
                out.behind = b.trim_start_matches('-').parse().unwrap_or(0);
            }
            continue;
        }
        if tok.starts_with("# ") {
            continue;
        }
        if let Some(rest) = tok.strip_prefix("1 ") {
            if let Some(file) = parse_ordinary(rest) {
                out.files.push(file);
            }
            continue;
        }
        if let Some(rest) = tok.strip_prefix("2 ") {
            let orig = tokens.next().unwrap_or("").to_string();
            if let Some(file) = parse_renamed(rest, orig) {
                out.files.push(file);
            }
            continue;
        }
        if let Some(rest) = tok.strip_prefix("u ") {
            if let Some(file) = parse_unmerged(rest) {
                out.files.push(file);
            }
            continue;
        }
        if let Some(rest) = tok.strip_prefix("? ") {
            out.files.push(make_file('?', '?', rest, None));
            continue;
        }
    }
    out
}

fn skip_fields(s: &str, n: usize) -> Option<&str> {
    let mut rest = s;
    for _ in 0..n {
        let idx = rest.find(' ')?;
        rest = &rest[idx + 1..];
    }
    Some(rest)
}

fn parse_ordinary(rest: &str) -> Option<GitChangedFile> {
    let xy = rest.get(..2)?;
    let path = skip_fields(rest, 7)?;
    let (i, w) = xy_chars(xy);
    Some(make_file(i, w, path, None))
}

fn parse_renamed(rest: &str, orig_path: String) -> Option<GitChangedFile> {
    let xy = rest.get(..2)?;
    let after = skip_fields(rest, 8)?;
    let (i, w) = xy_chars(xy);
    Some(make_file(i, w, after, Some(orig_path)))
}

fn parse_unmerged(rest: &str) -> Option<GitChangedFile> {
    let xy = rest.get(..2)?;
    let path = skip_fields(rest, 9)?;
    let (i, w) = xy_chars(xy);
    Some(make_file(i, w, path, None))
}

// porcelain v2 uses '.' to mean "unchanged"; downstream logic mirrors v1 spaces.
fn xy_chars(xy: &str) -> (char, char) {
    let mut it = xy.chars();
    let to_space = |c: char| if c == '.' { ' ' } else { c };
    (
        to_space(it.next().unwrap_or(' ')),
        to_space(it.next().unwrap_or(' ')),
    )
}

fn make_file(
    index_status: char,
    worktree_status: char,
    path: &str,
    original_path: Option<String>,
) -> GitChangedFile {
    GitChangedFile {
        path: path.to_string(),
        original_path,
        index_status: index_status.to_string(),
        worktree_status: worktree_status.to_string(),
        staged: is_staged(index_status, worktree_status),
        unstaged: is_unstaged(index_status, worktree_status),
        untracked: index_status == '?' && worktree_status == '?',
        status_label: status_label(index_status, worktree_status),
    }
}

fn is_staged(index_status: char, worktree_status: char) -> bool {
    index_status != ' ' && !(index_status == '?' && worktree_status == '?')
}

fn is_unstaged(index_status: char, worktree_status: char) -> bool {
    worktree_status != ' ' || (index_status == '?' && worktree_status == '?')
}

fn status_label(index_status: char, worktree_status: char) -> String {
    match (index_status, worktree_status) {
        ('?', '?') => "Untracked".into(),
        ('A', _) => "Added".into(),
        ('M', _) | (_, 'M') => "Modified".into(),
        ('D', _) | (_, 'D') => "Deleted".into(),
        ('R', _) | (_, 'R') => "Renamed".into(),
        ('C', _) | (_, 'C') => "Copied".into(),
        ('U', _) | (_, 'U') => "Unmerged".into(),
        _ => "Changed".into(),
    }
}

#[cfg(test)]
mod tests {
    use super::parse_porcelain_v2;

    #[test]
    fn porcelain_v2_parses_branch_and_files() {
        let stdout = concat!(
            "# branch.oid abc123\0",
            "# branch.head main\0",
            "# branch.upstream origin/main\0",
            "# branch.ab +2 -1\0",
            "1 .M N... 100644 100644 100644 abc def src/a.rs\0",
            "2 R. N... 100644 100644 100644 abc def R100 src/new.rs\0src/old.rs\0",
            "? src/untracked.rs\0",
        );
        let parsed = parse_porcelain_v2(stdout);
        assert_eq!(parsed.branch, "main");
        assert_eq!(parsed.upstream.as_deref(), Some("origin/main"));
        assert_eq!(parsed.ahead, 2);
        assert_eq!(parsed.behind, 1);
        assert!(!parsed.is_detached);
        assert_eq!(parsed.files.len(), 3);
        assert_eq!(parsed.files[0].path, "src/a.rs");
        assert!(parsed.files[0].unstaged);
        assert_eq!(parsed.files[1].path, "src/new.rs");
        assert_eq!(parsed.files[1].original_path.as_deref(), Some("src/old.rs"));
        assert!(parsed.files[1].staged);
        assert_eq!(parsed.files[2].path, "src/untracked.rs");
        assert!(parsed.files[2].untracked);
    }

    #[test]
    fn porcelain_v2_handles_detached_head() {
        let stdout = "# branch.oid abc\0# branch.head (detached)\0";
        let parsed = parse_porcelain_v2(stdout);
        assert!(parsed.is_detached);
        assert_eq!(parsed.branch, "(detached)");
        assert!(parsed.upstream.is_none());
    }

    #[test]
    fn porcelain_v2_empty_input_yields_head_default() {
        let parsed = parse_porcelain_v2("");
        assert_eq!(parsed.branch, "HEAD");
        assert!(parsed.files.is_empty());
        assert_eq!(parsed.ahead, 0);
        assert_eq!(parsed.behind, 0);
    }

    #[test]
    fn porcelain_v2_truncated_rename_does_not_panic() {
        // A rename record whose paired original-path token is missing (stream
        // cut off mid-record) must not panic; the orig path falls back to "".
        let stdout = "# branch.head main\x002 R. N... 1 2 3 a b R100 new.rs\x00";
        let parsed = parse_porcelain_v2(stdout);
        assert_eq!(parsed.files.len(), 1);
        assert_eq!(parsed.files[0].path, "new.rs");
        assert_eq!(parsed.files[0].original_path.as_deref(), Some(""));
    }

    struct R(u64);
    impl R {
        fn next_u64(&mut self) -> u64 {
            let mut x = self.0;
            x ^= x << 13;
            x ^= x >> 7;
            x ^= x << 17;
            self.0 = x;
            x
        }
    }

    /// The parser consumes raw `git status --porcelain=v2 -z` output, which is
    /// attacker-influenced (branch names, file paths). It must never panic on
    /// malformed, truncated, or non-ASCII input — only ever produce a usable
    /// struct. This fuzzes random token streams against that invariant.
    #[test]
    fn fuzz_parse_porcelain_v2_never_panics() {
        const PIECES: &[&str] = &[
            "# branch.head main",
            "# branch.head (detached)",
            "# branch.upstream origin/x",
            "# branch.ab +2 -1",
            "# branch.ab +x -",
            "# branch.ab",
            "# weird",
            "1 .M N... 100644 100644 100644 a b src/a.rs",
            "1 .M N... 100644 100644 100644 a b ünïcödé.rs",
            "1 X",
            "1 ",
            "1",
            "2 R. N... 1 2 3 a b R100 new.rs",
            "2 ",
            "u UU N... 1 2 3 4 a b c merge.rs",
            "u ",
            "? untracked.rs",
            "? ",
            "?",
            "garbage line",
            "ünïcödé/path.rs",
            "\u{1b}[31mansi\u{1b}[0m",
            "",
        ];
        let mut rng = R(0x1234_5678_9ABC_DEF0);
        for _ in 0..50_000 {
            let token_count = (rng.next_u64() as usize) % 8;
            let mut stdout = String::new();
            for _ in 0..token_count {
                stdout.push_str(PIECES[(rng.next_u64() as usize) % PIECES.len()]);
                stdout.push('\0');
            }
            let parsed = parse_porcelain_v2(&stdout);
            // Invariants that must hold for ANY input:
            assert!(
                !parsed.branch.is_empty(),
                "branch went empty for {stdout:?}"
            );
            for f in &parsed.files {
                assert!(!f.index_status.is_empty());
                assert!(!f.worktree_status.is_empty());
            }
        }
    }
}
