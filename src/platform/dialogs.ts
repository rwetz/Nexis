import { open, save } from "@tauri-apps/plugin-dialog";

export type FileDialogFilter = {
  name: string;
  extensions: string[];
};

/** Native dialog access is platform chrome, not capability behavior. */
export function openFiles(options: {
  multiple: boolean;
  filters?: FileDialogFilter[];
}): Promise<string | string[] | null> {
  return open(options);
}

export function openDirectory(): Promise<string | null> {
  return open({ directory: true, multiple: false });
}

export function saveFile(options: {
  defaultPath: string;
  filters?: FileDialogFilter[];
}): Promise<string | null> {
  return save(options);
}
