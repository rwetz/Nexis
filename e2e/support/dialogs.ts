// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

// Clearing the modals a fresh profile launches with.
//
// The E2E job builds a release bundle on a clean runner, so every run would be
// a first run: `PackOnboardingDialog` opens as soon as preferences hydrate
// (`hydrated && !packsOnboarded`), and its Radix overlay is `fixed inset-0`
// with `pointer-events: auto` at z-50. Every click on app chrome is then
// answered by the overlay rather than the control, and WebDriver reports
// "element click intercepted … Other element would receive the click:
// <div data-slot="dialog-overlay">". That is what took the nightly job down:
// the terminal spec could not reach `button[title="New tab"]`, so no terminal
// tab ever opened and `.xterm` timed out 15 s later.
//
// `wdio.conf.ts` now seeds `packsOnboarded` before the app starts, so the
// first-run dialog should never appear. This helper stays as the backstop for
// the modals the suite does not control: `UpdaterDialog` opens itself whenever
// a release is newer than the built version, which on a nightly job is a
// matter of release timing rather than of anything the suite controls.
//
// ── Why this asserts clickability rather than the absence of an overlay ──
//
// It used to poll `$(OVERLAY).isExisting()` and treat any hit as "still
// blocked". That is a pure DOM query, and it does not mean what the suite
// needs it to mean. Radix wraps `DialogOverlay` and `DialogContent` in
// *separate* `Presence` boundaries, and `Presence` unmounts on `animationend`.
// When that event does not fire — a backgrounded or uncomposited WebView2 on a
// CI runner can skip it entirely — the content unmounts while the overlay is
// left behind, inert: still in the DOM, no longer intercepting anything.
//
// The old loop then dismissed a ghost until it timed out. Run 33623555508
// (2026-09-02) is the proof: `smoke`'s `before all` died here after 20 s while
// `terminal.test.ts`, which clicks its way through the whole tab lifecycle,
// passed all three of its cases in the same run. Nothing was blocking. The
// "(an unnamed dialog)" in that message is the corroborating detail — the
// content carrying `dialog-title` had already unmounted, leaving no title to
// report.
//
// So the predicate is now the invariant the specs actually depend on: a known
// piece of app chrome is hit-testable. `isClickable()` resolves the element at
// the point, so a real overlay fails it and a ghost does not.

/** Radix overlays render at z-50 over the whole viewport and swallow clicks. */
const OVERLAY =
  '[data-slot="dialog-overlay"], [data-slot="alert-dialog-overlay"]';
/** A live dialog has content; a ghost overlay is left without any. */
const CONTENT =
  '[data-slot="dialog-content"], [data-slot="alert-dialog-content"]';
/** `DialogContent` renders this by default; `AlertDialogContent` does not. */
const CLOSE = '[data-slot="dialog-content"] [data-slot="dialog-close"]';
const TITLE = '[data-slot="dialog-title"], [data-slot="alert-dialog-title"]';

/**
 * The chrome both specs click through, and so the thing that must be reachable.
 * It lives in the always-present tab bar rather than in any pack, so no
 * preference or preset can take it away.
 */
const DEFAULT_ANCHOR = 'button[title="New tab"]';

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
 * Describe what is actually on screen, so a failure here diagnoses itself.
 *
 * The previous message could only say "an unnamed dialog", which is exactly
 * the state that turned out to matter and exactly the state it could not
 * explain. This reports whether a live dialog is up, what the element at the
 * anchor's hit point really is, and the computed state of every overlay — the
 * three facts that separate "a modal is genuinely blocking" from "an inert
 * overlay was left behind by an animation that never ended".
 */
async function describeBlockage(anchor: string): Promise<string> {
  try {
    return await browser.execute(
      (
        overlaySel: string,
        contentSel: string,
        titleSel: string,
        anchorSel: string,
      ) => {
        const lines: string[] = [];

        const title = document.querySelector(titleSel);
        const content = document.querySelectorAll(contentSel);
        lines.push(
          content.length
            ? `live dialog(s): ${content.length}, title: ${
                title?.textContent?.trim() || "(none)"
              }`
            : "no dialog content is mounted (any overlay below is a ghost)",
        );

        const el = document.querySelector(anchorSel);
        if (!el) {
          lines.push(`anchor ${anchorSel} is not in the DOM`);
        } else {
          const r = el.getBoundingClientRect();
          const at = document.elementFromPoint(
            r.left + r.width / 2,
            r.top + r.height / 2,
          );
          const slot = at?.getAttribute("data-slot");
          lines.push(
            `anchor hit point resolves to <${
              at?.tagName.toLowerCase() ?? "nothing"
            }${slot ? ` data-slot="${slot}"` : ""}>`,
          );
        }

        document.querySelectorAll(overlaySel).forEach((o, i) => {
          const s = getComputedStyle(o);
          lines.push(
            `overlay[${i}] state=${o.getAttribute("data-state") ?? "?"} ` +
              `pointer-events=${s.pointerEvents} opacity=${s.opacity} ` +
              `display=${s.display}`,
          );
        });

        return lines.join("; ");
      },
      OVERLAY,
      CONTENT,
      TITLE,
      anchor,
    );
  } catch (e) {
    return `could not inspect the page (${String(e)})`;
  }
}

/**
 * Wait until app chrome is reachable, dismissing any modal that is covering it.
 *
 * `settleMs` is the load-bearing argument. `App` renders its chrome before it
 * hydrates preferences — `initPrefs()` runs in a `useEffect`, so
 * `[data-tauri-drag-region]` exists while `hydrated` is still false and a
 * hydration-gated dialog has not mounted yet. Returning on the first clear
 * poll would therefore hand the spec a window in which a dialog appears
 * *after* the check and covers the control it is about to click. Requiring the
 * anchor to stay clickable for a continuous stretch closes that window; the
 * cost on a profile that was already onboarded is one `settleMs` per spec.
 */
export async function dismissStartupDialogs({
  timeout = 20_000,
  settleMs = 1_500,
  anchor = DEFAULT_ANCHOR,
}: {
  timeout?: number;
  settleMs?: number;
  anchor?: string;
} = {}): Promise<void> {
  let clearSince: number | null = null;
  try {
    await browser.waitUntil(
      async () => {
        // The invariant is that a click would land, not that no overlay
        // element exists anywhere in the document.
        if (await $(anchor).isClickable()) {
          if (clearSince === null) clearSince = Date.now();
          return Date.now() - clearSince >= settleMs;
        }

        clearSince = null;
        // Only reach for a dismissal when something is actually open. If the
        // anchor is unreachable because the app is still starting, Escape
        // would do nothing useful and would land in whatever has focus.
        if (await $(CONTENT).isExisting()) await dismissTopDialog();
        return false;
      },
      { timeout, interval: 250 },
    );
  } catch {
    throw new Error(
      `App chrome (${anchor}) was still not clickable after ${timeout} ms. ` +
        `State: ${await describeBlockage(anchor)}. ` +
        `If a live dialog is up and cannot be closed by its close button or ` +
        `by Escape, teach dismissTopDialog() how to close it. If no dialog ` +
        `content is mounted, the anchor is covered by something that is not a ` +
        `modal, or the app never finished starting.`,
    );
  }
}
