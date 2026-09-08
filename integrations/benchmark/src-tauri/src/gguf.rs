//! Minimal GGUF header reader — pulls real metadata (architecture, parameter
//! count, context length, quantization) from the file header instead of
//! guessing from the filename. Spec: GGUF v2/v3, little-endian.

use std::fs::File;
use std::io::{self, BufReader, Read};
use std::path::Path;

#[derive(Debug, Default, Clone)]
pub struct GgufMeta {
    pub arch: Option<String>,
    pub name: Option<String>,
    pub param_count: Option<u64>,
    pub context_length: Option<u64>,
    pub file_type: Option<u32>,
}

enum GVal {
    U64(u64),
    I64(i64),
    F64(f64),
    Str(String),
    Other,
}

impl GVal {
    fn as_u64(&self) -> Option<u64> {
        match self {
            GVal::U64(v) => Some(*v),
            GVal::I64(v) if *v >= 0 => Some(*v as u64),
            GVal::F64(v) if *v >= 0.0 => Some(*v as u64),
            _ => None,
        }
    }
}

type R = BufReader<File>;

fn u32le(r: &mut R) -> io::Result<u32> {
    let mut b = [0u8; 4];
    r.read_exact(&mut b)?;
    Ok(u32::from_le_bytes(b))
}
fn u64le(r: &mut R) -> io::Result<u64> {
    let mut b = [0u8; 8];
    r.read_exact(&mut b)?;
    Ok(u64::from_le_bytes(b))
}
fn read_string(r: &mut R) -> io::Result<String> {
    let n = u64le(r)? as usize;
    let mut buf = vec![0u8; n];
    r.read_exact(&mut buf)?;
    Ok(String::from_utf8_lossy(&buf).into_owned())
}

/// Byte size of a fixed-width scalar value type, or None for string/array.
fn scalar_size(vt: u32) -> Option<u64> {
    match vt {
        0 | 1 | 7 => Some(1), // u8 / i8 / bool
        2 | 3 => Some(2),     // u16 / i16
        4..=6 => Some(4),     // u32 / i32 / f32
        10..=12 => Some(8),   // u64 / i64 / f64
        _ => None,
    }
}

fn read_scalar(r: &mut R, vt: u32) -> io::Result<GVal> {
    let size = scalar_size(vt).unwrap();
    let mut b = [0u8; 8];
    r.read_exact(&mut b[..size as usize])?;
    Ok(match vt {
        0 => GVal::U64(b[0] as u64),
        1 => GVal::I64(b[0] as i8 as i64),
        2 => GVal::U64(u16::from_le_bytes([b[0], b[1]]) as u64),
        3 => GVal::I64(i16::from_le_bytes([b[0], b[1]]) as i64),
        4 => GVal::U64(u32::from_le_bytes([b[0], b[1], b[2], b[3]]) as u64),
        5 => GVal::I64(i32::from_le_bytes([b[0], b[1], b[2], b[3]]) as i64),
        6 => GVal::F64(f32::from_le_bytes([b[0], b[1], b[2], b[3]]) as f64),
        7 => GVal::U64((b[0] != 0) as u64),
        10 => GVal::U64(u64::from_le_bytes(b)),
        11 => GVal::I64(i64::from_le_bytes(b)),
        12 => GVal::F64(f64::from_le_bytes(b)),
        _ => GVal::Other,
    })
}

/// Skip a value of `vt` without storing it (used for keys we don't want).
fn skip_value(r: &mut R, vt: u32) -> io::Result<()> {
    if let Some(sz) = scalar_size(vt) {
        r.seek_relative(sz as i64)?;
    } else if vt == 8 {
        let n = u64le(r)?;
        r.seek_relative(n as i64)?;
    } else if vt == 9 {
        skip_array(r)?;
    } else {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "unknown gguf value type",
        ));
    }
    Ok(())
}

fn skip_array(r: &mut R) -> io::Result<()> {
    let elem = u32le(r)?;
    let len = u64le(r)?;
    if let Some(sz) = scalar_size(elem) {
        r.seek_relative((len.saturating_mul(sz)) as i64)?;
    } else if elem == 8 {
        for _ in 0..len {
            let n = u64le(r)?;
            r.seek_relative(n as i64)?;
        }
    } else if elem == 9 {
        for _ in 0..len {
            skip_array(r)?;
        }
    } else {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "unknown gguf array elem",
        ));
    }
    Ok(())
}

pub fn read_metadata(path: &Path) -> Option<GgufMeta> {
    let f = File::open(path).ok()?;
    let mut r = BufReader::new(f);

    let mut magic = [0u8; 4];
    r.read_exact(&mut magic).ok()?;
    if &magic != b"GGUF" {
        return None;
    }
    let version = u32le(&mut r).ok()?;
    if !(2..=3).contains(&version) {
        return None; // v1 has a different layout
    }
    let _tensor_count = u64le(&mut r).ok()?;
    let kv_count = u64le(&mut r).ok()?;

    let mut meta = GgufMeta::default();
    for _ in 0..kv_count {
        let key = read_string(&mut r).ok()?;
        let vt = u32le(&mut r).ok()?;

        let wanted = matches!(
            key.as_str(),
            "general.architecture"
                | "general.name"
                | "general.parameter_count"
                | "general.file_type"
        ) || key.ends_with(".context_length");

        if !wanted {
            skip_value(&mut r, vt).ok()?;
            continue;
        }

        let val = if vt == 8 {
            GVal::Str(read_string(&mut r).ok()?)
        } else if scalar_size(vt).is_some() {
            read_scalar(&mut r, vt).ok()?
        } else {
            // wanted key but array/unknown — skip it, leave as None
            skip_value(&mut r, vt).ok()?;
            GVal::Other
        };

        match key.as_str() {
            "general.architecture" => {
                if let GVal::Str(s) = val {
                    meta.arch = Some(s);
                }
            }
            "general.name" => {
                if let GVal::Str(s) = val {
                    meta.name = Some(s);
                }
            }
            "general.parameter_count" => meta.param_count = val.as_u64(),
            "general.file_type" => meta.file_type = val.as_u64().map(|v| v as u32),
            k if k.ends_with(".context_length") => meta.context_length = val.as_u64(),
            _ => {}
        }
    }
    Some(meta)
}

/// Map a GGUF `general.file_type` to a human quant label.
pub fn file_type_quant(ft: u32) -> Option<&'static str> {
    Some(match ft {
        0 => "F32",
        1 => "F16",
        2 => "Q4_0",
        3 => "Q4_1",
        7 => "Q8_0",
        8 => "Q5_0",
        9 => "Q5_1",
        10 => "Q2_K",
        11 => "Q3_K_S",
        12 => "Q3_K_M",
        13 => "Q3_K_L",
        14 => "Q4_K_S",
        15 => "Q4_K_M",
        16 => "Q5_K_S",
        17 => "Q5_K_M",
        18 => "Q6_K",
        19 => "Q8_K",
        _ => return None,
    })
}

/// Format a parameter count like `7B`, `3.8B`, `335M`.
pub fn fmt_params(n: u64) -> String {
    let nf = n as f64;
    if nf >= 1e9 {
        let v = nf / 1e9;
        if (v.fract()).abs() < 0.05 {
            format!("{v:.0}B")
        } else {
            format!("{v:.1}B")
        }
    } else if nf >= 1e6 {
        format!("{:.0}M", nf / 1e6)
    } else {
        n.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn put_str(buf: &mut Vec<u8>, s: &str) {
        buf.extend_from_slice(&(s.len() as u64).to_le_bytes());
        buf.extend_from_slice(s.as_bytes());
    }
    fn put_kv_str(buf: &mut Vec<u8>, key: &str, val: &str) {
        put_str(buf, key);
        buf.extend_from_slice(&8u32.to_le_bytes()); // STRING
        put_str(buf, val);
    }
    fn put_kv_u64(buf: &mut Vec<u8>, key: &str, val: u64) {
        put_str(buf, key);
        buf.extend_from_slice(&10u32.to_le_bytes()); // UINT64
        buf.extend_from_slice(&val.to_le_bytes());
    }
    fn put_kv_u32(buf: &mut Vec<u8>, key: &str, val: u32) {
        put_str(buf, key);
        buf.extend_from_slice(&4u32.to_le_bytes()); // UINT32
        buf.extend_from_slice(&val.to_le_bytes());
    }

    #[test]
    fn parses_synthetic_gguf() {
        let mut buf = Vec::new();
        buf.extend_from_slice(b"GGUF");
        buf.extend_from_slice(&3u32.to_le_bytes()); // version
        buf.extend_from_slice(&0u64.to_le_bytes()); // tensor_count
        buf.extend_from_slice(&4u64.to_le_bytes()); // kv_count
                                                    // An array KV before our wanted keys, to exercise skipping.
        put_str(&mut buf, "tokenizer.ggml.tokens");
        buf.extend_from_slice(&9u32.to_le_bytes()); // ARRAY
        buf.extend_from_slice(&8u32.to_le_bytes()); // elem STRING
        buf.extend_from_slice(&2u64.to_le_bytes()); // len 2
        put_str(&mut buf, "<s>");
        put_str(&mut buf, "</s>");
        put_kv_str(&mut buf, "general.architecture", "llama");
        put_kv_u64(&mut buf, "general.parameter_count", 7_000_000_000);
        put_kv_u32(&mut buf, "llama.context_length", 4096);

        let dir = std::env::temp_dir().join(format!("gguf-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("m.gguf");
        File::create(&path).unwrap().write_all(&buf).unwrap();

        let meta = read_metadata(&path).expect("parse");
        assert_eq!(meta.arch.as_deref(), Some("llama"));
        assert_eq!(meta.param_count, Some(7_000_000_000));
        assert_eq!(meta.context_length, Some(4096));
        assert_eq!(fmt_params(meta.param_count.unwrap()), "7B");

        let _ = std::fs::remove_dir_all(&dir);
    }
}
