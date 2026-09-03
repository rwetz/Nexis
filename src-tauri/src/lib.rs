// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

mod modules;

/// Benchmark-only surface. Criterion benches live outside the crate and can
/// only reach public items, so the hot-path internals they measure are
/// re-exported here behind a non-default feature. Nothing in a shipping build
/// enables `bench-internals`; run with:
///   cargo bench --features bench-internals
#[cfg(feature = "bench-internals")]
pub mod bench_internals {
    pub use crate::modules::fs::grep::fs_grep;
    pub use crate::modules::git::parser::parse_porcelain_v2;
    pub use crate::modules::pty::da_filter::DaFilter;
}

use modules::{
    ai_audit, autosave, crash, dap, diagnostics, fs, fswatch, git, http_share, lsp, ml, net, pty,
    python, recording, secrets, shell, snapshots, sysmon, tools, winstate, workspace,
};
use std::sync::Mutex;
use tauri::State;
use tauri_plugin_window_state::StateFlags;

/// Drained on first read so HMR / re-mounts can't replay the launch dir.
#[derive(Default)]
struct LaunchDir(Mutex<Option<String>>);

#[tauri::command]
fn get_launch_dir(state: State<'_, LaunchDir>) -> Option<String> {
    // Recover from a poisoned mutex instead of panicking: with panic="abort" a
    // panic here would abort the whole app, and the guarded value is trivially
    // recoverable from the poison.
    state.0.lock().unwrap_or_else(|e| e.into_inner()).take()
}

fn parse_launch_dir() -> Option<String> {
    for arg in std::env::args().skip(1) {
        if arg.starts_with('-') {
            continue;
        }
        let Ok(canon) = std::fs::canonicalize(&arg) else {
            continue;
        };
        if !canon.is_dir() {
            continue;
        }
        let s = canon.to_string_lossy();
        return Some(s.strip_prefix(r"\\?\").unwrap_or(&s).to_string());
    }
    None
}

/// WebKitGTK 2.44+ renders through a DMABUF-backed accelerated-compositing path
/// by default. On the NVIDIA proprietary driver that path is buggy and slow —
/// tearing, stutter, and high CPU across every frame (terminal scroll, editor,
/// the whole webview). Disabling it makes WebKitGTK fall back to the reliable
/// GL/EGL compositor, which is dramatically smoother on NVIDIA.
///
/// This is scoped tightly on purpose: Mesa (Intel/AMD) drives the DMABUF path
/// well and is *faster* with it on, so we only flip the switch when the NVIDIA
/// proprietary driver is actually loaded. A user who has already set the env
/// var (either value) always wins — we never clobber an explicit choice.
///
/// Must run before the webview (and its forked WebKit web/network processes)
/// come up, i.e. before `tauri::Builder::run`, so the children inherit it.
#[cfg(target_os = "linux")]
fn tune_linux_webkit() {
    use std::path::Path;

    // KDE's KWin draws its own server-side titlebar for GTK/WebKit windows even
    // when the app sets `decorations: false`, producing a double title bar
    // (KWin's bar stacked on top of our custom header). Forcing GTK client-side
    // decorations makes KWin defer decoration ownership to the app, so with
    // decorations off there is simply no titlebar. Harmless on GNOME/wlroots,
    // which already default to CSD. Respect an explicit user value.
    if std::env::var_os("GTK_CSD").is_none() {
        std::env::set_var("GTK_CSD", "1");
    }

    // `/proc/driver/nvidia/version` exists only for the proprietary driver;
    // `/dev/nvidia0` is the belt-and-suspenders check. Both are host paths and
    // remain visible from inside an AppImage.
    let nvidia_proprietary =
        Path::new("/proc/driver/nvidia/version").exists() || Path::new("/dev/nvidia0").exists();
    if !nvidia_proprietary {
        return;
    }
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_some() {
        return; // respect an explicit user override
    }
    std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    eprintln!(
        "[nexis] NVIDIA driver detected — set WEBKIT_DISABLE_DMABUF_RENDERER=1 \
         to avoid WebKitGTK render lag (override by exporting it yourself)"
    );
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Tune the webview before anything spawns a thread or forks the WebKit web
    // process, so the setting is in place when the compositor initializes.
    #[cfg(target_os = "linux")]
    tune_linux_webkit();

    // Install first so a panic anywhere during setup is still captured.
    crash::install_panic_hook();
    workspace::init_launch_cwd();

    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        // Must be registered BEFORE the window-state plugin: plugin setups run
        // in registration order, and this repairs the saved geometry on disk so
        // the restore below reads values that already fit the current displays.
        // Doing it here rather than after the window exists is deliberate — see
        // the module docs for why post-hoc resizing cannot work.
        .plugin(
            tauri::plugin::Builder::<tauri::Wry, ()>::new("nexis-window-state-sanitize")
                .setup(|app, _api| {
                    winstate::sanitize_saved_state(app);
                    Ok(())
                })
                .build(),
        )
        // Skip restoring VISIBLE — frontend calls window.show() after first
        // paint so the user never sees a transparent window-shadow flash on
        // Windows/Linux.
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(StateFlags::all() & !StateFlags::VISIBLE)
                .build(),
        )
        .plugin(tauri_plugin_autostart::Builder::new().build())
        // Quick terminal's global hotkey. The accelerator itself is registered
        // from the frontend (it is a user preference), so no handler is wired
        // here — this only makes the plugin's IPC surface available.
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_os::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(tauri_plugin_log::log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .manage(pty::PtyState::default())
        .manage(shell::ShellState::default())
        .manage(secrets::SecretsState::default())
        .manage({
            let registry = workspace::WorkspaceRegistry::default();
            workspace::bootstrap_registry(&registry);
            registry
        })
        .manage(lsp::LspState::default())
        .manage(dap::DapState::default())
        .manage(ml::MlState::default())
        .manage(http_share::HttpShareState::default())
        .manage(LaunchDir(Mutex::new(parse_launch_dir())))
        .setup(|_app| {
            // Re-assert undecorated after the webview is up (webkit2gtk can
            // reset window hints during init) and log the actual state so a
            // lingering KDE title bar can be diagnosed as "KWin ignored us"
            // rather than "config never applied".
            #[cfg(target_os = "linux")]
            {
                use tauri::Manager;
                if let Some(win) = _app.get_webview_window("main") {
                    let _ = win.set_decorations(false);
                    match win.is_decorated() {
                        Ok(d) => eprintln!("[nexis] main window is_decorated = {d}"),
                        Err(e) => eprintln!("[nexis] is_decorated query failed: {e}"),
                    }
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            pty::pty_open,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_close,
            pty::pty_cwd,
            fs::tree::list_subdirs,
            fs::tree::fs_read_dir,
            fs::file::fs_read_file,
            fs::file::fs_read_file_ai,
            fs::file::fs_write_file,
            fs::file::fs_write_file_bytes,
            fs::file::fs_stat,
            fs::file::fs_canonicalize,
            fs::mutate::fs_create_file,
            fs::mutate::fs_create_dir,
            fs::mutate::fs_rename,
            fs::mutate::fs_delete,
            fs::search::fs_search,
            fs::search::fs_list_files,
            fs::grep::fs_grep,
            fs::grep::fs_glob,
            git::commands::git_resolve_repo,
            git::commands::git_panel_snapshot,
            git::commands::git_status,
            git::commands::git_diff,
            git::commands::git_diff_content,
            git::commands::git_stage,
            git::commands::git_unstage,
            git::commands::git_discard,
            git::commands::git_commit,
            git::commands::git_branches,
            git::commands::git_checkout_branch,
            git::commands::git_fetch,
            git::commands::git_pull_ff_only,
            git::commands::git_push,
            git::commands::git_log,
            git::commands::git_show_commit,
            git::commands::git_commit_files,
            git::commands::git_commit_file_diff,
            git::commands::git_remote_url,
            git::commands::git_submodule_status,
            git::commands::git_checkpoint_create,
            git::commands::git_checkpoint_list,
            git::commands::git_checkpoint_restore,
            git::commands::git_checkpoint_delete,
            git::commands::git_stash_list,
            git::commands::git_stash_push,
            git::commands::git_stash_apply,
            git::commands::git_stash_pop,
            git::commands::git_stash_drop,
            git::commands::git_worktree_list,
            git::commands::git_worktree_add,
            git::commands::git_worktree_remove,
            git::commands::git_worktree_prune,
            shell::shell_run_command,
            shell::read_shell_history,
            shell::search_shell_history,
            shell::shell_session_open,
            shell::shell_session_run,
            shell::shell_session_close,
            shell::shell_bg_spawn,
            shell::shell_bg_logs,
            shell::shell_bg_kill,
            shell::shell_bg_list,
            workspace::wsl_list_distros,
            workspace::wsl_default_distro,
            workspace::wsl_home,
            workspace::workspace_authorize,
            workspace::workspace_current_dir,
            get_launch_dir,
            secrets::secrets_get,
            secrets::secrets_set,
            secrets::secrets_delete,
            secrets::secrets_get_all,
            lsp::lsp_start,
            lsp::lsp_request,
            lsp::lsp_notify,
            lsp::lsp_stop,
            ml::ml_detect,
            ml::ml_spawn,
            ml::ml_cancel,
            ml::ml_kill,
            ml::ml_stdin,
            ml::ml_install,
            ml::ml_env,
            ml::ml_gpu_probe,
            ml::ml_managed_engine_path,
            ml::ml_engine_pin,
            ml::ml_download,
            ml::ml_install_local,
            ml::ml_engine_status,
            ml::ml_uninstall,
            dap::dap_start,
            dap::dap_request,
            dap::dap_stop,
            dap::dap_sessions,
            net::lm_ping,
            net::ai_http_request,
            net::http_send,
            net::ai_http_stream,
            python::py_detect_envs,
            recording::save_cast_recording,
            ai_audit::ai_audit_append,
            ai_audit::ai_audit_log_path,
            autosave::editor_autosave_write,
            autosave::editor_autosave_read,
            autosave::editor_autosave_delete,
            autosave::editor_autosave_sweep,
            snapshots::session_snapshot_save,
            snapshots::session_snapshot_load,
            snapshots::session_snapshot_delete,
            snapshots::session_snapshot_gc,
            fswatch::fs_watch_start,
            fswatch::fs_watch_stop,
            sysmon::sysmon_sample,
            sysmon::sysmon_kill,
            tools::tool_probe,
            http_share::http_share_start,
            http_share::http_share_update,
            http_share::http_share_stop,
            http_share::http_share_push_stream,
            http_share::http_share_lan_ip,
            crash::list_crash_reports,
            diagnostics::diagnostics_export,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
