// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

use std::collections::HashMap;
use std::path::PathBuf;

use portable_pty::CommandBuilder;

use crate::modules::workspace::{self, WorkspaceEnv};

#[cfg(windows)]
const BASHRC_SCRIPT: &str = include_str!("scripts/bashrc.bash");
#[cfg(windows)]
const ZSHENV_SCRIPT: &str = include_str!("scripts/zshenv.zsh");
#[cfg(windows)]
const ZPROFILE_SCRIPT: &str = include_str!("scripts/zprofile.zsh");
#[cfg(windows)]
const ZLOGIN_SCRIPT: &str = include_str!("scripts/zlogin.zsh");
#[cfg(windows)]
const ZSHRC_SCRIPT: &str = include_str!("scripts/zshrc.zsh");
#[cfg(windows)]
const FISH_INIT_SCRIPT: &str = include_str!("scripts/init.fish");

#[cfg(windows)]
fn bashrc_script() -> &'static str {
    BASHRC_SCRIPT
}

#[cfg(windows)]
fn zshenv_script() -> &'static str {
    ZSHENV_SCRIPT
}

#[cfg(windows)]
fn zprofile_script() -> &'static str {
    ZPROFILE_SCRIPT
}

#[cfg(windows)]
fn zlogin_script() -> &'static str {
    ZLOGIN_SCRIPT
}

#[cfg(windows)]
fn zshrc_script() -> &'static str {
    ZSHRC_SCRIPT
}

#[cfg(windows)]
fn fish_init_script() -> &'static str {
    FISH_INIT_SCRIPT
}

pub fn build_command(
    cwd: Option<String>,
    workspace: WorkspaceEnv,
    extra_env: HashMap<String, String>,
) -> Result<CommandBuilder, String> {
    #[cfg(unix)]
    {
        let _ = workspace;
        let mut cmd = unix::build(cwd)?;
        for (k, v) in extra_env {
            cmd.env(k, v);
        }
        Ok(cmd)
    }
    #[cfg(windows)]
    {
        let mut cmd = windows::build(cwd, workspace)?;
        for (k, v) in extra_env {
            cmd.env(k, v);
        }
        Ok(cmd)
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
    use std::ffi::OsString;
    use std::fs;
    use std::path::{Path, PathBuf};

    use portable_pty::CommandBuilder;

    const ZSHENV: &str = include_str!("scripts/zshenv.zsh");
    const ZPROFILE: &str = include_str!("scripts/zprofile.zsh");
    const ZLOGIN: &str = include_str!("scripts/zlogin.zsh");
    const ZSHRC: &str = include_str!("scripts/zshrc.zsh");
    const BASHRC: &str = include_str!("scripts/bashrc.bash");
    const FISH_INIT: &str = include_str!("scripts/init.fish");

    pub enum Shell {
        Zsh,
        Bash,
        Fish,
        Other,
    }

    impl Shell {
        pub fn detect() -> (Shell, String) {
            let path = login_shell()
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

    pub fn build(cwd: Option<String>) -> Result<CommandBuilder, String> {
        let (shell, shell_path) = Shell::detect();
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

    fn integration_root() -> Result<PathBuf, String> {
        let home = dirs::home_dir().ok_or_else(|| "could not resolve home dir".to_string())?;
        let root = home.join(".cache").join("nexis").join("shell-integration");
        fs::create_dir_all(&root).map_err(|e| format!("create {}: {e}", root.display()))?;
        Ok(root)
    }

    fn prepare_zdotdir() -> Result<PathBuf, String> {
        let dir = integration_root()?.join("zsh");
        fs::create_dir_all(&dir).map_err(|e| format!("create {}: {e}", dir.display()))?;
        write_if_changed(&dir.join(".zshenv"), ZSHENV)?;
        write_if_changed(&dir.join(".zprofile"), ZPROFILE)?;
        write_if_changed(&dir.join(".zshrc"), ZSHRC)?;
        write_if_changed(&dir.join(".zlogin"), ZLOGIN)?;
        Ok(dir)
    }

    fn prepare_bash_rcfile() -> Result<PathBuf, String> {
        let dir = integration_root()?.join("bash");
        fs::create_dir_all(&dir).map_err(|e| format!("create {}: {e}", dir.display()))?;
        let rc = dir.join("bashrc");
        write_if_changed(&rc, BASHRC)?;
        Ok(rc)
    }

    fn prepare_fish_conf_d() -> Result<(), String> {
        let home = dirs::home_dir().ok_or_else(|| "could not resolve home dir".to_string())?;
        let dir = home.join(".config").join("fish").join("conf.d");
        fs::create_dir_all(&dir).map_err(|e| format!("create {}: {e}", dir.display()))?;
        write_if_changed(&dir.join("nexis.fish"), FISH_INIT)?;
        Ok(())
    }

    fn write_if_changed(path: &Path, content: &str) -> Result<(), String> {
        if let Ok(existing) = fs::read_to_string(path) {
            if existing == content {
                return Ok(());
            }
        }
        // Atomic replace: a parallel shell startup must never source a half-written file.
        let mut tmp: OsString = path.as_os_str().to_owned();
        tmp.push(".__nexis_tmp__");
        let tmp = PathBuf::from(tmp);
        fs::write(&tmp, content).map_err(|e| format!("write {}: {e}", tmp.display()))?;
        fs::rename(&tmp, path).map_err(|e| {
            let _ = fs::remove_file(&tmp);
            format!("rename {} -> {}: {e}", tmp.display(), path.display())
        })
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        fn tmpfile(label: &str) -> PathBuf {
            let mut p = std::env::temp_dir();
            let nanos = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0);
            p.push(format!("nexis-unix-wic-{label}-{nanos}.txt"));
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

        // Pitfall 6 regression — same invariant as the Windows submodule.
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
}

#[cfg(windows)]
mod windows {
    use std::ffi::OsString;
    use std::fs;
    use std::path::{Path, PathBuf};

    use crate::modules::workspace::WorkspaceEnv;
    use portable_pty::CommandBuilder;

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
        Bash { rcfile: String },
        Fish,
        None,
    }

    #[derive(Clone, Debug, Eq, PartialEq)]
    struct WslLaunchSpec {
        args: Vec<String>,
    }

    pub fn build(cwd: Option<String>, workspace: WorkspaceEnv) -> Result<CommandBuilder, String> {
        if let WorkspaceEnv::Wsl { distro } = workspace {
            return build_wsl(cwd, distro);
        }
        let shell_path = super::windows_shell_path();
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

    fn build_wsl(cwd: Option<String>, distro: String) -> Result<CommandBuilder, String> {
        crate::modules::workspace::validate_wsl_distro_name(&distro)?;
        let shell_path = crate::modules::workspace::wsl_login_shell(distro.clone())?;
        let shell_kind = ShellKind::from_path(&shell_path);
        let integration = match shell_kind {
            ShellKind::Zsh => match prepare_wsl_zdotdir(&distro) {
                Ok(zdotdir) => {
                    let user_zdotdir = match probe_wsl_zdotdir(&distro, &shell_path) {
                        Ok(path) if !path.is_empty() && path != zdotdir => Some(path),
                        Ok(_) => None,
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

    fn build_wsl_launch_spec(
        cwd: Option<&str>,
        distro: &str,
        shell_path: &str,
        shell_kind: ShellKind,
        integration: WslShellIntegration,
    ) -> WslLaunchSpec {
        let mut args = vec![
            "-d".to_string(),
            distro.to_string(),
            "--cd".to_string(),
            cwd.filter(|s| !s.is_empty()).unwrap_or("~").to_string(),
            "--exec".to_string(),
        ];
        match (shell_kind, integration) {
            (
                ShellKind::Zsh,
                WslShellIntegration::Zsh {
                    zdotdir,
                    user_zdotdir,
                },
            ) => {
                args.push("env".to_string());
                if let Some(user_zdotdir) = user_zdotdir {
                    args.push(format!("NEXIS_USER_ZDOTDIR={user_zdotdir}"));
                }
                args.push(format!("ZDOTDIR={zdotdir}"));
                args.push(shell_path.to_string());
                args.push("-l".to_string());
            }
            (ShellKind::Bash, WslShellIntegration::Bash { rcfile }) => {
                args.push(shell_path.to_string());
                args.push("--rcfile".to_string());
                args.push(rcfile);
                args.push("-i".to_string());
            }
            (ShellKind::Fish, WslShellIntegration::Fish) => {
                args.push(shell_path.to_string());
                args.push("-i".to_string());
            }
            (ShellKind::Zsh, WslShellIntegration::None) => {
                args.push(shell_path.to_string());
                args.push("-l".to_string());
            }
            (ShellKind::Bash, WslShellIntegration::None)
            | (ShellKind::Fish, WslShellIntegration::None) => {
                args.push(shell_path.to_string());
                args.push("-i".to_string());
            }
            (ShellKind::Other, _) => args.push(shell_path.to_string()),
            _ => {
                args.push(shell_path.to_string());
            }
        }
        WslLaunchSpec { args }
    }

    fn probe_wsl_zdotdir(distro: &str, shell_path: &str) -> Result<String, String> {
        let out = crate::modules::workspace::wsl_exec_capture(
            distro,
            shell_path,
            &["-c", r#"printf %s "${ZDOTDIR:-$HOME}""#],
        )?;
        Ok(crate::modules::workspace::normalize_wsl_value(out, ""))
    }

    fn prepare_wsl_integration_dir(distro: &str, shell: &str) -> Result<(String, PathBuf), String> {
        let home = crate::modules::workspace::wsl_home(distro.to_string())?;
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
        write_if_changed(
            &unc_dir.join(".zshenv"),
            &normalize_script(super::zshenv_script()),
        )?;
        write_if_changed(
            &unc_dir.join(".zprofile"),
            &normalize_script(super::zprofile_script()),
        )?;
        write_if_changed(
            &unc_dir.join(".zshrc"),
            &normalize_script(super::zshrc_script()),
        )?;
        write_if_changed(
            &unc_dir.join(".zlogin"),
            &normalize_script(super::zlogin_script()),
        )?;
        Ok(linux_dir)
    }

    fn prepare_wsl_bash_rcfile(distro: &str) -> Result<String, String> {
        let (linux_dir, _unc_dir) = prepare_wsl_integration_dir(distro, "bash")?;
        let linux_rc = format!("{linux_dir}/bashrc");
        let unc_file = crate::modules::workspace::wsl_path_to_unc(distro, &linux_rc);
        let content = normalize_script(super::bashrc_script());
        write_if_changed(&unc_file, &content)?;
        Ok(linux_rc)
    }

    fn prepare_wsl_fish_conf_d(distro: &str) -> Result<(), String> {
        let home = crate::modules::workspace::wsl_home(distro.to_string())?;
        let linux_dir = format!("{}/.config/fish/conf.d", home.trim_end_matches('/'));
        let unc_dir = crate::modules::workspace::wsl_path_to_unc(distro, &linux_dir);
        fs::create_dir_all(&unc_dir).map_err(|e| format!("create {}: {e}", unc_dir.display()))?;
        let unc_file = unc_dir.join("nexis.fish");
        let content = normalize_script(super::fish_init_script());
        write_if_changed(&unc_file, &content)?;
        Ok(())
    }

    fn integration_root() -> Result<PathBuf, String> {
        let home = dirs::home_dir().ok_or_else(|| "could not resolve home dir".to_string())?;
        let root = home.join(".cache").join("nexis").join("shell-integration");
        fs::create_dir_all(&root).map_err(|e| format!("create {}: {e}", root.display()))?;
        Ok(root)
    }

    fn prepare_ps_profile() -> Result<PathBuf, String> {
        let dir = integration_root()?.join("powershell");
        fs::create_dir_all(&dir).map_err(|e| format!("create {}: {e}", dir.display()))?;
        let file = dir.join("profile.ps1");
        write_if_changed(&file, PROFILE_PS1)?;
        Ok(file)
    }

    fn write_if_changed(path: &Path, content: &str) -> Result<(), String> {
        if let Ok(existing) = fs::read_to_string(path) {
            if existing == content {
                return Ok(());
            }
        }
        let mut tmp: OsString = path.as_os_str().to_owned();
        tmp.push(".__nexis_tmp__");
        let tmp = PathBuf::from(tmp);
        fs::write(&tmp, content).map_err(|e| format!("write {}: {e}", tmp.display()))?;
        fs::rename(&tmp, path).map_err(|e| {
            let _ = fs::remove_file(&tmp);
            format!("rename {} -> {}: {e}", tmp.display(), path.display())
        })
    }

    #[cfg(test)]
    mod tests {
        use super::*;

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
            );
            assert_eq!(
                spec.args,
                vec![
                    "-d".to_string(),
                    "Ubuntu".to_string(),
                    "--cd".to_string(),
                    "/home/vinicios/repo".to_string(),
                    "--exec".to_string(),
                    "env".to_string(),
                    "ZDOTDIR=/home/vinicios/.cache/nexis/shell-integration/zsh".to_string(),
                    "/usr/bin/zsh".to_string(),
                    "-l".to_string(),
                ]
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
            );
            assert_eq!(
                spec.args,
                vec![
                    "-d".to_string(),
                    "Ubuntu".to_string(),
                    "--cd".to_string(),
                    "/home/vinicios/repo".to_string(),
                    "--exec".to_string(),
                    "env".to_string(),
                    "NEXIS_USER_ZDOTDIR=/home/vinicios/.config/zsh".to_string(),
                    "ZDOTDIR=/home/vinicios/.cache/nexis/shell-integration/zsh".to_string(),
                    "/usr/bin/zsh".to_string(),
                    "-l".to_string(),
                ]
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
            );
            assert_eq!(
                spec.args,
                vec![
                    "-d".to_string(),
                    "Ubuntu".to_string(),
                    "--cd".to_string(),
                    "/home/vinicios/repo".to_string(),
                    "--exec".to_string(),
                    "/usr/bin/zsh".to_string(),
                    "-l".to_string(),
                ]
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
            );
            assert_eq!(
                spec.args,
                vec![
                    "-d".to_string(),
                    "Ubuntu".to_string(),
                    "--cd".to_string(),
                    "/home/vinicios/repo".to_string(),
                    "--exec".to_string(),
                    "/bin/bash".to_string(),
                    "--rcfile".to_string(),
                    "/home/vinicios/.cache/nexis/shell-integration/bash/bashrc".to_string(),
                    "-i".to_string(),
                ]
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
            );
            assert_eq!(
                spec.args,
                vec![
                    "-d".to_string(),
                    "Ubuntu".to_string(),
                    "--cd".to_string(),
                    "/home/vinicios/repo".to_string(),
                    "--exec".to_string(),
                    "/usr/bin/fish".to_string(),
                    "-i".to_string(),
                ]
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
            );
            assert_eq!(
                spec.args,
                vec![
                    "-d".to_string(),
                    "Ubuntu".to_string(),
                    "--cd".to_string(),
                    "~".to_string(),
                    "--exec".to_string(),
                    "/usr/bin/nu".to_string(),
                ]
            );
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

        // ── write_if_changed ──────────────────────────────────────────────

        fn tmpfile(label: &str) -> std::path::PathBuf {
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
            assert_eq!(std::fs::read_to_string(&p).unwrap(), "hello");
            let _ = std::fs::remove_file(&p);
        }

        #[test]
        fn write_if_changed_updates_when_content_differs() {
            let p = tmpfile("upd");
            std::fs::write(&p, "old").unwrap();
            write_if_changed(&p, "new").expect("update");
            assert_eq!(std::fs::read_to_string(&p).unwrap(), "new");
            let _ = std::fs::remove_file(&p);
        }

        // Pitfall 6 regression: write_if_changed must skip the write when
        // content is unchanged, so a parallel shell can't source a half-written
        // profile. We verify by checking mtime is untouched.
        #[test]
        fn write_if_changed_is_idempotent_on_same_content_pitfall_6() {
            let p = tmpfile("idm");
            std::fs::write(&p, "same content").unwrap();
            let mtime_before = std::fs::metadata(&p).unwrap().modified().unwrap();
            std::thread::sleep(std::time::Duration::from_millis(20));
            write_if_changed(&p, "same content").expect("idempotent");
            let mtime_after = std::fs::metadata(&p).unwrap().modified().unwrap();
            assert_eq!(
                mtime_before, mtime_after,
                "file must not be re-written when content has not changed"
            );
            let _ = std::fs::remove_file(&p);
        }

        #[test]
        fn write_if_changed_leaves_no_temp_file_after_success() {
            let p = tmpfile("tmp");
            write_if_changed(&p, "content").expect("write");
            let mut tmp_os = p.clone().into_os_string();
            tmp_os.push(".__nexis_tmp__");
            assert!(!std::path::PathBuf::from(tmp_os).exists());
            let _ = std::fs::remove_file(&p);
        }
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
