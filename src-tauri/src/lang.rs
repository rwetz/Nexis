//! Extension → language mapping.
//!
//! The frontend turns each language name into a hue on a themed OKLCH ramp
//! (see `src/modules/city/palette.ts`), so the only contract here is that a
//! name is stable and low-cardinality. Anything unrecognized falls through to
//! "Other", which renders as neutral grey — the city stays mostly neutral, per
//! the design system, with colour carrying language and nothing else.

/// Languages whose contents are worth counting lines for.
///
/// This mirrors the "inert" tier in `src/modules/city/palette.ts`: the renderer
/// sizes those by bytes and never asks for their line count, so reading them is
/// pure I/O for a number nothing consumes. Lockfiles matter most here — a
/// `pnpm-lock.yaml` is a quarter of a megabyte of text that no one wrote.
pub fn is_countable(lang: &str) -> bool {
    !matches!(lang, "Binary" | "Image" | "Other" | "Lockfile" | "Font")
}

pub fn lang_for(file_name: &str) -> &'static str {
    // Whole-name matches first — dotfiles and build files have no useful ext.
    match file_name {
        "Dockerfile" | "Containerfile" => return "Docker",
        "Makefile" | "makefile" | "GNUmakefile" => return "Make",
        "CMakeLists.txt" => return "CMake",
        "Cargo.lock" | "pnpm-lock.yaml" | "package-lock.json" | "yarn.lock" | "poetry.lock"
        | "Gemfile.lock" | "uv.lock" => return "Lockfile",
        _ => {}
    }

    let ext = match file_name.rsplit_once('.') {
        // A leading dot with no other dot is a dotfile, not an extension.
        Some((stem, ext)) if !stem.is_empty() => ext,
        _ => return "Other",
    };

    match ext.to_ascii_lowercase().as_str() {
        "rs" => "Rust",
        "ts" | "mts" | "cts" => "TypeScript",
        "tsx" => "TypeScript",
        "js" | "mjs" | "cjs" | "jsx" => "JavaScript",
        "py" | "pyi" => "Python",
        "go" => "Go",
        "c" | "h" => "C",
        "cc" | "cpp" | "cxx" | "hpp" | "hh" | "hxx" => "C++",
        "java" => "Java",
        "kt" | "kts" => "Kotlin",
        "swift" => "Swift",
        "rb" => "Ruby",
        "php" => "PHP",
        "cs" => "C#",
        "lua" => "Lua",
        "zig" => "Zig",
        "ex" | "exs" => "Elixir",
        "hs" => "Haskell",
        "scala" | "sc" => "Scala",
        "dart" => "Dart",
        "sql" => "SQL",
        "sh" | "bash" | "zsh" | "fish" => "Shell",
        "ps1" | "psm1" => "PowerShell",
        "css" | "scss" | "sass" | "less" => "CSS",
        "html" | "htm" => "HTML",
        "vue" | "svelte" | "astro" => "Web",
        "json" | "jsonc" => "JSON",
        "toml" | "yaml" | "yml" | "ini" | "cfg" | "conf" | "env" => "Config",
        "md" | "mdx" | "rst" | "adoc" | "txt" => "Docs",
        "nix" => "Nix",
        "tf" | "hcl" => "Terraform",
        "proto" => "Protobuf",
        "graphql" | "gql" => "GraphQL",
        "ipynb" => "Notebook",
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" | "ico" | "avif" | "bmp" => "Image",
        "woff" | "woff2" | "ttf" | "otf" | "eot" => "Font",
        "wasm" | "so" | "dll" | "dylib" | "exe" | "a" | "o" | "bin" | "pdf" | "zip" | "gz"
        | "tar" | "7z" | "mp4" | "mp3" | "wav" | "webm" => "Binary",
        _ => "Other",
    }
}
