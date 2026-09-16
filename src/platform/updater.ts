import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { appVersion } from "./desktop";

export type DesktopUpdate = Update;
export const desktopUpdater = {
  currentVersion: appVersion,
  check,
  relaunch,
};
