// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { TOOL_NAMES } from "@/lib/toolNames";
import { lazy } from "react";
import type { CapabilityDefinition } from "@/workbench/capability";

/**
 * Vellum (SVG), Synapse (ML), Portal (web) and Quill (documents), each in a
 * window of its own like Atlas and Pulse. Names live in lib/toolNames.ts. They were main-window tabs; a workbench is somewhere
 * you go and stay, and a window can sit on a second screen beside the code.
 * Lazy, so the main window never parses a workbench it only launches.
 */
const windows = () => import("./windows");
const SvgStudioWindow = lazy(() => windows().then((m) => ({ default: m.SvgStudioWindow })));
const MlLabWindow = lazy(() => windows().then((m) => ({ default: m.MlLabWindow })));
const WebWindow = lazy(() => windows().then((m) => ({ default: m.WebWindow })));
const DocumentsWindow = lazy(() => windows().then((m) => ({ default: m.DocumentsWindow })));

export const workbenchesCapability: CapabilityDefinition = {
  id: "workbenches.windows",
  panels: [],
  toolWindows: [
    {
      id: "svg-studio", label: TOOL_NAMES.svgStudio, title: `${TOOL_NAMES.svgStudio} — Nexis`, icon: "brush", pack: "art",
      width: 1360, height: 820, minWidth: 760, minHeight: 520,
      render: () => <SvgStudioWindow />,
    },
    {
      id: "ml-lab", label: TOOL_NAMES.mlLab, title: `${TOOL_NAMES.mlLab} — Nexis`, icon: "brain", pack: "ml-lab",
      width: 1320, height: 860, minWidth: 720, minHeight: 500,
      render: () => <MlLabWindow />,
    },
    {
      id: "web", label: TOOL_NAMES.web, title: `${TOOL_NAMES.web} — Nexis`, icon: "globe", pack: "web-dev",
      width: 1200, height: 800, minWidth: 640, minHeight: 460,
      render: () => <WebWindow />,
    },
    {
      id: "documents", label: TOOL_NAMES.documents, title: `${TOOL_NAMES.documents} — Nexis`, icon: "document", pack: "documents",
      width: 1320, height: 880, minWidth: 760, minHeight: 500,
      render: () => <DocumentsWindow />,
    },
  ],
};
