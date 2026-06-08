// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

use crate::modules::proc::hide_console;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Serialize, Clone)]
pub struct PythonEnv {
    pub name: String,
    pub path: String,
    pub python_path: String,
    pub kind: String,
    pub version: Option<String>,
}

fn find_python_in_venv(venv_dir: &Path) -> Option<PathBuf> {
    if !venv_dir.is_dir() {
        return None;
    }
    // Unix layout: bin/python3 or bin/python
    for name in &["python3", "python"] {
        let p = venv_dir.join("bin").join(name);
        if p.exists() {
            return Some(p);
        }
    }
    // Windows layout: Scripts/python.exe
    let win = venv_dir.join("Scripts").join("python.exe");
    if win.exists() {
        return Some(win);
    }
    None
}

fn read_pyvenv_version(venv_dir: &Path) -> Option<String> {
    let cfg_path = venv_dir.join("pyvenv.cfg");
    let content = std::fs::read_to_string(cfg_path).ok()?;
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("version") {
            let parts: Vec<&str> = trimmed.splitn(2, '=').collect();
            if parts.len() == 2 {
                let v = parts[1].trim().to_string();
                if !v.is_empty() {
                    return Some(v);
                }
            }
        }
    }
    None
}

fn get_python_version(python_path: &Path) -> Option<String> {
    let mut cmd = Command::new(python_path);
    cmd.arg("--version");
    hide_console(&mut cmd);
    let output = cmd.output().ok()?;
    // Python 2 prints to stderr, Python 3 to stdout
    let raw = if output.stdout.is_empty() {
        String::from_utf8_lossy(&output.stderr).to_string()
    } else {
        String::from_utf8_lossy(&output.stdout).to_string()
    };
    let v = raw.trim().replace("Python ", "");
    if v.is_empty() {
        None
    } else {
        Some(v)
    }
}

fn which_python() -> Option<PathBuf> {
    let candidates: &[&str] = if cfg!(windows) {
        &["python.exe", "python3.exe"]
    } else {
        &["python3", "python"]
    };
    for candidate in candidates {
        let mut cmd = if cfg!(windows) {
            let mut c = Command::new("where");
            c.arg(candidate);
            c
        } else {
            let mut c = Command::new("which");
            c.arg(candidate);
            c
        };
        hide_console(&mut cmd);
        if let Ok(out) = cmd.output() {
            if out.status.success() {
                if let Some(line) = String::from_utf8_lossy(&out.stdout)
                    .lines()
                    .next()
                    .map(|s| PathBuf::from(s.trim()))
                {
                    if line.exists() {
                        return Some(line);
                    }
                }
            }
        }
    }
    None
}

#[tauri::command]
pub async fn py_detect_envs(workspace_root: String) -> Vec<PythonEnv> {
    let root = PathBuf::from(&workspace_root);
    let mut envs: Vec<PythonEnv> = Vec::new();

    // Local virtualenvs — common names
    let venv_names = [".venv", "venv", "env", ".env"];
    for name in &venv_names {
        let venv_dir = root.join(name);
        if let Some(python_path) = find_python_in_venv(&venv_dir) {
            // Prefer fast pyvenv.cfg version read; fall back to subprocess
            let version =
                read_pyvenv_version(&venv_dir).or_else(|| get_python_version(&python_path));
            envs.push(PythonEnv {
                name: name.to_string(),
                path: venv_dir.to_string_lossy().into_owned(),
                python_path: python_path.to_string_lossy().into_owned(),
                kind: "venv".to_string(),
                version,
            });
        }
    }

    // Conda: parse ~/.conda/environments.txt
    if let Some(home) = dirs::home_dir() {
        let conda_envs_file = home.join(".conda").join("environments.txt");
        if let Ok(content) = std::fs::read_to_string(&conda_envs_file) {
            for line in content.lines() {
                let line = line.trim();
                if line.is_empty() || line.starts_with('#') {
                    continue;
                }
                let env_dir = PathBuf::from(line);
                if let Some(python_path) = find_python_in_venv(&env_dir) {
                    let name = env_dir
                        .file_name()
                        .map(|n| n.to_string_lossy().into_owned())
                        .unwrap_or_else(|| "conda-env".to_string());
                    if envs
                        .iter()
                        .any(|e| e.python_path == python_path.to_string_lossy().as_ref())
                    {
                        continue;
                    }
                    let version = get_python_version(&python_path);
                    envs.push(PythonEnv {
                        name: format!("conda: {}", name),
                        path: env_dir.to_string_lossy().into_owned(),
                        python_path: python_path.to_string_lossy().into_owned(),
                        kind: "conda".to_string(),
                        version,
                    });
                }
            }
        }
    }

    // System Python (as a fallback option)
    if let Some(python_path) = which_python() {
        if !envs
            .iter()
            .any(|e| e.python_path == python_path.to_string_lossy().as_ref())
        {
            let version = get_python_version(&python_path);
            envs.push(PythonEnv {
                name: "system".to_string(),
                path: python_path
                    .parent()
                    .map(|p| p.to_string_lossy().into_owned())
                    .unwrap_or_default(),
                python_path: python_path.to_string_lossy().into_owned(),
                kind: "system".to_string(),
                version,
            });
        }
    }

    envs
}
