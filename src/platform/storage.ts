import { LazyStore } from "@tauri-apps/plugin-store";
import { createWriteQueue } from "./persistence";

/** One native handle and mutation queue per storage file in this webview.
 * Application schemas and cross-window event names remain with their owner. */
export function createStorage(path: string) {
  if (!path || /[\\/]/.test(path))
    throw new Error("Store must be an app-data filename");
  const native = new LazyStore(path, { defaults: {}, autoSave: 200 });
  const enqueue = createWriteQueue();
  return {
    get: <T>(key: string) => native.get<T>(key),
    entries: <T = unknown>() => native.entries<T>(),
    set: (key: string, value: unknown) => enqueue(() => native.set(key, value)),
    delete: (key: string) => enqueue(() => native.delete(key)),
    save: () => enqueue(() => native.save()),
    onChange: <T>(receive: (key: string, value: T | undefined) => void) =>
      native.onChange<T>(receive),
  };
}

const stores = new Map<string, ReturnType<typeof createStorage>>();
export function openStore(path: string) {
  let store = stores.get(path);
  if (!store) {
    store = createStorage(path);
    stores.set(path, store);
  }
  return store;
}
