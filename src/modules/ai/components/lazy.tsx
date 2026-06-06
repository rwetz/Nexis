// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { lazy, Suspense } from "react";
import type { AgentRunBridgeProps } from "./AgentRunBridge";
import type { SelectionAskAiProps } from "./SelectionAskAi";

const AgentRunBridgeInner = lazy(() =>
  import("./AgentRunBridge").then((m) => ({ default: m.AgentRunBridge })),
);

const AiMiniWindowInner = lazy(() =>
  import("./AiMiniWindow").then((m) => ({ default: m.AiMiniWindow })),
);

const AiInputBarModule = () => import("./AiInputBar");

const AiInputBarInner = lazy(() =>
  AiInputBarModule().then((m) => ({ default: m.AiInputBar })),
);

const AiInputBarConnectInner = lazy(() =>
  AiInputBarModule().then((m) => ({ default: m.AiInputBarConnect })),
);

const SelectionAskAiInner = lazy(() =>
  import("./SelectionAskAi").then((m) => ({ default: m.SelectionAskAi })),
);

const AiPanelModule = () => import("./AiPanel");

const DockedAiPanelInner = lazy(() =>
  AiPanelModule().then((m) => ({ default: m.DockedAiPanel })),
);

const FloatingAiPanelInner = lazy(() =>
  AiPanelModule().then((m) => ({ default: m.FloatingAiPanel })),
);

export function AgentRunBridge(props: AgentRunBridgeProps) {
  return (
    <Suspense fallback={null}>
      <AgentRunBridgeInner {...props} />
    </Suspense>
  );
}

export function AiMiniWindow() {
  return (
    <Suspense fallback={null}>
      <AiMiniWindowInner />
    </Suspense>
  );
}

export function AiInputBar() {
  return (
    <Suspense fallback={null}>
      <AiInputBarInner />
    </Suspense>
  );
}

export function AiInputBarConnect({ onAdd }: { onAdd: () => void }) {
  return (
    <Suspense fallback={null}>
      <AiInputBarConnectInner onAdd={onAdd} />
    </Suspense>
  );
}

export function SelectionAskAi(props: SelectionAskAiProps) {
  return (
    <Suspense fallback={null}>
      <SelectionAskAiInner {...props} />
    </Suspense>
  );
}

export function DockedAiPanel() {
  return (
    <Suspense fallback={null}>
      <DockedAiPanelInner />
    </Suspense>
  );
}

export function FloatingAiPanel() {
  return (
    <Suspense fallback={null}>
      <FloatingAiPanelInner />
    </Suspense>
  );
}
