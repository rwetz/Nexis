# UI Improvements Plan

Derived from a full design critique across all major screens (June 2026).
Covers the terminal view, editor, sidebar rail, settings modal, keyboard shortcuts modal, and welcome screen.

Target release: **v1.15.0** (polish/UX — no new features, no breaking changes)

---

## Priority tiers

| Symbol | Meaning |
|--------|---------|
| 🔴 | Critical — noticeable quality gap, fix before next release |
| 🟡 | Moderate — polish issue, worth a dedicated pass |
| 🟢 | Minor — small win, batch together |

---

## 🔴 P1 — Sidebar rail overflow menu

**Problem:** The overflow popover contains 20+ items across only two vague buckets (PINNED / MORE). Every item carries identical visual weight. Users have no scannable structure to orient by.

**File:** `src/modules/sidebar/SidebarRail.tsx`
- Item definitions: lines 105–130
- Overflow popover render: lines 174–251
- `OverflowRow` component: lines 341–414

**Implementation:**

1. Add a `group` field to `RailItemDef` — e.g. `"navigation" | "code" | "ai" | "devtools" | "advanced"`.
2. Assign every item in the `allItems` array a group:

   | Group | Items |
   |-------|-------|
   | **Navigation** | Files, Recent Files, Outline, Bookmarks |
   | **Code** | Source Control, Build, Tests, Debugger, Symbol Search, Code Review |
   | **AI** | Agent Queue, AI Refactor, Prompt Templates |
   | **Dev Tools** | Processes, Ports, REPL, Database, Profiles, SSH |
   | **Advanced** | Share, Workspace Notes, Shell Snippets, Snippets, Release |

3. In the popover render, replace the flat list with grouped sections. Each group gets a small uppercase label (same style as the existing PINNED/MORE headers) and a subtle `<hr>`-style divider between groups.
4. Remove the PINNED / MORE split — pinned items already live in the rail itself; the popover is the overflow, not a second pin zone.

**Acceptance criteria:**
- Overflow popover shows ≤ 5 named groups with visible section labels
- Keyboard navigation still works top-to-bottom across groups
- Pin/unpin toggle on each item is preserved

---

## 🔴 P2 — Key badge inconsistency in shortcuts modal

**Problem:** Most shortcut keys render as pill badges (`Ctrl`, `W`, `Tab`) but punctuation characters (`,` `` ` `` `]`) appear as bare unstyled text. Single exception breaks the visual system.

**Files:**
- `src/components/ui/kbd.tsx` — `Kbd` and `KbdGroup` components (lines 9–29)
- `src/settings/sections/ShortcutsSection.tsx` — shortcut row render (lines 117–144)
- `src/modules/shortcuts/shortcuts.ts` — shortcut definitions (lines 75–134)

**Implementation:**

1. The `Kbd` component at `kbd.tsx` already renders correct pill styling. The issue is in how `ShortcutsSection.tsx` splits a shortcut's key string into tokens before passing them to `Kbd`. Locate the tokenizer/split logic and confirm it handles single-character punctuation.

2. Ensure the token array for each shortcut wraps *every* key token — including `,`, `` ` ``, `]`, `[`, `.`, `/` — in a `<Kbd>` element. No token should ever render as raw text.

3. `Jump to tab 1–9` currently renders as one elongated pill (`1...9`). Change to two `<Kbd>` elements: `<Kbd>1</Kbd>` `<span>–</span>` `<Kbd>9</Kbd>` so it reads as a range, not a single key.

4. Section headers in the shortcuts list (GENERAL, TABS, PANES, SEARCH, AI, VIEW, EDITOR) have the same low-contrast uppercase style as settings section headers — fix as part of P3 below.

**Acceptance criteria:**
- Every key token in the shortcuts modal is wrapped in a pill badge
- `Jump to tab 1–9` renders as two distinct key badges with a dash separator
- Visual audit: no bare text between key badges on any row

---

## 🟡 P3 — Section header weight (settings + shortcuts modal)

**Problem:** Section headers (`Appearance`, `Zoom`, `Editor`, `Explorer` in settings; `GENERAL`, `TABS`, `PANES` in shortcuts) use the same visual style as body description copy. Pages lack scannable structure.

**Files:**
- `src/settings/sections/GeneralSection.tsx` — "Appearance", "Zoom", "Editor", "Explorer" headers
- `src/settings/sections/` — all other section files share the same pattern
- `src/settings/sections/ShortcutsSection.tsx` — "GENERAL", "TABS", "PANES" etc.

**Implementation:**

1. Create (or update) a shared `<SettingsSectionHeader>` component — or a Tailwind utility class combination — so every section header is styled consistently:
   - Font size: `text-xs` (11–12px)
   - Weight: `font-semibold`
   - Color: `text-foreground/70` (slightly lighter than body, clearly above `text-muted-foreground`)
   - Top margin: add `mt-6` before each header to create breathing room between sections
   - Keep existing `mb-2` or `mb-3` below

2. Apply the same treatment to shortcuts modal group headers — they should match the settings headers visually since both are the same UI pattern.

3. No changes needed to the tab bar at the top of the settings dialog — that's already well-differentiated.

**Acceptance criteria:**
- Section headers are visually distinct from description/body text at a glance
- Settings and shortcuts section headers share the same exact style
- No section feels merged with the one above it

---

## 🟡 P4 — Settings modal scroll affordance

**Problem:** The settings modal content (General tab) is taller than the visible modal area. The "Terminal" section is partially cut off at the bottom with no indication that the content is scrollable.

**File:** `src/settings/SettingsDialog.tsx` (lines 89–100, scroll container)

**Implementation:**

1. Find the scrollable content wrapper inside `SettingsDialog.tsx`. Add a bottom fade overlay — an absolutely-positioned `div` with a gradient from transparent to the modal background color — that sits above the scroll container at the bottom edge. This fades when the user has scrolled to the bottom.

2. Optionally add a thin scrollbar that appears on hover (`::-webkit-scrollbar` styling or the Tailwind `scrollbar-thin` utility if it's available).

3. Ensure the modal has a defined `max-height` so the scroll region is always constrained and the fade is always visible when content overflows.

**Acceptance criteria:**
- When the General tab has overflowing content, a fade is visible at the bottom of the modal
- The fade disappears when scrolled to the bottom
- All sections (including Terminal) are reachable by scrolling

---

## 🟡 P5 — Welcome screen: duplicate "New terminal" + missing AI entry point

**Problem:** "New terminal" appears both as the primary CTA button and as the first item in the shortcut reference grid below it. The app's AI-native identity is not mentioned anywhere on the welcome screen.

**File:** `src/app/WelcomeScreen.tsx`
- `SHORTCUTS` array: lines 37–44
- CTA button: lines 90–93
- Shortcut grid: lines 98–117

**Implementation:**

1. In the `SHORTCUTS` array, replace the `"New terminal"` entry with `"Open AI agent"` (or equivalent command label). Map it to the correct keybinding from `shortcuts.ts`.

2. Add a subtitle line below `"Open a terminal or file to get started"` that surfaces the AI identity. Something like:
   ```
   "Open a terminal or file to get started — or press Ctrl+I to ask the AI agent."
   ```
   Keep it a single line, `text-sm text-muted-foreground`. Do not add a second CTA button.

3. If `"Open AI agent"` doesn't have a shortcut assigned yet, assign one in `shortcuts.ts` first, then reference it in the welcome screen.

**Acceptance criteria:**
- "New terminal" appears exactly once on the welcome screen (the CTA button)
- The shortcut grid contains a distinct sixth action that is not a duplicate of the CTA
- The welcome screen copy references the AI capability in one line

---

## 🟡 P6 — Terminal recording indicator discoverability

**Problem:** The recording toggle button (the `•` dot) in the top-right corner of the terminal pane is invisible to new users — it has no label, no visible boundary, and no tooltip shown in the resting state. Users see a mysterious dot with no affordance.

**File:** `src/modules/terminal/TerminalPane.tsx` — lines 164–190

**Implementation:**

1. Confirm the button has a `title` or Radix `<Tooltip>` attached. If the tooltip only appears during an active recording state, add a resting-state tooltip: `"Start recording"` (or equivalent label).

2. Give the button a visible boundary on hover — `hover:bg-muted` or `hover:bg-white/10` — so it reads as a clickable target and not a status indicator.

3. Consider whether this button belongs in the terminal pane header toolbar alongside other terminal actions, rather than floating in the content area corner.

**Acceptance criteria:**
- Hovering the dot shows a tooltip describing its function
- The button has a visible hover state
- Its purpose is discoverable without prior knowledge

---

## 🟢 P7 — Accent color: define role and apply consistently

**Problem:** The coral/salmon color (used on the zoom slider track, CTA button, and markdown preview links) has no named CSS variable of its own — it appears to be hardcoded in individual components. There's no consistent rule for when it appears.

**File:** `src/styles/globals.css` (lines 67–68 light, 102–103 dark) + individual component files

**Implementation:**

1. Add a dedicated CSS variable to `globals.css`:
   ```css
   :root {
     --brand: oklch(0.72 0.15 35);        /* coral/salmon */
     --brand-foreground: oklch(1 0 0);    /* white text on brand */
   }
   ```
   Adjust the OKLch values to match the existing coral already in use (sample from the CTA button's current color).

2. Replace all hardcoded coral/salmon values across the codebase with `var(--brand)` / `bg-brand` (add to Tailwind config if not already extended).

3. Define the role in a code comment: brand color is used for **primary CTAs, active/selected states, and the AI agent indicator**. Not for links (those stay blue/default) or decorative elements.

4. Audit usage: zoom slider track, welcome screen CTA, any active tab indicator, AI panel header — these should all pull from `--brand`. Markdown links should stay on the default link color.

**Acceptance criteria:**
- `--brand` variable defined in `globals.css`
- Zero hardcoded coral hex/oklch values remain outside of the variable definition
- Zoom slider, CTA, and AI indicator all visually match each other

---

## 🟢 P8 — App icon polish

**Problem:** The current icon (black/white woven mesh on a dark rounded square) reads as a placeholder. It doesn't carry the energy of the animated blue welcome screen background, which is the strongest visual identity in the app.

**Note:** This is lower priority and potentially out of scope for v1.15.0. Flag for a dedicated brand pass.

**When to act:** If a brand/icon refresh is planned, the welcome screen's animated gradient is the right direction to draw from — deep blue, fluid motion, technical precision.

---

## Sequencing for v1.15.0

| Order | Item | Effort |
|-------|------|--------|
| 1 | P2 — Key badge consistency | ~1h |
| 2 | P3 — Section header weight | ~1h |
| 3 | P5 — Welcome screen dedup + AI copy | ~30m |
| 4 | P6 — Recording dot tooltip + hover | ~30m |
| 5 | P4 — Settings scroll affordance | ~1h |
| 6 | P7 — Accent color variable | ~1.5h |
| 7 | P1 — Sidebar rail restructure | ~3h |
| 8 | P8 — App icon | defer |

**Estimated total:** ~9h of implementation + testing

---

## Release checklist additions for UI changes

Before tagging v1.15.0, visually verify each of the following:

- [ ] Shortcuts modal: every key badge (including `,` `` ` `` `]`) renders as a pill
- [ ] Shortcuts modal: `Jump to tab 1–9` shows two badges with dash separator
- [ ] Settings: section headers visually distinct from body copy in all tabs
- [ ] Settings: bottom fade visible when General tab content overflows
- [ ] Welcome screen: "New terminal" appears exactly once; AI entry point visible
- [ ] Terminal: recording dot has tooltip and hover state
- [ ] Sidebar overflow: groups visible with labeled sections, no flat 20-item list
- [ ] Accent color: zoom slider, CTA, and any AI indicator are visually identical
