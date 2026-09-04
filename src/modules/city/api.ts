import { invoke } from "@tauri-apps/api/core";
import type { AtlasResult, RepoCity } from "./types";

/** Aggregate stats for every configured repo — the atlas. */
export function scanRepos(): Promise<AtlasResult> {
  return invoke<AtlasResult>("scan_repos");
}

/** Full file tree for one repo — the city. */
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
