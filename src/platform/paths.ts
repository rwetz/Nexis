import { appConfigDir, homeDir, join } from "@tauri-apps/api/path";

/** Host application-data root. Workspace environment does not apply. */
export function hostAppConfigDir(): Promise<string> {
  return appConfigDir();
}

/** Host user home. Workspace roots are resolved by the workspace service. */
export function hostHomeDir(): Promise<string> {
  return homeDir();
}

export function joinHostPath(...parts: string[]): Promise<string> {
  return join(...parts);
}
