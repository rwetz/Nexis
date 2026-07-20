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
import type { SidebarViewId } from "@/modules/sidebar/types";
import { SIDEBAR_VIEW_IDS } from "@/modules/sidebar/types";

export const PACK_IDS = [
  "navigation-plus",
  "code-tools",
  "ai-extras",
  "dev-tools",
  "ml-lab",
  "advanced",
] as const;

export type PackId = (typeof PACK_IDS)[number];

export type PackDef = {
  id: PackId;
  label: string;
  /** One-line description shown in the Features settings section. */
  description: string;
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
    views: ["outline", "bookmarks"],
  },
  "code-tools": {
    id: "code-tools",
    label: "Code Tools",
    description:
      "Build runner, test runner, debugger, workspace symbol search, and code review.",
    views: ["build", "tests", "debugger", "symbol-search", "code-review"],
  },
  "ai-extras": {
    id: "ai-extras",
    label: "AI Extras",
    description:
      "AI refactoring and prompt templates. The AI chat itself is core and unaffected.",
    views: ["refactor", "prompt-templates"],
  },
  "dev-tools": {
    id: "dev-tools",
    label: "Dev Tools",
    description:
      "Process activity, system resource monitor, port monitor, REPL, database client, workspace profiles, and SSH.",
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
    views: ["ml"],
  },
  advanced: {
    id: "advanced",
    label: "Advanced",
    description:
      "Terminal sharing, workspace notes, shell snippets, code snippets, and release tooling.",
    views: ["share", "notes", "shell-snippets", "snippets", "release"],
  },
};

/** Preset bundles offered by the first-run picker. Presets are nothing more
 *  than starting values for the same enabledPacks config. */
export const PACK_PRESETS: Record<
  "bare-bones" | "standard" | "everything",
  readonly PackId[]
> = {
  "bare-bones": [],
  standard: ["navigation-plus", "code-tools", "dev-tools"],
  everything: PACK_IDS,
};

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
