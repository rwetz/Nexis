//! Resolve file paths into `ModelInfo` via extension + filename heuristics.

use crate::domain::*;
use chrono::Utc;
use std::fs;
use std::path::Path;

pub fn scan_paths(paths: Vec<String>) -> Vec<ModelInfo> {
    paths.iter().filter_map(|p| derive(p)).collect()
}

fn fnv1a(s: &str) -> u32 {
    let mut h: u32 = 2166136261;
    for b in s.bytes() {
        h ^= b as u32;
        h = h.wrapping_mul(16777619);
    }
    h
}

fn is_gguf_magic(path: &Path) -> bool {
    use std::io::Read;
    if let Ok(mut f) = fs::File::open(path) {
        let mut buf = [0u8; 4];
        if f.read_exact(&mut buf).is_ok() {
            return &buf == b"GGUF";
        }
    }
    false
}

fn derive(path: &str) -> Option<ModelInfo> {
    let p = Path::new(path);
    let name = p.file_name()?.to_string_lossy().to_string();
    let lower = name.to_lowercase();

    let format = if lower.ends_with(".gguf") {
        ModelFormat::Gguf
    } else if lower.ends_with(".onnx") {
        ModelFormat::Onnx
    } else if is_gguf_magic(p) {
        ModelFormat::Gguf
    } else {
        return None;
    };

    let size_bytes = fs::metadata(p).map(|m| m.len()).unwrap_or(0);
    let task = infer_task(&lower, format);
    let mut quant = if format == ModelFormat::Gguf {
        find_quant(&name)
    } else {
        None
    };
    let mut params_label = find_params(&name);
    let mut arch = None;
    let mut context_length = None;

    // Prefer real header metadata over filename heuristics for GGUF.
    if format == ModelFormat::Gguf {
        if let Some(meta) = crate::gguf::read_metadata(p) {
            arch = meta.arch;
            context_length = meta.context_length;
            if let Some(pc) = meta.param_count {
                params_label = Some(crate::gguf::fmt_params(pc));
            }
            if let Some(ft) = meta.file_type {
                if let Some(q) = crate::gguf::file_type_quant(ft) {
                    quant = Some(q.to_string());
                }
            }
        }
    }

    Some(ModelInfo {
        id: format!("m-{:x}", fnv1a(path)),
        name,
        path: path.to_string(),
        format,
        size_bytes,
        task,
        params_label,
        quant,
        arch,
        context_length,
        added_at: Utc::now().to_rfc3339(),
    })
}

fn infer_task(lower: &str, format: ModelFormat) -> TaskType {
    const EMBED: [&str; 6] = ["embed", "minilm", "bge", "gte", "e5", "sentence"];
    const CLASSIFY: [&str; 6] = ["bert", "sst", "classif", "sentiment", "nli", "distil"];
    if EMBED.iter().any(|k| lower.contains(k)) {
        return TaskType::Embedding;
    }
    if format == ModelFormat::Onnx {
        if CLASSIFY.iter().any(|k| lower.contains(k)) {
            return TaskType::Classification;
        }
        return TaskType::Classification;
    }
    TaskType::Generation
}

/// Find a GGUF quant token like `Q4_K_M` / `Q5_0`.
fn find_quant(name: &str) -> Option<String> {
    for tok in name.split(['.', '-', ' ']) {
        let bytes = tok.as_bytes();
        if bytes.len() >= 2 && (bytes[0] == b'Q' || bytes[0] == b'q') && bytes[1].is_ascii_digit() {
            return Some(tok.to_uppercase());
        }
    }
    None
}

/// Find a parameter-count token like `7B`, `3.8B`, `335M`.
fn find_params(name: &str) -> Option<String> {
    for tok in name.split(['.', '-', '_', ' ']) {
        let t = tok.trim();
        if t.len() < 2 {
            continue;
        }
        let last = t.chars().last().unwrap();
        if (last == 'B' || last == 'b' || last == 'M' || last == 'm')
            && t[..t.len() - 1]
                .chars()
                .all(|c| c.is_ascii_digit() || c == '.')
            && t[..t.len() - 1].chars().any(|c| c.is_ascii_digit())
        {
            return Some(t.to_uppercase());
        }
    }
    None
}
