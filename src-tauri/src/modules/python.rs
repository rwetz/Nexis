// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

// Panic-lint gate: no `.unwrap()`/`.expect()` in production code here.
// Tests may still panic (allow-*-in-tests in clippy.toml). CI's
// `clippy -- -D warnings` turns a new one into a build failure.
#![warn(clippy::unwrap_used, clippy::expect_used)]

use crate::modules::proc;
use crate::modules::workspace::{resolve_path, WorkspaceEnv};
use serde::Serialize;
use std::path::{Path, PathBuf};

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
    let mut cmd = proc::command(python_path);
    cmd.arg("--version");
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
            let mut c = proc::command("where");
            c.arg(candidate);
            c
        } else {
            let mut c = proc::command("which");
            c.arg(candidate);
            c
        };
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

/// Interpreter under a WSL workspace's venv, expressed as a *Linux* path.
///
/// The scan itself runs over the host's `\\wsl.localhost\<distro>\…` view of
/// the share — that is the only way the host can see the files — but the path
/// it finds is meaningless inside the distro, and everything downstream
/// (`ml_install`, `wsl.exe --exec`) has to run there. So the found file is
/// re-expressed against the caller's Linux root, the same relativize-and-
/// reattach the fs module's `display_path` does.
fn wsl_linux_python(found: &Path, host_venv: &Path, linux_venv: &str) -> Option<String> {
    let rel = found.strip_prefix(host_venv).ok()?;
    let rel = rel.to_string_lossy().replace('\\', "/");
    Some(format!("{}/{rel}", linux_venv.trim_end_matches('/')))
}

/// The distro's own interpreter, found by asking the distro. `which_python`
/// below searches the *host* PATH, so in a WSL workspace it answers with a
/// Windows `python.exe` that cannot see, install into, or run anything in the
/// distro — which is how the ML Lab ended up offering to install its engine
/// onto the wrong machine.
#[cfg(windows)]
fn wsl_system_python(distro: &str) -> Option<PythonEnv> {
    // Sentinel-wrapped: on a cold distro this call can boot the VM, and the
    // relayed systemd/printk output would otherwise be read as the answer.
    // See `parse_wsl_probe` in workspace.rs.
    let script = format!(
        "py=\"$(command -v python3 || command -v python)\"\n{}",
        crate::modules::workspace::wsl_probe_script("\"$py\"")
    );
    let out = crate::modules::workspace::wsl_exec_capture(distro, "sh", &["-c", &script]).ok()?;
    let path = crate::modules::workspace::parse_wsl_probe_path(&out)?;
    let version = crate::modules::workspace::wsl_exec_capture(distro, &path, &["--version"])
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty());
    Some(PythonEnv {
        name: format!("{distro} system"),
        path: path
            .rsplit_once('/')
            .map_or(String::new(), |(d, _)| d.to_string()),
        python_path: path,
        kind: "system".to_string(),
        version,
    })
}

#[tauri::command]
pub async fn py_detect_envs(
    workspace_root: String,
    workspace: Option<WorkspaceEnv>,
) -> Vec<PythonEnv> {
    let workspace = WorkspaceEnv::from_option(workspace);
    // Scan through the host's view of the workspace (a UNC share under WSL),
    // but report Linux paths so callers spawn the right interpreter.
    let root = resolve_path(&workspace_root, &workspace);
    let linux_root = workspace_root.replace('\\', "/");
    let is_wsl = workspace.is_wsl();
    let mut envs: Vec<PythonEnv> = Vec::new();

    // Local virtualenvs — common names
    let venv_names = [".venv", "venv", "env", ".env"];
    for name in &venv_names {
        let venv_dir = root.join(name);
        if let Some(python_path) = find_python_in_venv(&venv_dir) {
            let linux_venv = format!("{}/{name}", linux_root.trim_end_matches('/'));
            let reported = if is_wsl {
                match wsl_linux_python(&python_path, &venv_dir, &linux_venv) {
                    Some(p) => p,
                    // A venv we cannot express in the distro's terms is worse
                    // than no venv: it would hand the caller a host path to
                    // exec inside WSL. Skip it.
                    None => continue,
                }
            } else {
                python_path.to_string_lossy().into_owned()
            };
            // Prefer fast pyvenv.cfg version read; fall back to subprocess.
            // The subprocess fallback is host-only — a distro's ELF python
            // cannot be exec'd from Windows — so a WSL venv reports whatever
            // pyvenv.cfg says, or nothing.
            let version = read_pyvenv_version(&venv_dir).or_else(|| {
                (!is_wsl)
                    .then(|| get_python_version(&python_path))
                    .flatten()
            });
            envs.push(PythonEnv {
                name: name.to_string(),
                path: if is_wsl {
                    linux_venv
                } else {
                    venv_dir.to_string_lossy().into_owned()
                },
                python_path: reported,
                kind: "venv".to_string(),
                version,
            });
        }
    }

    // Everything below reads the *host*: the host's conda registry and the
    // host's PATH. Under WSL that is the wrong machine, so a distro answers
    // with its own interpreter instead and stops here.
    if is_wsl {
        #[cfg(windows)]
        {
            if let WorkspaceEnv::Wsl { distro } = &workspace {
                if let Some(env) = wsl_system_python(distro) {
                    envs.push(env);
                }
            }
        }
        return envs;
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
