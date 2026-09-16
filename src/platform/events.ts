import { defineEvent } from "./ipc";
import { hostIpc } from "./tauri";

export type UnlistenFn = () => void;
export type PlatformEventMessage<T> = { payload: T };

/** Each subscription has an idempotent lifetime and suppresses delivery after
 * cleanup. Owners that register several listeners should use ipc.events(). */
export async function listen<T>(
  name: string,
  receive: (event: PlatformEventMessage<T>) => void,
): Promise<UnlistenFn> {
  const scope = hostIpc.events();
  try {
    await scope.listen(defineEvent<T>(name), (payload) => receive({ payload }));
    return () => scope.dispose();
  } catch (error) {
    scope.dispose();
    throw error;
  }
}

export function emit<T>(name: string, payload?: T): Promise<void> {
  return hostIpc.emit(defineEvent<T | undefined>(name), payload);
}
