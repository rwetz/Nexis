import { lazy } from "react";
import type { CapabilityDefinition } from "@/workbench/capability";

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
    title: "Benchmark",
    location: "sidebar",
    icon: "activity",
    group: "Dev Tools",
    pack: "ml-lab",
    lifecycle: "unmount",
    render: () => <Panel />,
  }],
  toolWindows: [{
    id: "benchmark",
    label: "Benchmark",
    title: "Benchmark — Nexis",
    icon: "activity",
    width: 1280,
    height: 860,
    minWidth: 720,
    minHeight: 500,
    render: () => <Panel />,
  }],
  commands: (context) => [{
    id: "benchmark.open",
    title: "Show Benchmark (compare local models)",
    category: "View",
    pack: "ml-lab",
    keywords: ["onnx", "gguf", "llama.cpp", "throughput", "latency", "tokens per second", "inference", "model"],
    handler: () => context().panels.activate("benchmark:main"),
  }],
};
