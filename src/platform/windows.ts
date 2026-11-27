import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { currentMonitor } from "@tauri-apps/api/window";
import { defineCommand } from "./ipc";
import { Lifetime } from "./lifetime";
import { hostIpc } from "./tauri";

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

/** The usable size, in logical pixels, of the monitor this window is on
 * (the screen minus the taskbar or dock), or null if it cannot be read. */
export async function currentWorkArea(): Promise<{ width: number; height: number } | null> {
  try {
    const monitor = await currentMonitor();
    if (!monitor) return null;
    const { width, height } = monitor.workArea.size.toLogical(monitor.scaleFactor);
    return { width, height };
  } catch {
    return null;
  }
}

/** macOS overlay title bar: the native traffic lights float over our own
 * header. Where they sit is set after creation with `placeTrafficLights`,
 * not with Tauri's `trafficLightPosition` (see traffic_lights.rs). */
export function macOverlayTitleBar() {
  return { titleBarStyle: "overlay" as const, hiddenTitle: true };
}

const windowTrafficLights = defineCommand<{ x: number; y: number }, void>(
  "window_traffic_lights",
  "host",
);

/** Place the calling window's traffic lights at (`x`, `y`) points: `x` the
 * close button's left edge, `y` the buttons' vertical centre. The backend
 * keeps them there and leaves them alone in native fullscreen. */
export function placeTrafficLights(x: number, y: number): Promise<void> {
  return hostIpc.call(windowTrafficLights, { x, y });
}
