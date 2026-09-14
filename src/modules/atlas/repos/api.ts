// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * The Atlas panel's boundary with the Rust scanner.
 *
 * Three of the standalone app's commands are gone, because inside Nexis they
 * were all asking another program to do something Nexis already does:
 *
 * - `open_in_nexis` / `has_nexis` located an installed Nexis and spawned it at
 *   a repo. Here that is `switchWorkspacePath`, handed down as a prop.
 * - `open_in_terminal` hunted for `$TERMINAL`, `wt`, `konsole`, `xterm`… Here
 *   a terminal is a tab.
 * - `open_config` handed `config.toml` to the OS's default handler. Here it
 *   opens in an editor tab, which is the better answer and the reason
 *   `atlas_config_path` returns a path rather than opening anything.
 *
 * Revealing a path in the OS file manager is the one thing Nexis genuinely
 * delegates, and it uses the same `plugin-opener` call the explorer does.
 */

import { defineCommand } from "@/platform/ipc";
import { hostIpc } from "@/platform/tauri";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import type { AtlasResult, RepoCity, RepoDetail } from "./types";

const scan = defineCommand<Record<string, never>, AtlasResult>("atlas_scan_repos", "host");
const detail = defineCommand<{ path: string }, RepoDetail>("atlas_repo_detail", "host");
const city = defineCommand<{ path: string }, RepoCity>("atlas_repo_city", "host");
const config = defineCommand<Record<string, never>, string>("atlas_config_path", "host");

/** One scan, both views: git state for the list, size and language mix for
 *  the map. Re-reads `atlas.toml` every time, so a config edit lands on the
 *  next refresh. */
export function scanRepos(): Promise<AtlasResult> {
  return hostIpc.call(scan, {});
}

/** The list view's drill-in: changed files and stashes for one repo. */
export function fetchRepoDetail(path: string): Promise<RepoDetail> {
  return hostIpc.call(detail, { path });
}

/** The map view's drill-in: the full file tree for one repo. */
export function fetchRepoCity(path: string): Promise<RepoCity> {
  return hostIpc.call(city, { path });
}

/** Show a repo directory in the OS file manager. */
export function revealPath(path: string): Promise<void> {
  return revealItemInDir(path);
}

/** Absolute path of `atlas.toml`, created with the commented default if this
 *  is the first time anyone has asked. The caller opens it in an editor tab. */
export function configPath(): Promise<string> {
  return hostIpc.call(config, {});
}
