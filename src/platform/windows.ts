import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Lifetime } from "./lifetime";

type WindowOptions = NonNullable<
  ConstructorParameters<typeof WebviewWindow>[1]
>;
const pending = new Map<string, Promise<WebviewWindow>>();

/** Coalesce concurrent opens of a named destination. Wait for native creation
 * before showing/focusing, and release both event listeners on either result. */
export function ensureWindow(
  label: string,
  options: WindowOptions,
): Promise<WebviewWindow> {
  const existingRequest = pending.get(label);
  if (existingRequest) return existingRequest;
  const request = (async () => {
    const existing = await WebviewWindow.getByLabel(label);
    if (existing) return existing;
    const window = new WebviewWindow(label, options);
    const lifetime = new Lifetime();
    try {
      await new Promise<void>((resolve, reject) => {
        void lifetime
          .own(window.once("tauri://created", () => resolve()))
          .catch(reject);
        void lifetime
          .own(
            window.once("tauri://error", (event) =>
              reject(new Error(String(event.payload))),
            ),
          )
          .catch(reject);
      });
      return window;
    } finally {
      lifetime.dispose();
    }
  })();
  pending.set(label, request);
  void request
    .finally(() => {
      if (pending.get(label) === request) pending.delete(label);
    })
    .catch(() => {});
  return request;
}

export async function openOrFocusWindow(
  label: string,
  options: WindowOptions,
): Promise<void> {
  const window = await ensureWindow(label, options);
  await window.show();
  await window.setFocus();
}
