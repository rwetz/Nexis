// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Expansion packs — the single source of truth for which features are core
 * and which are toggleable. Packs are enablement gating over code that
 * already ships in the binary, not installation (see
 * docs/vault/decisions/expansion-packs.md). Every sidebar view must be
 * either in CORE_VIEWS or claimed by exactly one pack.
 */
import type { IconName } from "@/components/icon";
import type { SidebarViewId } from "@/modules/sidebar/types";
import { SIDEBAR_VIEW_IDS } from "@/modules/sidebar/types";

/**
 * Packs are organized on two different axes, on purpose.
 *
 * The original six are by *tool kind* — navigation, code tools, dev tools.
 * `web-dev`, `mobile` and `art` are by *what you are building*, which is the
 * axis that matches how the work actually splits, and the one a person can
 * answer about themselves on first run. `ml-lab` already sat on that axis and
 * stays as it is. The two coexist because several panels belong to more than
 * one domain (an HTTP client to both Backend and Web Dev), which is exactly
 * why enablement is per-pack and a preset is only a bundle over them.
 */
export const PACK_IDS = [
  "navigation-plus",
  "code-tools",
  "ai-extras",
  "dev-tools",
  "ml-lab",
  "advanced",
  "web-dev",
  "mobile",
  "art",
] as const;

export type PackId = (typeof PACK_IDS)[number];

export type PackDef = {
  id: PackId;
  label: string;
  /** One-line description shown in the Features settings section. */
  description: string;
  /**
   * Mark for the rail and the Settings → Features rows, resolved through
   * `src/components/icon.tsx` like every other icon — the plugin contract
   * names an icon, never a vendor object (pitfall #18).
   */
  icon: IconName;
  /**
   * Sidebar views this pack owns. Empty is legitimate and means the taxonomy
   * landed before the panels did: the pack is a real, toggleable container
   * with nothing in it yet. Surfaces that list packs should say so rather
   * than render a toggle that appears to do nothing.
   */
  views: readonly SidebarViewId[];
};

/** Views that are always available — the Bare-Bones surface plus the AI
 *  chat/agent (which is not a sidebar view). Never gate these. */
export const CORE_VIEWS: readonly SidebarViewId[] = [
  "explorer",
  "recent-files",
  "source-control",
  "agent-queue",
];

export const PACKS: Record<PackId, PackDef> = {
  "navigation-plus": {
    id: "navigation-plus",
    label: "Navigation+",
    description: "Symbol outline for the open file and code bookmarks.",
    icon: "outline",
    views: ["outline", "bookmarks"],
  },
  "code-tools": {
    id: "code-tools",
    label: "Code Tools",
    description:
      "Build runner, test runner, debugger, workspace symbol search, and code review.",
    icon: "tools",
    views: ["build", "tests", "debugger", "symbol-search", "code-review"],
  },
  "ai-extras": {
    id: "ai-extras",
    label: "AI Extras",
    description:
      "AI refactoring and prompt templates. The AI chat itself is core and unaffected.",
    icon: "sparkle",
    views: ["refactor", "prompt-templates"],
  },
  "dev-tools": {
    id: "dev-tools",
    label: "Dev Tools",
    description:
      "Process activity, system resource monitor, port monitor, REPL, database client, workspace profiles, and SSH.",
    icon: "cpu",
    views: [
      "processes",
      "system-monitor",
      "ports",
      "repl",
      "database",
      "profiles",
      "ssh",
    ],
  },
  "ml-lab": {
    id: "ml-lab",
    label: "ML Lab",
    description:
      "Local model training and experiments via nexis-ml. Runs against a local Python/Rust engine.",
    icon: "brain",
    views: ["ml"],
  },
  advanced: {
    id: "advanced",
    label: "Advanced",
    description:
      "Terminal sharing, workspace notes, shell snippets, code snippets, and release tooling.",
    icon: "layers",
    views: ["share", "notes", "shell-snippets", "snippets", "release"],
  },
  "web-dev": {
    id: "web-dev",
    label: "Web Dev",
    description:
      "Running and inspecting web apps: multi-viewport preview, an HTTP client, and scratchpad codecs.",
    icon: "globe",
    views: ["web-tools", "http-client"],
  },
  mobile: {
    id: "mobile",
    label: "Mobile",
    description:
      "Expo and React Native: a Metro dev-server runner, device logs, and an Android device mirror.",
    icon: "device-mobile",
    views: [],
  },
  art: {
    id: "art",
    label: "Art",
    description:
      "SVG work: an icon-scale playground, generative backdrops, and a palette with contrast checks.",
    icon: "brush",
    views: ["svg-playground", "palette", "backdrop", "icon-set", "favicon"],
  },
};

// ── Presets ─────────────────────────────────────────────────────────────────

/**
 * Presets are a bundle over packs and nothing else — no second concept, no
 * state of their own. Changing a preset only ever writes `enabledPacks`, which
 * is the same config Settings → Features edits by hand.
 */
export const PRESET_IDS = [
  "bare-bones",
  "standard",
  "web-dev",
  "mobile",
  "art",
  "everything",
] as const;

export type PresetId = (typeof PRESET_IDS)[number];

export type PresetDef = {
  id: PresetId;
  label: string;
  /** One line on the first-run card, addressed to what the user is building. */
  blurb: string;
  /** Bespoke art rather than a general-purpose glyph — see icon-art.tsx. */
  icon: IconName;
  packs: readonly PackId[];
};

/**
 * The domain presets deliberately build on Standard's packs rather than
 * replacing them: someone who says "I'm building a web app" still wants the
 * build runner and the debugger. The domain pack is added on top, so the
 * preset stays a strict statement about *what you are building* while the
 * tool-kind packs keep answering *what you work with*.
 *
 * Art is the exception, and it is intentional — see the note on it below.
 */
export const PRESETS: Record<PresetId, PresetDef> = {
  "bare-bones": {
    id: "bare-bones",
    label: "Bare-Bones",
    blurb:
      "Terminal, editor, files, source control, and AI chat. Nothing else.",
    icon: "preset-bare-bones",
    packs: [],
  },
  standard: {
    id: "standard",
    label: "Standard",
    blurb: "The core plus code navigation, build/test/debug, and dev tools.",
    icon: "preset-standard",
    packs: ["navigation-plus", "code-tools", "dev-tools"],
  },
  "web-dev": {
    id: "web-dev",
    label: "Web Dev",
    blurb: "Standard, plus preview, request and scratchpad tools for the web.",
    icon: "preset-web-dev",
    packs: ["navigation-plus", "code-tools", "dev-tools", "web-dev"],
  },
  mobile: {
    id: "mobile",
    label: "Mobile",
    blurb: "Standard, plus Expo/React Native runners, logs, and devices.",
    icon: "preset-mobile",
    packs: ["navigation-plus", "code-tools", "dev-tools", "mobile"],
  },
  // The one preset that does not build on Standard, and deliberately does not
  // build on anything else either. Someone drawing wants files, source control
  // and the art tools; a symbol outline and a bookmark list are for reading
  // code, and every panel that is not the work is a panel in the way.
  art: {
    id: "art",
    label: "Art",
    blurb: "Files, source control, and the SVG tools. Nothing that reads code.",
    icon: "preset-art",
    packs: ["art"],
  },
  everything: {
    id: "everything",
    label: "Everything",
    blurb: "The full surface, ML Lab and all. The classic Nexis experience.",
    icon: "preset-everything",
    packs: PACK_IDS,
  },
};

/** Preset id → the packs it turns on. Derived so the two cannot drift. */
export const PACK_PRESETS: Record<PresetId, readonly PackId[]> =
  Object.fromEntries(
    PRESET_IDS.map((id) => [id, PRESETS[id].packs]),
  ) as Record<PresetId, readonly PackId[]>;

export function isPresetId(value: unknown): value is PresetId {
  return (
    typeof value === "string" &&
    (PRESET_IDS as readonly string[]).includes(value)
  );
}

export function isPackId(value: unknown): value is PackId {
  return (
    typeof value === "string" && (PACK_IDS as readonly string[]).includes(value)
  );
}

const VIEW_TO_PACK: ReadonlyMap<SidebarViewId, PackId> = new Map(
  (Object.values(PACKS) as PackDef[]).flatMap((p) =>
    p.views.map((v) => [v, p.id] as const),
  ),
);

/** The pack that owns a view, or null for core views. */
export function packForView(view: SidebarViewId): PackId | null {
  return VIEW_TO_PACK.get(view) ?? null;
}

/** Whether a feature owned by `pack` is available under the given pack
 *  config. Core features (no owning pack) pass `null`/`undefined` and are
 *  always available. Used for any pack-gated surface that isn't a sidebar
 *  view: palette commands, keybindings, settings rows. */
export function packEnabled(
  pack: PackId | null | undefined,
  enabledPacks: readonly PackId[],
): boolean {
  return pack == null || enabledPacks.includes(pack);
}

/** Whether a sidebar view is available under the given pack config. */
export function viewEnabled(
  view: SidebarViewId,
  enabledPacks: readonly PackId[],
): boolean {
  return packEnabled(VIEW_TO_PACK.get(view), enabledPacks);
}

/** Sanity: every sidebar view is core or claimed by exactly one pack.
 *  Checked by a unit test; exported so the test can't drift from the data. */
export function unclaimedViews(): SidebarViewId[] {
  return SIDEBAR_VIEW_IDS.filter(
    (v) => !CORE_VIEWS.includes(v) && !VIEW_TO_PACK.has(v),
  );
}
