// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

// Clearing the modals a fresh profile launches with.
//
// The E2E job builds a release bundle on a clean runner, so every run is a
// first run: `PackOnboardingDialog` opens as soon as preferences hydrate
// (`hydrated && !packsOnboarded`), and its Radix overlay is `fixed inset-0`
// with `pointer-events: auto` at z-50. Every click on app chrome is then
// answered by the overlay rather than the control, and WebDriver reports
// "element click intercepted … Other element would receive the click:
// <div data-slot="dialog-overlay">". That is what took the nightly job down:
// the terminal spec could not reach `button[title="New tab"]`, so no terminal
// tab ever opened and `.xterm` timed out 15 s later.
//
// The smoke spec passed through the same overlay because `isEnabled()` and
// `isExisting()` are DOM queries — occlusion only matters to a real click.
//
// This is deliberately written against *any* blocking modal rather than
// against the onboarding dialog by name. `UpdaterDialog` opens itself the
// same way whenever a release is newer than the built version, which on a
// nightly job is a matter of release timing rather than of anything the
// suite controls.

/** Radix overlays render at z-50 over the whole viewport and swallow clicks. */
const OVERLAY =
  '[data-slot="dialog-overlay"], [data-slot="alert-dialog-overlay"]';
/** `DialogContent` renders this by default; `AlertDialogContent` does not. */
const CLOSE = '[data-slot="dialog-content"] [data-slot="dialog-close"]';
const TITLE =
  '[data-slot="dialog-title"], [data-slot="alert-dialog-title"]';

/** Name whatever is still up, so a future failure diagnoses itself. */
async function openDialogTitle(): Promise<string> {
  try {
    const title = await $(TITLE);
    if (await title.isExisting()) {
      const text = (await title.getText()).trim();
      if (text) return `"${text}"`;
    }
  } catch {
    // The dialog went away between the poll and the read — nothing to name.
  }
  return "an unnamed dialog";
}

/**
 * Close the topmost modal.
 *
 * The close button is preferred because it is the affordance a user has, but
 * an alert dialog has none and a stacked dialog's button can itself be
 * covered. Escape is the fallback: Radix routes it to the topmost layer, and
 * on an alert dialog it maps to cancel, which is the non-destructive choice.
 */
async function dismissTopDialog(): Promise<void> {
  const close = await $(CLOSE);
  if (await close.isExisting()) {
    try {
      await close.click();
      return;
    } catch {
      // Covered by another overlay — fall through to Escape.
    }
  }
  await browser.keys("Escape");
}

/**
 * Wait until no modal is up, dismissing any that are.
 *
 * `settleMs` is the load-bearing argument. `App` renders its chrome before it
 * hydrates preferences — `initPrefs()` runs in a `useEffect`, so
 * `[data-tauri-drag-region]` exists while `hydrated` is still false and the
 * onboarding dialog has not mounted yet. Returning on the first clear poll
 * would therefore hand the spec a window in which the dialog appears *after*
 * the check and covers the control it is about to click. Requiring the
 * viewport to stay clear for a continuous stretch closes that window; the
 * cost on a profile that was already onboarded is one `settleMs` per spec.
 *
 * Dismissal persists: `PackOnboardingDialog`'s `onOpenChange` writes
 * `packsOnboarded`, so only the first spec in a run pays for the dialog.
 */
export async function dismissStartupDialogs({
  timeout = 20_000,
  settleMs = 1_500,
}: { timeout?: number; settleMs?: number } = {}): Promise<void> {
  let clearSince: number | null = null;
  try {
    await browser.waitUntil(
      async () => {
        if (await $(OVERLAY).isExisting()) {
          clearSince = null;
          await dismissTopDialog();
          return false;
        }
        if (clearSince === null) clearSince = Date.now();
        return Date.now() - clearSince >= settleMs;
      },
      { timeout, interval: 250 },
    );
  } catch {
    throw new Error(
      `A modal was still blocking the UI after ${timeout} ms ` +
        `(${await openDialogTitle()}). Its overlay intercepts every click on ` +
        `app chrome, so any spec that clicks will fail with ` +
        `"element click intercepted" rather than with anything about the ` +
        `dialog. If this dialog cannot be closed by its close button or by ` +
        `Escape, teach dismissTopDialog() how to close it.`,
    );
  }
}
