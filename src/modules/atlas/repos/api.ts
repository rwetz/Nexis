import { invoke } from "@tauri-apps/api/core";
import type { AtlasResult, RepoCity, RepoDetail } from "./types";

/** One scan, both views: git state for the list, size and language mix for
 *  the map. Re-reads config.toml every time, so a config edit lands on the
 *  next refresh. */
export function scanRepos(): Promise<AtlasResult> {
  return invoke<AtlasResult>("scan_repos");
}

/** The list view's drill-in: changed files and stashes for one repo. */
export function fetchRepoDetail(path: string): Promise<RepoDetail> {
  return invoke<RepoDetail>("repo_detail", { path });
}

/** The map view's drill-in: the full file tree for one repo. */
export function fetchRepoCity(path: string): Promise<RepoCity> {
  return invoke<RepoCity>("repo_city", { path });
}

export function openPath(path: string): Promise<void> {
  return invoke<void>("open_path", { path });
}

/** Resolves to the terminal binary that was launched. */
export function openInTerminal(path: string): Promise<string> {
  return invoke<string>("open_in_terminal", { path });
}

export function openConfig(): Promise<void> {
  return invoke<void>("open_config");
}

/** Hand a repo to Nexis. Resolves to the binary that was launched. */
export function openInNexis(path: string): Promise<string> {
  return invoke<string>("open_in_nexis", { path });
}

/** Whether an installed Nexis was found, so the UI can hide the action rather
 *  than offering a button that can only fail. */
export function hasNexis(): Promise<boolean> {
  return invoke<boolean>("has_nexis");
}
