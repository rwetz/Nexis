import { TOOL_NAMES } from "@/lib/toolNames";
import { lazy } from "react";
import type { CapabilityDefinition } from "@/workbench/capability";

const PulseWindowLazy = lazy(() =>
  import("@/modules/benchmark/PulseWindow").then((module) => ({
    default: module.PulseWindow,
  })),
);

const Panel = lazy(() =>
  import("@/modules/benchmark/BenchmarkPanel").then((module) => ({
    default: module.BenchmarkPanel,
  })),
);

export const benchmarkCapability: CapabilityDefinition = {
  id: "benchmark.main",
  panels: [{
    id: "benchmark:main",
    legacyView: "benchmark",
    title: TOOL_NAMES.benchmark,
    location: "sidebar",
    icon: "activity",
    group: "Dev Tools",
    pack: "ml-lab",
    lifecycle: "unmount",
    render: () => <Panel />,
  }],
  toolWindows: [{
    id: "benchmark",
    label: TOOL_NAMES.benchmark,
    title: `${TOOL_NAMES.benchmark} — Nexis`,
    icon: "activity",
    width: 1280,
    height: 860,
    minWidth: 720,
    minHeight: 500,
    render: () => <PulseWindowLazy />,
  }],
  commands: (context) => [{
    id: "benchmark.open",
    title: `Show ${TOOL_NAMES.benchmark} (benchmark local models)`,
    category: "View",
    pack: "ml-lab",
    keywords: ["benchmark", "onnx", "gguf", "llama.cpp", "throughput", "latency", "tokens per second", "inference", "model"],
    handler: () => context().panels.activate("benchmark:main"),
  }],
};
