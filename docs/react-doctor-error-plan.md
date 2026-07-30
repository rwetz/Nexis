# React Doctor — error cleanup plan

**Goal:** clear the 46 `error`-severity findings from React Doctor (v0.9.2).
Baseline captured 2026-07-29. Warnings (463 of them) are out of scope here.

**Workflow per batch:**
1. `pnpm doctor --category Bugs --verbose` (or `pnpm doctor why <file>:<line>`) to read the finding in context.
2. Read the actual code first — treat each finding as a hypothesis, not a fact. The lazy-init `if (!ref.current) ref.current = …` pattern is explicitly *allowed*, so some `no-ref-current-in-render` hits may be false positives to suppress with a comment, not fixes.
3. Fix root cause, don't relax config. Run `pnpm doctor --scope changed --base main` + relevant tests after each file.
4. `pnpm exec tsc --noEmit` and `pnpm test:coverage` before pushing (per CLAUDE.md pre-push checklist).

Order below is smallest/lowest-risk → largest, so momentum builds and the core files come last.

---

## Batch 1 — `rules-of-hooks` (1 error) · highest severity, do first
A `useCallback` is called conditionally, so Hook order can shift between renders and React can attach state to the wrong Hook.

- [ ] `src/modules/source-control/ConflictSection.tsx:61` — hoist the `useCallback` above any early return / conditional so it always runs.

## Batch 2 — `effect-needs-cleanup` (4 errors) · clean recipe, low risk
`useEffect` sets up a subscription/listener/timer without a guaranteed cleanup. Return a cleanup that tears down *every* allocation (unlisten, clearTimeout/Interval, abort).

- [ ] `src/app/App.tsx:606`
- [ ] `src/modules/editor/NewEditorDialog.tsx:45`
- [ ] `src/modules/explorer/FileExplorer.tsx:468`
- [ ] `src/modules/sysmon/useSystemMonitor.ts:124`

Note: several use Tauri `listen()`, which returns a `Promise<UnlistenFn>` — cleanup must await/track the unlisten so a fast unmount still detaches.

## Batch 3 — `no-impure-state-updater` (15 errors) · touches core state
The `setState(prev => …)` updater performs side effects (e.g. `fetchChildren()`). React may run updaters more than once. Keep the updater pure (return next state only); move the side effect into the event handler or an effect that reacts to the new state.

- [ ] `src/modules/tabs/lib/useTabs.ts` — 271, 385, 431, 464, 482, 498, 661, 848, 886, 1032, 1092 (11) — **core tab state; do this file as its own reviewed pass.** Fix one, confirm the recipe, then the rest.
- [ ] `src/modules/explorer/lib/useFileTree.ts` — 137, 155, 200 (3)
- [ ] `test/web/test.jsx:28` — test fixture; likely intentional or removable. Confirm before touching.

## Batch 4 — `no-ref-current-in-render` (26 errors) · biggest, most review needed
`ref.current` mutated during render. React can replay/discard render work, so the write can leak from UI that never commits. Move the write into an event handler or effect — **unless** it's the allowed null-guarded lazy-init pattern, in which case suppress with a justification comment.

- [ ] `src/modules/editor/EditorPane.tsx` — 141, 143, 193, 195, 197, 200, 211, 215, 224 (9)
- [ ] `src/modules/explorer/FileExplorer.tsx` — 202, 204, 467 (3)
- [ ] `src/app/App.tsx` — 244, 344 (2)
- [ ] `src/modules/ai/components/AiPanel.tsx` — 704, 706 (2)
- [ ] `src/components/ui/backgrounds/Aurora.tsx:121`
- [ ] `src/components/ui/backgrounds/DarkVeil.tsx:104`
- [ ] `src/components/ui/backgrounds/DotField.tsx:59`
- [ ] `src/modules/ai/lib/composer.tsx:358`
- [ ] `src/modules/editor/lib/useDocument.ts:52`
- [ ] `src/modules/python/usePythonEnv.ts:57`
- [ ] `src/modules/shortcuts/lib/useGlobalShortcuts.ts:28`
- [ ] `src/modules/sysmon/useSystemMonitor.ts:91`
- [ ] `src/modules/terminal/lib/useTerminalSession.ts:601`
- [ ] `test/web/test.jsx:185` — test fixture; confirm before touching.

The three `backgrounds/*` files are animation loops — likely storing a rAF handle or frame state in a ref; check whether these are genuinely render-phase writes vs. inside a `useEffect`/`requestAnimationFrame` callback (which is fine).

---

## Suggested sequencing for tomorrow
1. Batches 1 + 2 together — small, mechanical, one commit.
2. Batch 3 `useTabs.ts` as its own commit (core state, wants careful review + a full `pnpm test:coverage`).
3. Batch 4 in 2–3 commits grouped by area (editor, backgrounds, misc hooks).
4. Decide on the two `test/web/test.jsx` findings — suppress or exclude the fixture from scanning rather than "fixing" it.

Re-run `pnpm doctor --score --no-score --category Bugs` at the end to confirm the error count is 0.
