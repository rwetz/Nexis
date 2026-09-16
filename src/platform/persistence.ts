import type { Disposable } from "./lifetime";

/** Queue entire transactions, not individual set/save calls, so observers
 * cannot see a later value followed by an earlier notification. */
export function createWriteQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(write: () => Promise<T>): Promise<T> => {
    const pending = tail.then(write);
    tail = pending.catch(() => {});
    return pending;
  };
}

export interface PersistenceService<Schema extends object> {
  read<Key extends keyof Schema>(key: Key): Promise<Schema[Key] | undefined>;
  /** Resolves after durability and cross-window notification, in write order. */
  write<Key extends keyof Schema>(key: Key, value: Schema[Key]): Promise<void>;
  subscribe(
    receive: (
      change: {
        [K in keyof Schema]: { key: K; value: Schema[K] };
      }[keyof Schema],
    ) => void,
  ): Promise<Disposable>;
}

/** Serialize whole commits, including notifications; rejection must not poison
 * the next write. The adapter owns the existing store/save/broadcast policy. */
export function serializeWrites<Schema extends object>(
  service: PersistenceService<Schema>,
): PersistenceService<Schema> {
  const enqueue = createWriteQueue();
  return {
    read: (key) => service.read(key),
    subscribe: (receive) => service.subscribe(receive),
    write(key, value) {
      return enqueue(() => service.write(key, value));
    },
  };
}
