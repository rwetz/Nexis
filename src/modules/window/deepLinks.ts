// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * `nexis://` links from companion apps (Epoch's "Open in Synapse" and
 * "Benchmark in Pulse"), on the main window.
 *
 * Rust validates every link before it gets here (modules/links.rs: known
 * tool, known parameters, absolute paths). This side decides whether to act:
 * a link inside the open workspace opens straight away; one that points
 * somewhere else asks first, because another process chose that path.
 */

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { TOOL_NAMES } from "@/lib/toolNames";
import { listen } from "@/platform/events";
import { defineCommand } from "@/platform/ipc";
import { hostIpc } from "@/platform/tauri";
import { parentDir } from "./toolLinks";

export type NexisLink = { tool: "ml-lab" | "benchmark"; params: Record<string, string> };

const takePendingCommand = defineCommand<Record<string, never>, NexisLink[]>("links_take_pending", "host");
const LINK_EVENT = "nexis://link";

const TOOL_LABEL: Record<NexisLink["tool"], string> = {
  "ml-lab": TOOL_NAMES.mlLab,
  benchmark: TOOL_NAMES.benchmark,
};

function norm(path: string): string {
  const p = path.replace(/\\/g, "/").replace(/\/+$/, "");
  return /^[a-z]:\//i.test(p) ? p.toLowerCase() : p;
}

/** True when `path` is `root` or inside it (separator- and drive-case-blind). */
export function isInside(path: string, root: string | null): boolean {
  if (!root) return false;
  const p = norm(path);
  const r = norm(root);
  return p === r || p.startsWith(`${r}/`);
}

/** The path a link is about: the project, else the model or dataset. */
export function linkSubject(link: NexisLink): string | null {
  return link.params.project ?? link.params.model ?? link.params.dataset ?? null;
}

/**
 * Where Nexis should be rooted to show this link: Synapse lists the projects
 * *inside* its workspace, so a project link roots at the project's parent.
 */
export function workspaceFor(link: NexisLink): string | null {
  const subject = linkSubject(link);
  if (!subject) return null;
  return link.tool === "ml-lab" && link.params.project ? parentDir(link.params.project) : parentDir(subject);
}

export function useNexisDeepLinks(
  root: string | null,
  launchTool: (id: string, params?: Record<string, string>) => void,
  switchWorkspace: (path: string) => Promise<unknown> | void,
): void {
  // The listener lives for the app; the latest root and callbacks are read
  // through a ref so a workspace switch doesn't drop links in flight.
  const latest = useRef({ root, launchTool, switchWorkspace });
  latest.current = { root, launchTool, switchWorkspace };

  useEffect(() => {
    const follow = (link: NexisLink) => {
      const { root: current, launchTool: launch, switchWorkspace: switchTo } = latest.current;
      const subject = linkSubject(link);
      if (!subject || isInside(subject, current)) {
        launch(link.tool, link.params);
        return;
      }
      const target = workspaceFor(link);
      toast(`${TOOL_NAMES.epoch} asked to open ${TOOL_LABEL[link.tool]}`, {
        description: `${subject} is outside the open workspace.`,
        duration: 15_000,
        action: {
          label: "Open",
          onClick: () => {
            void (async () => {
              if (target) await switchTo(target);
              // Read again: after the switch, launchTool carries the new root.
              latest.current.launchTool(link.tool, link.params);
            })();
          },
        },
      });
    };
    const drain = () => {
      void hostIpc
        .call(takePendingCommand, {})
        .then((links) => links.forEach(follow))
        .catch(() => {});
    };
    drain(); // a link that launched this Nexis
    const unlisten = listen(LINK_EVENT, drain);
    return () => void unlisten.then((fn) => fn()).catch(() => {});
  }, []);
}
