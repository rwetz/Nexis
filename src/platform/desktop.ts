import { convertFileSrc } from "@tauri-apps/api/core";
import { getName, getVersion } from "@tauri-apps/api/app";
import { getCurrentWindow, ProgressBarStatus } from "@tauri-apps/api/window";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { arch, platform } from "@tauri-apps/plugin-os";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";

export const desktopWindow = getCurrentWindow;
export const desktopWebviewWindow = getCurrentWebviewWindow;
export const desktopProgress = ProgressBarStatus;
export const assetUrl = convertFileSrc;
export const desktopPlatform = platform;
export const desktopArch = arch;
export const appName = getName;
export const appVersion = getVersion;
export const autostart = { enable, disable, isEnabled };
