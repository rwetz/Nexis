// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { native } from "@/modules/ai/lib/native";
import { useEffect, useState } from "react";

export type ContainerKind = "devcontainer" | "compose" | "dockerfile" | null;

export type ContainerEnv = {
  kind: ContainerKind;
  label: string;
};

const DETECT_FILES: Array<{ files: string[]; kind: ContainerKind; label: string }> = [
  { files: [".devcontainer/devcontainer.json", ".devcontainer.json"], kind: "devcontainer", label: "Dev Container" },
  { files: ["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"], kind: "compose", label: "Docker Compose" },
  { files: ["Dockerfile", "dockerfile"], kind: "dockerfile", label: "Dockerfile" },
];

async function detectContainer(root: string | null): Promise<ContainerEnv | null> {
  if (!root) return null;
  try {
    const entries = await native.readDir(root);
    const names = new Set(entries.map((e) => e.name));

    for (const spec of DETECT_FILES) {
      for (const file of spec.files) {
        const topLevel = file.split("/")[0];
        if (names.has(topLevel)) {
          return { kind: spec.kind, label: spec.label };
        }
      }
    }
  } catch {
    // non-accessible root
  }
  return null;
}

export function useContainerEnv(workspaceRoot: string | null): ContainerEnv | null {
  const [env, setEnv] = useState<ContainerEnv | null>(null);

  useEffect(() => {
    let cancelled = false;
    void detectContainer(workspaceRoot).then((result) => {
      if (!cancelled) setEnv(result);
    });
    return () => {
      cancelled = true;
    };
  }, [workspaceRoot]);

  return env;
}
