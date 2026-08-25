// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

// Panic-lint gate: no `.unwrap()`/`.expect()` in production code here.
// Tests may still panic (allow-*-in-tests in clippy.toml). CI's
// `clippy -- -D warnings` turns a new one into a build failure.
#![warn(clippy::unwrap_used, clippy::expect_used)]

use std::collections::HashMap;
use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};

use portable_pty::CommandBuilder;

use crate::modules::workspace::{self, WorkspaceEnv};

// Shell-integration scripts, embedded at compile time. Used by native Unix
// shells on macOS/Linux and by WSL shells on Windows.
const BASHRC_SCRIPT: &str = include_str!("scripts/bashrc.bash");
const ZSHENV_SCRIPT: &str = include_str!("scripts/zshenv.zsh");
const ZPROFILE_SCRIPT: &str = include_str!("scripts/zprofile.zsh");
const ZLOGIN_SCRIPT: &str = include_str!("scripts/zlogin.zsh");
const ZSHRC_SCRIPT: &str = include_str!("scripts/zshrc.zsh");
const FISH_INIT_SCRIPT: &str = include_str!("scripts/init.fish");

fn integration_root() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or_else(|| "could not resolve home dir".to_string())?;
    let root = home.join(".cache").join("nexis").join("shell-integration");
    fs::create_dir_all(&root).map_err(|e| format!("create {}: {e}", root.display()))?;
    Ok(root)
}

/// Suffix of the staging file an atomic script write commits from. Shared so
/// the WSL fallback can derive the staging file's *Linux* name from the
/// target's without parsing a host path.
const TMP_SUFFIX: &str = ".__nexis_tmp__";

/// Skips the write when content is unchanged (pitfall #6: the cache only
/// refreshes when the embedded script actually differs) and replaces the file
/// atomically so a parallel shell startup never sources a half-written file.
///
/// `commit` performs the final rename. It is a parameter because a script
/// written *into a WSL distro* cannot commit with `fs::rename` — see
/// `windows::write_wsl_script` and pitfall #17.
fn write_if_changed_with(
    path: &Path,
    content: &str,
    commit: impl FnOnce(&Path, &Path) -> Result<(), String>,
) -> Result<(), String> {
    if let Ok(existing) = fs::read_to_string(path) {
        if existing == content {
            return Ok(());
        }
    }
    let mut tmp: OsString = path.as_os_str().to_owned();
    tmp.push(TMP_SUFFIX);
    let tmp = PathBuf::from(tmp);
    fs::write(&tmp, content).map_err(|e| format!("write {}: {e}", tmp.display()))?;
    match commit(&tmp, path) {
        Ok(()) => Ok(()),
        Err(e) => {
            let _ = fs::remove_file(&tmp);
            Err(e)
        }
    }
}

/// `write_if_changed_with` committing through an ordinary in-process rename —
/// correct for every path that is genuinely local (app cache, PS profile).
fn write_if_changed(path: &Path, content: &str) -> Result<(), String> {
    write_if_changed_with(path, content, |tmp, dest| {
        fs::rename(tmp, dest)
            .map_err(|e| format!("rename {} -> {}: {e}", tmp.display(), dest.display()))
    })
}

pub fn build_command(
    cwd: Option<String>,
    workspace: WorkspaceEnv,
    extra_env: HashMap<String, String>,
    shell_override: Option<String>,
) -> Result<CommandBuilder, String> {
    let shell_override = sanitize_shell_override(shell_override);
    #[cfg(unix)]
    {
        let _ = workspace;
        let mut cmd = unix::build(cwd, shell_override)?;
        for (k, v) in extra_env {
            cmd.env(k, v);
        }
        Ok(cmd)
    }
    #[cfg(windows)]
    {
        // A WSL session's child is `wsl.exe`, and Windows environment variables
        // do not cross into the distro (that needs `WSLENV`, or an explicit
        // assignment on the Linux side). Setting them here would have looked
        // right and done nothing, so the WSL builder takes `extra_env` and
        // splices it into the `--exec env NAME=VALUE …` prefix instead.
        let is_wsl = workspace.is_wsl();
        let mut cmd = windows::build(cwd, workspace, shell_override, &extra_env)?;
        if !is_wsl {
            for (k, v) in extra_env {
                cmd.env(k, v);
            }
        }
        Ok(cmd)
    }
}

/// The user's "default shell" preference. Only honored when it names an
/// existing file — a typo'd path falls back to auto-detection instead of
/// spawning a shell that instantly fails (which renders as the pitfall-#1
/// blank terminal). Empty/whitespace means "auto-detect".
fn sanitize_shell_override(shell: Option<String>) -> Option<String> {
    let s = shell?.trim().to_string();
    if s.is_empty() {
        return None;
    }
    if std::path::Path::new(&s).is_file() {
        Some(s)
    } else {
        log::warn!("default shell '{s}' not found; falling back to auto-detection");
        None
    }
}

fn ensure_utf8_locale(cmd: &mut CommandBuilder) {
    let is_utf8 = |v: &str| {
        let up = v.to_ascii_uppercase();
        up.contains("UTF-8") || up.contains("UTF8")
    };
    let already_utf8 = ["LC_ALL", "LC_CTYPE", "LANG"]
        .iter()
        .any(|k| std::env::var(k).ok().as_deref().is_some_and(is_utf8));
    if already_utf8 {
        return;
    }
    #[cfg(target_os = "macos")]
    let fallback = "en_US.UTF-8";
    #[cfg(all(unix, not(target_os = "macos")))]
    let fallback = "C.UTF-8";
    #[cfg(windows)]
    let fallback = "en_US.UTF-8";
    cmd.env("LANG", fallback);
}

fn apply_common(cmd: &mut CommandBuilder, cwd: Option<String>) {
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd.env("NEXIS_TERMINAL", "1");
    ensure_utf8_locale(cmd);

    let resolved_cwd = cwd
        .map(PathBuf::from)
        .filter(|p| p.is_dir())
        .or_else(|| workspace::launch_cwd_snapshot().filter(|p| p.is_dir()))
        .or_else(|| dirs::home_dir().filter(|p| p.is_dir()));
    if let Some(cwd) = resolved_cwd {
        #[cfg(windows)]
        let cwd = {
            let s = cwd.to_string_lossy();
            // Strip the Windows `\\?\` extended-length prefix before handing
            // the cwd to ConPTY. If this prefix reaches PowerShell it renders
            // the full provider path in the prompt instead of the normal
            // `PS C:\Users\Ryan>` form:
            //   PS Microsoft.PowerShell.Core\FileSystem::\\?\C:\Users\Ryan>
            let s = s.strip_prefix(r"\\?\").unwrap_or(&s);
            PathBuf::from(s.replace('/', "\\"))
        };
        log::info!("pty cwd: {}", cwd.display());
        cmd.cwd(cwd);
    } else {
        log::warn!("pty cwd: no usable directory, inheriting from process");
    }
}

#[cfg(unix)]
mod unix {
    use std::fs;
    use std::path::{Path, PathBuf};

    use portable_pty::CommandBuilder;

    use super::{integration_root, write_if_changed};

    pub enum Shell {
        Zsh,
        Bash,
        Fish,
        Other,
    }

    impl Shell {
        pub fn detect(shell_override: Option<String>) -> (Shell, String) {
            // A user-set default shell (already validated to exist) wins over
            // the login shell / $SHELL detection order. It still gets shell
            // integration when it's a shell we know.
            let path = shell_override
                .or_else(login_shell)
                .or_else(|| std::env::var("SHELL").ok())
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| "/bin/zsh".into());
            let name = path.rsplit('/').next().unwrap_or("").to_string();
            let shell = match name.as_str() {
                "zsh" => Shell::Zsh,
                "bash" => Shell::Bash,
                "fish" => Shell::Fish,
                _ => Shell::Other,
            };
            (shell, path)
        }
    }

    fn login_shell() -> Option<String> {
        use std::ffi::CStr;
        unsafe {
            let uid = libc::getuid();
            let pw = libc::getpwuid(uid);
            if pw.is_null() {
                return None;
            }
            let shell_ptr = (*pw).pw_shell;
            if shell_ptr.is_null() {
                return None;
            }
            CStr::from_ptr(shell_ptr).to_str().ok().map(String::from)
        }
    }

    pub fn build(
        cwd: Option<String>,
        shell_override: Option<String>,
    ) -> Result<CommandBuilder, String> {
        let (shell, shell_path) = Shell::detect(shell_override);
        let mut cmd = CommandBuilder::new(&shell_path);
        super::apply_common(&mut cmd, cwd);

        match shell {
            Shell::Zsh => {
                match prepare_zdotdir() {
                    Ok(zdotdir) => {
                        // Guard against Nexis-in-Nexis :)
                        if let Ok(user_zd) = std::env::var("ZDOTDIR") {
                            if Path::new(&user_zd) != zdotdir.as_path() {
                                cmd.env("NEXIS_USER_ZDOTDIR", user_zd);
                            }
                        }
                        cmd.env("ZDOTDIR", &zdotdir);
                    }
                    Err(e) => {
                        log::warn!("zsh shell integration disabled: {e}");
                    }
                }
                // Login shell so /etc/zprofile runs path_helper on macOS — without
                // this, GUI-launched apps get a minimal PATH missing Homebrew.
                cmd.arg("-l");
            }
            Shell::Bash => {
                match prepare_bash_rcfile() {
                    Ok(rc) => {
                        cmd.arg("--rcfile");
                        cmd.arg(rc);
                    }
                    Err(e) => {
                        log::warn!("bash shell integration disabled: {e}");
                    }
                }
                // bash ignores --rcfile under -l, so we use -i and source
                // /etc/profile from inside our rcfile to emulate login init.
                cmd.arg("-i");
            }
            Shell::Fish => {
                if let Err(e) = prepare_fish_conf_d() {
                    log::warn!("fish shell integration disabled: {e}");
                }
                cmd.arg("-i");
            }
            Shell::Other => {
                log::info!(
                    "unsupported shell '{}', spawning without integration",
                    shell_path
                );
            }
        }
        Ok(cmd)
    }

    fn prepare_zdotdir() -> Result<PathBuf, String> {
        let dir = integration_root()?.join("zsh");
        fs::create_dir_all(&dir).map_err(|e| format!("create {}: {e}", dir.display()))?;
        write_if_changed(&dir.join(".zshenv"), super::ZSHENV_SCRIPT)?;
        write_if_changed(&dir.join(".zprofile"), super::ZPROFILE_SCRIPT)?;
        write_if_changed(&dir.join(".zshrc"), super::ZSHRC_SCRIPT)?;
        write_if_changed(&dir.join(".zlogin"), super::ZLOGIN_SCRIPT)?;
        Ok(dir)
    }

    fn prepare_bash_rcfile() -> Result<PathBuf, String> {
        let dir = integration_root()?.join("bash");
        fs::create_dir_all(&dir).map_err(|e| format!("create {}: {e}", dir.display()))?;
        let rc = dir.join("bashrc");
        write_if_changed(&rc, super::BASHRC_SCRIPT)?;
        Ok(rc)
    }

    fn prepare_fish_conf_d() -> Result<(), String> {
        let home = dirs::home_dir().ok_or_else(|| "could not resolve home dir".to_string())?;
        let dir = home.join(".config").join("fish").join("conf.d");
        fs::create_dir_all(&dir).map_err(|e| format!("create {}: {e}", dir.display()))?;
        write_if_changed(&dir.join("nexis.fish"), super::FISH_INIT_SCRIPT)?;
        Ok(())
    }
}

#[cfg(windows)]
mod windows {
    use std::collections::HashMap;
    use std::fs;
    use std::path::{Path, PathBuf};

    use crate::modules::workspace::{self, WorkspaceEnv};
    use portable_pty::CommandBuilder;

    use super::{integration_root, write_if_changed};

    const PROFILE_PS1: &str = include_str!("scripts/profile.ps1");

    #[derive(Clone, Copy, Debug, Eq, PartialEq)]
    enum ShellKind {
        Zsh,
        Bash,
        Fish,
        Other,
    }

    impl ShellKind {
        fn from_path(path: &str) -> Self {
            match path.rsplit('/').next().unwrap_or("") {
                "zsh" => Self::Zsh,
                "bash" => Self::Bash,
                "fish" => Self::Fish,
                _ => Self::Other,
            }
        }
    }

    #[derive(Clone, Debug, Eq, PartialEq)]
    enum WslShellIntegration {
        Zsh {
            zdotdir: String,
            user_zdotdir: Option<String>,
        },
        Bash {
            rcfile: String,
        },
        Fish,
        None,
    }

    #[derive(Clone, Debug, Eq, PartialEq)]
    struct WslLaunchSpec {
        args: Vec<String>,
    }

    pub fn build(
        cwd: Option<String>,
        workspace: WorkspaceEnv,
        shell_override: Option<String>,
        extra_env: &HashMap<String, String>,
    ) -> Result<CommandBuilder, String> {
        if let WorkspaceEnv::Wsl { distro } = workspace {
            // WSL sessions use the distro's login shell; the host-side default
            // shell preference does not apply inside the distro.
            return build_wsl(cwd, distro, extra_env);
        }
        let shell_path = shell_override
            .map(std::path::PathBuf::from)
            .unwrap_or_else(super::windows_shell_path);
        let shell_name = shell_path
            .file_name()
            .and_then(|s| s.to_str())
            .map(|s| s.to_ascii_lowercase())
            .unwrap_or_default();
        let is_powershell = shell_name == "pwsh.exe" || shell_name == "powershell.exe";

        let mut cmd = CommandBuilder::new(&shell_path);
        super::apply_common(&mut cmd, cwd);

        if is_powershell {
            match prepare_ps_profile() {
                Ok(profile) => {
                    // Pass the profile path via env var so the command string
                    // needs no quoting, and PowerShell stays in interactive
                    // mode from the very first byte (avoiding the script-mode →
                    // interactive-mode transition that -File causes, which races
                    // with ConPTY output stream initialization on Windows).
                    cmd.env("NEXIS_PWSH_PROFILE", profile.as_os_str());
                    cmd.arg("-NoLogo");
                    cmd.arg("-NoExit");
                    cmd.arg("-ExecutionPolicy");
                    cmd.arg("Bypass");
                    cmd.arg("-Command");
                    cmd.arg("if ($env:NEXIS_PWSH_PROFILE) { . $env:NEXIS_PWSH_PROFILE }");
                }
                Err(e) => {
                    log::warn!("powershell shell integration disabled: {e}");
                }
            }
        } else {
            log::info!("spawning {} without shell integration", shell_name);
        }

        log::info!("spawning Windows shell: {}", shell_path.display());
        Ok(cmd)
    }

    /// Environment assignments to splice into the distro-side `env` prefix.
    ///
    /// `TERM`/`COLORTERM`/`NEXIS_TERMINAL` are set on `wsl.exe` too, but that
    /// only configures `wsl.exe` itself — nothing set on the Windows side
    /// reaches the Linux shell. Without this, WSL terminals ran with whatever
    /// `TERM` WSL picked and *no* `COLORTERM` at all, so truecolor detection
    /// failed inside the distro, and the user's own terminal environment
    /// variables (Settings -> General) silently did nothing there.
    ///
    /// `LANG` is deliberately not forwarded: `ensure_utf8_locale` derives it
    /// from the *host* environment, and a distro with a correctly configured
    /// locale should keep it.
    fn wsl_env_assignments(extra_env: &HashMap<String, String>) -> Vec<String> {
        let mut out = vec![
            "TERM=xterm-256color".to_string(),
            "COLORTERM=truecolor".to_string(),
            "NEXIS_TERMINAL=1".to_string(),
        ];
        // Sorted so the argv is deterministic across runs (HashMap order is
        // not) — it shows up in logs and in the launch-spec tests.
        let mut keys: Vec<&String> = extra_env.keys().collect();
        keys.sort();
        for key in keys {
            if !is_env_name(key) {
                log::warn!("skipping terminal env var with unusable name: {key}");
                continue;
            }
            let value = &extra_env[key];
            // A NUL cannot survive being passed as a process argument on any
            // platform (pitfall #16) — `spawn` would reject the whole command
            // and the terminal would come up blank.
            if value.contains('\0') {
                log::warn!("skipping terminal env var {key}: value contains a NUL byte");
                continue;
            }
            out.push(format!("{key}={value}"));
        }
        out
    }

    /// A name `env NAME=VALUE` will actually set. Anything with an `=` in it
    /// would be parsed as part of the previous assignment's value.
    fn is_env_name(name: &str) -> bool {
        !name.is_empty()
            && !name.starts_with(|c: char| c.is_ascii_digit())
            && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
    }

    fn build_wsl(
        cwd: Option<String>,
        distro: String,
        extra_env: &HashMap<String, String>,
    ) -> Result<CommandBuilder, String> {
        crate::modules::workspace::validate_wsl_distro_name(&distro)?;
        let shell_path = crate::modules::workspace::wsl_login_shell(distro.clone())?;
        let shell_kind = ShellKind::from_path(&shell_path);
        let integration = match shell_kind {
            ShellKind::Zsh => match prepare_wsl_zdotdir(&distro) {
                Ok(zdotdir) => {
                    let user_zdotdir = match probe_wsl_zdotdir(&distro, &shell_path) {
                        Ok(path) => path.filter(|p| *p != zdotdir),
                        Err(e) => {
                            log::warn!("WSL zsh ZDOTDIR probe failed for {distro}: {e}");
                            None
                        }
                    };
                    WslShellIntegration::Zsh {
                        zdotdir,
                        user_zdotdir,
                    }
                }
                Err(e) => {
                    log::warn!("WSL zsh shell integration disabled for {distro}: {e}");
                    WslShellIntegration::None
                }
            },
            ShellKind::Bash => match prepare_wsl_bash_rcfile(&distro) {
                Ok(rcfile) => WslShellIntegration::Bash { rcfile },
                Err(e) => {
                    log::warn!("WSL bash shell integration disabled for {distro}: {e}");
                    WslShellIntegration::None
                }
            },
            ShellKind::Fish => match prepare_wsl_fish_conf_d(&distro) {
                Ok(()) => WslShellIntegration::Fish,
                Err(e) => {
                    log::warn!("WSL fish shell integration disabled for {distro}: {e}");
                    WslShellIntegration::None
                }
            },
            ShellKind::Other => {
                log::info!(
                    "unsupported WSL shell '{}', spawning without integration",
                    shell_path
                );
                WslShellIntegration::None
            }
        };
        let spec = build_wsl_launch_spec(
            cwd.as_deref(),
            &distro,
            &shell_path,
            shell_kind,
            integration,
            wsl_env_assignments(extra_env),
        );
        let mut cmd = CommandBuilder::new("wsl.exe");
        for arg in &spec.args {
            cmd.arg(arg);
        }
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");
        cmd.env("NEXIS_TERMINAL", "1");
        super::ensure_utf8_locale(&mut cmd);
        log::info!("spawning WSL shell: {distro} ({shell_path})");
        Ok(cmd)
    }

    /// A `--cd` value `wsl.exe` will actually honour.
    ///
    /// The cwd arrives from the frontend, which stamps it from whatever the
    /// workspace last tracked. A value that is not POSIX-absolute means the
    /// two sides disagree about which machine we are on, and handing it to
    /// `--cd` starts the shell somewhere arbitrary (or fails outright). `~` is
    /// the safe answer — same rule the pitfall-#17 `mv` fallback applies before
    /// handing a path to the Linux side.
    fn wsl_launch_cwd(cwd: Option<&str>) -> String {
        match cwd.map(str::trim).filter(|s| !s.is_empty()) {
            Some(c) if c.starts_with('/') => c.to_string(),
            Some(c) => {
                log::warn!("WSL cwd {c:?} is not a Linux path; starting in the home directory");
                "~".to_string()
            }
            None => "~".to_string(),
        }
    }

    fn build_wsl_launch_spec(
        cwd: Option<&str>,
        distro: &str,
        shell_path: &str,
        shell_kind: ShellKind,
        integration: WslShellIntegration,
        mut env_assignments: Vec<String>,
    ) -> WslLaunchSpec {
        let mut args = vec![
            "-d".to_string(),
            distro.to_string(),
            "--cd".to_string(),
            wsl_launch_cwd(cwd),
            "--exec".to_string(),
        ];
        // Integration variables go last so they win over anything the user
        // configured under the same name — ZDOTDIR in particular is how the
        // integration gets loaded at all.
        let mut shell_args: Vec<String> = Vec::new();
        match (shell_kind, integration) {
            (
                ShellKind::Zsh,
                WslShellIntegration::Zsh {
                    zdotdir,
                    user_zdotdir,
                },
            ) => {
                if let Some(user_zdotdir) = user_zdotdir {
                    env_assignments.push(format!("NEXIS_USER_ZDOTDIR={user_zdotdir}"));
                }
                env_assignments.push(format!("ZDOTDIR={zdotdir}"));
                shell_args.push(shell_path.to_string());
                shell_args.push("-l".to_string());
            }
            (ShellKind::Bash, WslShellIntegration::Bash { rcfile }) => {
                shell_args.push(shell_path.to_string());
                shell_args.push("--rcfile".to_string());
                shell_args.push(rcfile);
                shell_args.push("-i".to_string());
            }
            (ShellKind::Fish, WslShellIntegration::Fish) => {
                shell_args.push(shell_path.to_string());
                shell_args.push("-i".to_string());
            }
            (ShellKind::Zsh, WslShellIntegration::None) => {
                shell_args.push(shell_path.to_string());
                shell_args.push("-l".to_string());
            }
            (ShellKind::Bash, WslShellIntegration::None)
            | (ShellKind::Fish, WslShellIntegration::None) => {
                shell_args.push(shell_path.to_string());
                shell_args.push("-i".to_string());
            }
            (ShellKind::Other, _) => shell_args.push(shell_path.to_string()),
            _ => {
                shell_args.push(shell_path.to_string());
            }
        }
        if !env_assignments.is_empty() {
            args.push("env".to_string());
            args.append(&mut env_assignments);
        }
        args.append(&mut shell_args);
        WslLaunchSpec { args }
    }

    /// The user's own `ZDOTDIR` inside the distro, or `None` when they have
    /// none (or the probe came back unreadable).
    ///
    /// Sentinel-wrapped like every other WSL probe: this one runs the user's
    /// *zsh*, so it carries both hazards — a chatty `.zshenv` and, on a cold
    /// distro, the relayed boot log. See `parse_wsl_probe` in workspace.rs.
    fn probe_wsl_zdotdir(distro: &str, shell_path: &str) -> Result<Option<String>, String> {
        let script = workspace::wsl_probe_script(r#""${ZDOTDIR:-$HOME}""#);
        let out = workspace::wsl_exec_capture(distro, shell_path, &["-c", &script])?;
        Ok(workspace::parse_wsl_probe_path(&out))
    }

    /// Write a shell-integration script that lives *inside* a WSL distro.
    ///
    /// Pitfall #17, third occurrence — and the one CLAUDE.md explicitly (and
    /// wrongly) exempted: the atomic write ends in `fs::rename`, which the WSL
    /// 9P redirector behind `\\wsl.localhost\<distro>\…` rejects with
    /// ERROR_NOT_SAME_DEVICE (os error 17, *not* the Linux `EEXIST` the number
    /// looks like) even though staging file and target share one directory.
    /// Every WSL integration install failed on that rename, so `build_wsl` fell
    /// through to `WslShellIntegration::None`: no OSC 7, no OSC 133, and so no
    /// cwd tracking at all — the file tree stayed pinned to whatever root the
    /// session opened with, listing that whole folder no matter where the shell
    /// `cd`'d.
    ///
    /// Ordering mirrors the `fs_rename` / `fs_write_file` fallbacks: the
    /// in-process rename runs first, because a home directory reached through
    /// `/mnt/<drive>` maps to a native Windows path where it works, and a
    /// stopped distro must not break a write that would have succeeded.
    fn write_wsl_script(
        distro: &str,
        linux_path: &str,
        unc_path: &Path,
        content: &str,
    ) -> Result<(), String> {
        super::write_if_changed_with(unc_path, content, |tmp, dest| {
            let direct = match fs::rename(tmp, dest) {
                Ok(()) => return Ok(()),
                Err(e) => e,
            };
            // The staging file sits next to the target, so its Linux path is
            // the target's plus the same suffix. Derive it from the *caller's*
            // Linux path — the UNC string means nothing inside the distro —
            // and refuse anything that is not POSIX-absolute so a mislabelled
            // path can never hand `mv` a drive path.
            if !linux_path.starts_with('/') {
                return Err(format!(
                    "rename {} -> {}: {direct}",
                    tmp.display(),
                    dest.display()
                ));
            }
            let staged_linux = format!("{linux_path}{}", super::TMP_SUFFIX);
            workspace::wsl_exec_capture(distro, "mv", &["--", &staged_linux, linux_path])
                .map(|_| ())
                .map_err(|e| {
                    format!("install {linux_path} in {distro}: {e} (direct rename: {direct})")
                })
        })
    }

    fn prepare_wsl_integration_dir(distro: &str, shell: &str) -> Result<(String, PathBuf), String> {
        let home = crate::modules::workspace::wsl_home_blocking(distro.to_string())?;
        let linux_dir = format!(
            "{}/.cache/nexis/shell-integration/{shell}",
            home.trim_end_matches('/')
        );
        let unc_dir = crate::modules::workspace::wsl_path_to_unc(distro, &linux_dir);
        fs::create_dir_all(&unc_dir).map_err(|e| format!("create {}: {e}", unc_dir.display()))?;
        Ok((linux_dir, unc_dir))
    }

    fn normalize_script(content: &str) -> String {
        content.replace("\r\n", "\n")
    }

    fn prepare_wsl_zdotdir(distro: &str) -> Result<String, String> {
        let (linux_dir, unc_dir) = prepare_wsl_integration_dir(distro, "zsh")?;
        for (name, script) in [
            (".zshenv", super::ZSHENV_SCRIPT),
            (".zprofile", super::ZPROFILE_SCRIPT),
            (".zshrc", super::ZSHRC_SCRIPT),
            (".zlogin", super::ZLOGIN_SCRIPT),
        ] {
            write_wsl_script(
                distro,
                &format!("{linux_dir}/{name}"),
                &unc_dir.join(name),
                &normalize_script(script),
            )?;
        }
        Ok(linux_dir)
    }

    fn prepare_wsl_bash_rcfile(distro: &str) -> Result<String, String> {
        let (linux_dir, _unc_dir) = prepare_wsl_integration_dir(distro, "bash")?;
        let linux_rc = format!("{linux_dir}/bashrc");
        let unc_file = crate::modules::workspace::wsl_path_to_unc(distro, &linux_rc);
        let content = normalize_script(super::BASHRC_SCRIPT);
        write_wsl_script(distro, &linux_rc, &unc_file, &content)?;
        Ok(linux_rc)
    }

    fn prepare_wsl_fish_conf_d(distro: &str) -> Result<(), String> {
        let home = crate::modules::workspace::wsl_home_blocking(distro.to_string())?;
        let linux_dir = format!("{}/.config/fish/conf.d", home.trim_end_matches('/'));
        let unc_dir = crate::modules::workspace::wsl_path_to_unc(distro, &linux_dir);
        fs::create_dir_all(&unc_dir).map_err(|e| format!("create {}: {e}", unc_dir.display()))?;
        let linux_file = format!("{linux_dir}/nexis.fish");
        let unc_file = unc_dir.join("nexis.fish");
        let content = normalize_script(super::FISH_INIT_SCRIPT);
        write_wsl_script(distro, &linux_file, &unc_file, &content)?;
        Ok(())
    }

    fn prepare_ps_profile() -> Result<PathBuf, String> {
        let dir = integration_root()?.join("powershell");
        fs::create_dir_all(&dir).map_err(|e| format!("create {}: {e}", dir.display()))?;
        let file = dir.join("profile.ps1");
        write_if_changed(&file, PROFILE_PS1)?;
        Ok(file)
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        /// The env prefix every WSL launch now carries. Nothing set on the
        /// `wsl.exe` side reaches the Linux shell, so these have to travel as
        /// `env NAME=VALUE` arguments.
        const BASE_ENV: [&str; 3] = [
            "TERM=xterm-256color",
            "COLORTERM=truecolor",
            "NEXIS_TERMINAL=1",
        ];

        fn no_extra_env() -> Vec<String> {
            wsl_env_assignments(&HashMap::new())
        }

        /// `-d Ubuntu --cd <cwd> --exec env <BASE_ENV> <tail…>`
        fn expected(cwd: &str, tail: &[&str]) -> Vec<String> {
            expected_for("Ubuntu", cwd, tail)
        }

        /// As `expected`, for a distro other than the `Ubuntu` default.
        fn expected_for(distro: &str, cwd: &str, tail: &[&str]) -> Vec<String> {
            let mut out: Vec<String> = ["-d", distro, "--cd", cwd, "--exec", "env"]
                .iter()
                .map(|s| s.to_string())
                .collect();
            out.extend(BASE_ENV.iter().map(|s| s.to_string()));
            out.extend(tail.iter().map(|s| s.to_string()));
            out
        }

        #[test]
        fn builds_wsl_zsh_launch_spec_with_env_and_login() {
            let spec = build_wsl_launch_spec(
                Some("/home/vinicios/repo"),
                "Ubuntu",
                "/usr/bin/zsh",
                ShellKind::Zsh,
                WslShellIntegration::Zsh {
                    zdotdir: "/home/vinicios/.cache/nexis/shell-integration/zsh".into(),
                    user_zdotdir: None,
                },
                no_extra_env(),
            );
            assert_eq!(
                spec.args,
                expected(
                    "/home/vinicios/repo",
                    &[
                        "ZDOTDIR=/home/vinicios/.cache/nexis/shell-integration/zsh",
                        "/usr/bin/zsh",
                        "-l",
                    ]
                )
            );
        }

        #[test]
        fn builds_wsl_zsh_launch_spec_with_user_zdotdir_probe() {
            let spec = build_wsl_launch_spec(
                Some("/home/vinicios/repo"),
                "Ubuntu",
                "/usr/bin/zsh",
                ShellKind::Zsh,
                WslShellIntegration::Zsh {
                    zdotdir: "/home/vinicios/.cache/nexis/shell-integration/zsh".into(),
                    user_zdotdir: Some("/home/vinicios/.config/zsh".into()),
                },
                no_extra_env(),
            );
            assert_eq!(
                spec.args,
                expected(
                    "/home/vinicios/repo",
                    &[
                        "NEXIS_USER_ZDOTDIR=/home/vinicios/.config/zsh",
                        "ZDOTDIR=/home/vinicios/.cache/nexis/shell-integration/zsh",
                        "/usr/bin/zsh",
                        "-l",
                    ]
                )
            );
        }

        #[test]
        fn builds_wsl_zsh_launch_spec_without_integration_still_uses_login_shell() {
            let spec = build_wsl_launch_spec(
                Some("/home/vinicios/repo"),
                "Ubuntu",
                "/usr/bin/zsh",
                ShellKind::Zsh,
                WslShellIntegration::None,
                no_extra_env(),
            );
            assert_eq!(
                spec.args,
                expected("/home/vinicios/repo", &["/usr/bin/zsh", "-l"])
            );
        }

        #[test]
        fn builds_wsl_bash_launch_spec_with_rcfile() {
            let spec = build_wsl_launch_spec(
                Some("/home/vinicios/repo"),
                "Ubuntu",
                "/bin/bash",
                ShellKind::Bash,
                WslShellIntegration::Bash {
                    rcfile: "/home/vinicios/.cache/nexis/shell-integration/bash/bashrc".into(),
                },
                no_extra_env(),
            );
            assert_eq!(
                spec.args,
                expected(
                    "/home/vinicios/repo",
                    &[
                        "/bin/bash",
                        "--rcfile",
                        "/home/vinicios/.cache/nexis/shell-integration/bash/bashrc",
                        "-i",
                    ]
                )
            );
        }

        #[test]
        fn builds_wsl_fish_launch_spec_without_init_command() {
            let spec = build_wsl_launch_spec(
                Some("/home/vinicios/repo"),
                "Ubuntu",
                "/usr/bin/fish",
                ShellKind::Fish,
                WslShellIntegration::Fish,
                no_extra_env(),
            );
            assert_eq!(
                spec.args,
                expected("/home/vinicios/repo", &["/usr/bin/fish", "-i"])
            );
        }

        #[test]
        fn builds_wsl_other_shell_without_integration() {
            let spec = build_wsl_launch_spec(
                None,
                "Ubuntu",
                "/usr/bin/nu",
                ShellKind::Other,
                WslShellIntegration::None,
                no_extra_env(),
            );
            assert_eq!(spec.args, expected("~", &["/usr/bin/nu"]));
        }

        // ── env passthrough ───────────────────────────────────────────────

        #[test]
        fn user_env_vars_reach_the_distro_sorted_and_before_integration_vars() {
            let mut extra = HashMap::new();
            extra.insert("ZED".to_string(), "z".to_string());
            extra.insert("ALPHA".to_string(), "a".to_string());
            let spec = build_wsl_launch_spec(
                Some("/home/vinicios/repo"),
                "Ubuntu",
                "/usr/bin/zsh",
                ShellKind::Zsh,
                WslShellIntegration::Zsh {
                    zdotdir: "/zd".into(),
                    user_zdotdir: None,
                },
                wsl_env_assignments(&extra),
            );
            assert_eq!(
                spec.args,
                expected(
                    "/home/vinicios/repo",
                    &["ALPHA=a", "ZED=z", "ZDOTDIR=/zd", "/usr/bin/zsh", "-l"]
                )
            );
        }

        #[test]
        fn env_names_that_env_cannot_set_are_skipped() {
            let mut extra = HashMap::new();
            extra.insert("GOOD_ONE".to_string(), "1".to_string());
            extra.insert("BAD=NAME".to_string(), "1".to_string());
            extra.insert("2LEADING_DIGIT".to_string(), "1".to_string());
            extra.insert("has space".to_string(), "1".to_string());
            extra.insert(String::new(), "1".to_string());
            extra.insert("NUL_VALUE".to_string(), "a\0b".to_string());
            let assignments = wsl_env_assignments(&extra);
            assert_eq!(
                assignments,
                vec![
                    "TERM=xterm-256color".to_string(),
                    "COLORTERM=truecolor".to_string(),
                    "NEXIS_TERMINAL=1".to_string(),
                    "GOOD_ONE=1".to_string(),
                ]
            );
        }

        // ── --cd guard ────────────────────────────────────────────────────

        /// A Windows path here means the frontend and the backend disagree
        /// about which machine the workspace is on. Starting at `~` is
        /// recoverable; handing `wsl.exe` a drive path is not.
        #[test]
        fn a_non_linux_cwd_falls_back_to_home() {
            assert_eq!(wsl_launch_cwd(Some("C:/Users/Ryan")), "~");
            assert_eq!(
                wsl_launch_cwd(Some(r"\\wsl.localhost\Ubuntu\home\ryan")),
                "~"
            );
            assert_eq!(wsl_launch_cwd(Some("")), "~");
            assert_eq!(wsl_launch_cwd(Some("   ")), "~");
            assert_eq!(wsl_launch_cwd(None), "~");
            assert_eq!(wsl_launch_cwd(Some("/home/ryan")), "/home/ryan");
        }

        // ── normalize_script ──────────────────────────────────────────────

        #[test]
        fn normalize_script_replaces_crlf_with_lf() {
            assert_eq!(normalize_script("line1\r\nline2\r\n"), "line1\nline2\n");
        }

        #[test]
        fn normalize_script_leaves_lf_unchanged() {
            assert_eq!(normalize_script("line1\nline2\n"), "line1\nline2\n");
        }

        #[test]
        fn normalize_script_handles_mixed_line_endings() {
            assert_eq!(normalize_script("a\r\nb\nc\r\n"), "a\nb\nc\n");
        }

        // ── ShellKind ─────────────────────────────────────────────────────

        #[test]
        fn shell_kind_from_path_detects_zsh() {
            assert_eq!(ShellKind::from_path("/usr/bin/zsh"), ShellKind::Zsh);
        }

        #[test]
        fn shell_kind_from_path_detects_bash() {
            assert_eq!(ShellKind::from_path("/bin/bash"), ShellKind::Bash);
        }

        #[test]
        fn shell_kind_from_path_detects_fish() {
            assert_eq!(ShellKind::from_path("/usr/bin/fish"), ShellKind::Fish);
        }

        #[test]
        fn shell_kind_from_path_returns_other_for_unknown_shell() {
            assert_eq!(ShellKind::from_path("/usr/bin/nu"), ShellKind::Other);
        }

        #[test]
        fn shell_kind_from_path_returns_other_for_empty() {
            assert_eq!(ShellKind::from_path(""), ShellKind::Other);
        }

        #[test]
        fn builds_wsl_launch_spec_with_empty_cwd_falls_back_to_home() {
            let spec = build_wsl_launch_spec(
                Some(""),
                "Ubuntu",
                "/usr/bin/zsh",
                ShellKind::Zsh,
                WslShellIntegration::None,
                no_extra_env(),
            );
            assert_eq!(spec.args, expected("~", &["/usr/bin/zsh", "-l"]));
        }

        #[test]
        fn builds_wsl_launch_spec_treats_whitespace_cwd_as_unset() {
            // Matches authorize_spawn_cwd's semantics: "   " is no directory.
            let spec = build_wsl_launch_spec(
                Some("   "),
                "Ubuntu",
                "/bin/bash",
                ShellKind::Bash,
                WslShellIntegration::None,
                no_extra_env(),
            );
            assert_eq!(&spec.args[3], "~");
        }

        #[test]
        fn builds_wsl_bash_launch_spec_without_integration_still_interactive() {
            let spec = build_wsl_launch_spec(
                Some("/tmp"),
                "Debian-test.distro",
                "/bin/bash",
                ShellKind::Bash,
                WslShellIntegration::None,
                no_extra_env(),
            );
            // A dotted/dashed distro name must pass through untouched, and a
            // bash whose rcfile install failed still gets an interactive shell.
            assert_eq!(
                spec.args,
                expected_for("Debian-test.distro", "/tmp", &["/bin/bash", "-i"])
            );
        }

        #[test]
        fn builds_wsl_fish_launch_spec_without_integration_still_interactive() {
            let spec = build_wsl_launch_spec(
                None,
                "Alpine",
                "/usr/bin/fish",
                ShellKind::Fish,
                WslShellIntegration::None,
                no_extra_env(),
            );
            assert_eq!(
                spec.args,
                expected_for("Alpine", "~", &["/usr/bin/fish", "-i"])
            );
        }

        // ── build() — the CommandBuilder actually handed to ConPTY ─────────
        //
        // These exercise the real local-shell path (no distro probes). The WSL
        // route is intentionally not tested at this level: build_wsl shells
        // out to wsl.exe for the login-shell probe, which needs a live distro.

        #[test]
        fn powershell_spawn_carries_pitfall_1b_contract() {
            let cmd =
                build(None, WorkspaceEnv::Local, None, &HashMap::new()).expect("powershell build");
            let argv: Vec<String> = cmd
                .get_argv()
                .iter()
                .map(|a| a.to_string_lossy().into_owned())
                .collect();
            for flag in [
                "-NoLogo",
                "-NoExit",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
            ] {
                assert!(
                    argv.contains(&flag.to_string()),
                    "argv missing {flag}: {argv:?}"
                );
            }
            // The profile must be dot-sourced from the env var, never via a
            // file argument: the script-mode → interactive-mode transition
            // races ConPTY output init and drops the first prompt (CLAUDE.md
            // pitfall #1B). Asserted as a full flag allowlist — stronger than
            // a single missing-flag check and it keeps this source free of a
            // certain two-word literal the pitfall_1b scanner forbids.
            assert!(
                argv.contains(
                    &"if ($env:NEXIS_PWSH_PROFILE) { . $env:NEXIS_PWSH_PROFILE }".to_string()
                ),
                "argv must carry the dot-source command: {argv:?}"
            );
            let flags: Vec<String> = argv
                .iter()
                .filter(|a| a.starts_with('-'))
                .cloned()
                .collect();
            assert_eq!(
                flags,
                ["-NoLogo", "-NoExit", "-ExecutionPolicy", "-Command"],
                "unexpected PowerShell flags: {argv:?}"
            );
            let profile = cmd
                .get_env("NEXIS_PWSH_PROFILE")
                .expect("NEXIS_PWSH_PROFILE must be set")
                .to_string_lossy()
                .into_owned();
            assert!(
                std::path::Path::new(&profile).is_file(),
                "profile env var must point at the written cache file: {profile}"
            );
        }

        #[test]
        fn spawn_sets_terminal_environment() {
            let cmd = build(None, WorkspaceEnv::Local, None, &HashMap::new()).expect("build");
            assert_eq!(cmd.get_env("TERM").unwrap(), "xterm-256color");
            assert_eq!(cmd.get_env("COLORTERM").unwrap(), "truecolor");
            assert_eq!(cmd.get_env("NEXIS_TERMINAL").unwrap(), "1");
        }

        #[test]
        fn spawn_cwd_strips_verbatim_prefix_for_conpty() {
            let dir = std::env::temp_dir().join(format!(
                "nexis-shell-init-cwd-{}-{}",
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_nanos())
                    .unwrap_or(0)
            ));
            fs::create_dir_all(&dir).unwrap();
            // canonicalize returns the \\?\ verbatim form on Windows — exactly
            // what authorize_spawn_cwd hands back. Reaching PowerShell, it
            // renders the prompt as
            // `PS Microsoft.PowerShell.Core\FileSystem::\\?\C:\…>` instead of
            // `PS C:\…>`, so apply_common must strip it.
            let verbatim = fs::canonicalize(&dir).unwrap();
            let cmd = build(
                Some(verbatim.to_string_lossy().into_owned()),
                WorkspaceEnv::Local,
                None,
                &HashMap::new(),
            )
            .expect("build with verbatim cwd");
            let cwd = cmd
                .get_cwd()
                .expect("cwd must be set")
                .to_string_lossy()
                .into_owned();
            assert!(!cwd.starts_with(r"\\?\"), "verbatim prefix leaked: {cwd}");
            assert!(!cwd.contains('/'), "forward slashes leaked: {cwd}");
            // The stripped path must still resolve to the same directory.
            assert_eq!(fs::canonicalize(&cwd).unwrap(), verbatim);
            let _ = fs::remove_dir_all(&dir);
        }

        #[test]
        fn nonexistent_shell_override_falls_back_instead_of_spawning_dead_shell() {
            let bogus = r"C:\nexis-test-definitely-not-a-shell.exe";
            assert!(!std::path::Path::new(bogus).is_file());
            let cmd = build(
                None,
                WorkspaceEnv::Local,
                Some(bogus.to_string()),
                &HashMap::new(),
            )
            .expect("fallback build");
            let shell = cmd.get_shell();
            assert_ne!(
                shell.to_ascii_lowercase(),
                bogus.to_ascii_lowercase(),
                "the bogus override must not reach the spawn: {shell}"
            );
        }

        #[test]
        fn non_powershell_shell_spawns_without_integration_flags() {
            let system_root = std::env::var_os("SystemRoot")
                .map(PathBuf::from)
                .unwrap_or_else(|| PathBuf::from(r"C:\Windows"));
            let cmd_exe = system_root.join("System32").join("cmd.exe");
            if !cmd_exe.is_file() {
                return; // nothing to prove on a runner without cmd.exe
            }
            let cmd = build(
                None,
                WorkspaceEnv::Local,
                Some(cmd_exe.to_string_lossy().into_owned()),
                &HashMap::new(),
            )
            .expect("cmd build");
            let argv: Vec<String> = cmd
                .get_argv()
                .iter()
                .map(|a| a.to_string_lossy().into_owned())
                .collect();
            for flag in ["-NoLogo", "-NoExit", "-Command"] {
                assert!(
                    !argv.contains(&flag.to_string()),
                    "PowerShell flags leaked into a cmd.exe spawn: {argv:?}"
                );
            }
            assert!(cmd.get_env("NEXIS_PWSH_PROFILE").is_none());
        }
    }
}

// write_if_changed is shared by the unix and windows submodules; test it once
// here (it used to be duplicated — implementation and tests — in both).
#[cfg(test)]
mod tests {
    use super::*;

    fn tmpfile(label: &str) -> PathBuf {
        let mut p = std::env::temp_dir();
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        p.push(format!("nexis-wic-{label}-{nanos}.txt"));
        p
    }

    #[test]
    fn write_if_changed_creates_file_when_absent() {
        let p = tmpfile("new");
        write_if_changed(&p, "hello").expect("create");
        assert_eq!(fs::read_to_string(&p).unwrap(), "hello");
        let _ = fs::remove_file(&p);
    }

    #[test]
    fn write_if_changed_updates_when_content_differs() {
        let p = tmpfile("upd");
        fs::write(&p, "old").unwrap();
        write_if_changed(&p, "new").expect("update");
        assert_eq!(fs::read_to_string(&p).unwrap(), "new");
        let _ = fs::remove_file(&p);
    }

    // Pitfall 6 regression: write_if_changed must skip the write when content
    // is unchanged, so a parallel shell can't source a half-written profile.
    // Verified by checking the mtime is untouched.
    #[test]
    fn write_if_changed_is_idempotent_on_same_content_pitfall_6() {
        let p = tmpfile("idm");
        fs::write(&p, "same content").unwrap();
        let mtime_before = fs::metadata(&p).unwrap().modified().unwrap();
        std::thread::sleep(std::time::Duration::from_millis(20));
        write_if_changed(&p, "same content").expect("idempotent");
        let mtime_after = fs::metadata(&p).unwrap().modified().unwrap();
        assert_eq!(
            mtime_before, mtime_after,
            "file must not be re-written when content has not changed"
        );
        let _ = fs::remove_file(&p);
    }

    #[test]
    fn write_if_changed_leaves_no_temp_file_after_success() {
        let p = tmpfile("tmp");
        write_if_changed(&p, "content").expect("write");
        let mut tmp_os = p.clone().into_os_string();
        tmp_os.push(".__nexis_tmp__");
        assert!(!PathBuf::from(tmp_os).exists());
        let _ = fs::remove_file(&p);
    }
}

#[cfg(windows)]
pub fn windows_shell_path() -> PathBuf {
    if let Some(p) = which_in_path("pwsh.exe") {
        return p;
    }

    if let Some(pf) = std::env::var_os("ProgramFiles").map(PathBuf::from) {
        let candidate = pf.join("PowerShell").join("7").join("pwsh.exe");
        if candidate.is_file() {
            return candidate;
        }
    }

    let system32 = std::env::var_os("SystemRoot")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(r"C:\Windows"))
        .join("System32");
    let ps5 = system32
        .join("WindowsPowerShell")
        .join("v1.0")
        .join("powershell.exe");
    if ps5.is_file() {
        return ps5;
    }

    system32.join("cmd.exe")
}

#[cfg(windows)]
fn which_in_path(name: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path) {
        let candidate = dir.join(name);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}
