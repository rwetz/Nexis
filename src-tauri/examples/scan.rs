//! Headless scan — the same data the atlas renders, printed as text.
//!
//!   cargo run --example scan            # every configured repo
//!   cargo run --example scan <path>     # one repo, with its top directories
//!
//! Useful for checking discovery, gitignore handling and timings without
//! starting the GUI.

use nexis_imagine_lib::{config, scan, tree};
use std::time::Instant;

fn main() {
    let (cfg, path) = match config::load_or_init() {
        Ok(v) => v,
        Err(e) => {
            eprintln!("config: {e}");
            std::process::exit(1);
        }
    };
    println!("config: {}", path.display());

    if let Some(arg) = std::env::args().nth(1) {
        let root = config::expand_tilde(&arg);
        match tree::build(&root, cfg.max_files) {
            Ok(city) => {
                println!(
                    "{}  {} files  {} lines  {} dirty  ({} ms)",
                    city.root.name,
                    city.summary.files,
                    city.root.lines,
                    city.root.dirty,
                    city.elapsed_ms
                );
                for child in city.root.children.iter().take(15) {
                    println!(
                        "  {:<28} {:>8} lines  {:>6} B  {}",
                        child.name, child.lines, child.bytes, child.lang
                    );
                }
            }
            Err(e) => eprintln!("{}: {e}", root.display()),
        }
        return;
    }

    let started = Instant::now();
    let repos = config::resolve_repos(&cfg);
    println!("discovered {} repos", repos.len());
    for p in &repos {
        let s = scan::summarize(p, cfg.max_files);
        println!(
            "  {:<24} {:<18} {:>6} files  {:>9} B  {:>3} dirty  {}",
            s.name,
            s.branch,
            s.files,
            s.bytes,
            s.dirty(),
            s.langs
                .iter()
                .take(3)
                .map(|l| l.lang.as_str())
                .collect::<Vec<_>>()
                .join(", ")
        );
        if let Some(err) = &s.error {
            println!("      error: {err}");
        }
    }
    println!("total {} ms", started.elapsed().as_millis());
}
