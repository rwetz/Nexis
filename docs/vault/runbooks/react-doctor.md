---
type: runbook
description: Running the React Doctor audit, and the four fix recipes established when the error count was cleared to zero.
---

# React Doctor audit

`pnpm doctor` (react-doctor, a devDependency). Useful invocations:

- `pnpm doctor --category Bugs --no-warnings` — just the correctness errors.
- `pnpm doctor why <file>:<line>` — why a rule fired, **and** why a suppression didn't apply.
- `pnpm doctor --scope changed --base main` — only what your branch introduced.

CI runs it via `.github/workflows/react-doctor.yml`, currently **advisory** (`blocking` is commented out — it comments on PRs and posts a score, but never fails the check). A pre-commit hook also scans staged files and prints findings without blocking the commit.

As of 2026-07-30 the repo is at **0 error-severity findings across every category**; ~435 warnings remain and are not gated. See the `[1.24.0]` CHANGELOG entry for what was cleared.

## Config

`doctor.config.json` at the repo root. Its one entry excludes `test/**` — that tree is the **editor's syntax-highlighting fixture corpus** (`test.c`, `test.nix`, `test/web/test.jsx`, a Dockerfile, …), sample files that exist to exercise the highlighter and are not application code. Real tests live in `src/**/*.test.ts` and `e2e/` and are still scanned. Don't "fix" a finding in `test/` — it's a fixture.

## Recipes

### 1. Side effects in a `setState` updater → compute, then set

An updater used to *read* current state (`setTabs(curr => { doThing(curr); return curr })`) is not just impure — React doesn't guarantee it runs synchronously at dispatch, so anything read out of it afterwards is unreliable. The pattern used throughout `modules/tabs/lib/useTabs.ts`:

```ts
const curr = tabsRef.current;      // read the mirror
const nextTabs = /* pure compute */;
tabsRef.current = nextTabs;        // eager write, so a second call in the
setTabs(nextTabs);                 //   same tick isn't stale
setActiveId(id);                   // side effects last
```

The eager `tabsRef.current` write matters: the post-commit effect alone leaves the mirror stale between two operations dispatched before a commit.

### 2. Latest-value refs belong in an effect, usually with no dep array

`const xRef = useRef(x); xRef.current = x;` during render is a render-phase write. Move it to `useEffect`. **When the mirrored value is rebuilt every render** — inline arrows into `useTerminalSession`, inline handler objects into `useGlobalShortcuts`, `composer.tsx`'s `submit` — write the effect with **no dependency array at all**. A `[submit]` array re-runs every render anyway *and* trips `no-effect-with-fresh-deps`.

Safe because every reader of these refs is a DOM handler, timer, rAF callback, or CodeMirror extension — none run during render.

### 3. A ref holding only a closure over `setState` → initialize once

`openRenameRef` / `openCodeActionRef` in `modules/editor/EditorPane.tsx`. Setter identity is stable, so pass the closure as the `useRef` initializer and delete the per-render write entirely rather than deferring it to an effect.

### 4. Reading state in an event handler → post-commit mirror + in-flight guard

`modules/explorer/lib/useFileTree.ts`. The mirror lags a commit where an updater didn't, so a fast double-click could double-fire the work. `fetchChildren` tracks in-flight paths and collapses duplicates.

## Suppressions

Per-site only, with a written justification — never a relaxed rule. **The directive must be the last comment line before the flagged line.** Prose above it is fine; a multi-line justification written *after* the directive silently detaches it, and the scan then reports "a disable sits at line N but 4 lines of code separate it from the diagnostic". `pnpm doctor why` will tell you when this has happened.

```ts
// Why this is a false positive, in as many lines as you like.
// react-doctor-disable-next-line react-doctor/effect-needs-cleanup
useEffect(() => { … });
```

Three `effect-needs-cleanup` suppressions exist (`app/App.tsx`, `modules/explorer/FileExplorer.tsx`, `modules/sysmon/useSystemMonitor.ts`): all have real cleanups the rule can't follow because the subscription is reached through a promise or an async loop.

Related: [[editor]], [[system-monitor]], [[pty]].
