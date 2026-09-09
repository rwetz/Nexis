// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Full-workspace host for the reusable ML Lab tab. The workbench reads the
 * shared ML store, so it stays live while training runs and does not invent a
 * second session model just because the user moved it out of the sidebar.
 */
import type { Tab } from "@/modules/tabs/lib/tabTypes";
import { MlPanel } from "./MlPanel";

export function MlLabStack({
  tabs,
  activeId,
  workspaceRoot,
  onOpenNetworkTab,
}: {
  tabs: Tab[];
  activeId: number | null;
  workspaceRoot: string | null;
  onOpenNetworkTab: (input: { projectDir: string }) => void;
}) {
  const tab = tabs.find(
    (t): t is Extract<Tab, { kind: "ml-lab" }> =>
      t.kind === "ml-lab" && t.id === activeId,
  );
  if (!tab) return null;

  return (
    <div className="h-full min-h-0 px-3 pt-2 pb-2">
      <MlPanel
        workspaceRoot={workspaceRoot}
        onOpenNetworkTab={onOpenNetworkTab}
      />
    </div>
  );
}
