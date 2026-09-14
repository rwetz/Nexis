import type { Disposable } from "./lifetime";

export interface PersistenceService<Schema extends object> {
  read<Key extends keyof Schema>(key: Key): Promise<Schema[Key] | undefined>;
  /** Resolves after durability and cross-window notification, in write order. */
  write<Key extends keyof Schema>(key: Key, value: Schema[Key]): Promise<void>;
  subscribe(receive: (change: { [K in keyof Schema]: { key: K; value: Schema[K] } }[keyof Schema]) => void): Promise<Disposable>;
}

/** Serialize whole commits, including notifications; rejection must not poison
 * the next write. The adapter owns the existing store/save/broadcast policy. */
export function serializeWrites<Schema extends object>(service: PersistenceService<Schema>): PersistenceService<Schema> {
  let tail = Promise.resolve();
  return {
    read: (key) => service.read(key),
    subscribe: (receive) => service.subscribe(receive),
    write(key, value) {
      const pending = tail.then(() => service.write(key, value));
      tail = pending.catch(() => {});
      return pending;
    },
  };
}
