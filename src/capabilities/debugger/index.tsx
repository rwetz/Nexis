import { lazy } from "react";
import type { CapabilityDefinition } from "@/workbench/capability";

const DebuggerPanel = lazy(() =>
  import("@/modules/debugger/DebuggerPanel").then((module) => ({
    default: module.DebuggerPanel,
  })),
);
const DebugToolbar = lazy(() =>
  import("@/modules/debugger/DebugToolbar").then((module) => ({
    default: module.DebugToolbar,
  })),
);

function DebuggerCapabilityPanel() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center border-b border-border/40 px-1 py-1">
        <DebugToolbar />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <DebuggerPanel />
      </div>
    </div>
  );
}

export const debuggerCapability: CapabilityDefinition = {
  id: "debugger.dap",
  panels: [{
    id: "debugger:panel",
    legacyView: "debugger",
    title: "Debugger",
    location: "bottom",
    icon: "debug",
    group: "Code",
    pack: "code-tools",
    lifecycle: "unmount",
    showInRail: false,
    render: () => <DebuggerCapabilityPanel />,
  }],
};
