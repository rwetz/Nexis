// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * The bodies of the four workbench windows. Each runs in its own webview, so
 * each borrows the main window's workspace root and sends anything that ends
 * in a main-window surface back there (modules/window/toolWindowHost.ts).
 */

import { useEffect, useState } from "react";
import { IntegrationCapabilityHostProvider } from "@/capabilities/integration-context";
import { portsCapability } from "@/capabilities/ports";
import { webToolsCapability } from "@/capabilities/web-tools";
import { STUDIO_TOOLS, useSvgStudioStore } from "@/modules/art/studioStore";
import { SvgStudio } from "@/modules/art/SvgStudio";
import { DocumentsWorkbench } from "@/modules/documents";
import { MlPanel } from "@/modules/ml/MlPanel";
import { NetworkGraph } from "@/modules/ml/NetworkGraph";
import { isWebTool, useWebWorkbenchStore, WebWorkbench } from "@/modules/web-workbench";
import {
  requestToolHostAction,
  useToolWindowLaunch,
  useToolWindowRoot,
} from "@/modules/window/toolWindowHost";

export function SvgStudioWindow() {
  const root = useToolWindowRoot();
  const { params, opens } = useToolWindowLaunch("svg-studio");
  // "Open the palette" and friends name a tool; apply it on every open, not
  // only the first, so it also switches a Studio that is already up.
  useEffect(() => {
    const tool = STUDIO_TOOLS.find((t) => t.id === params.studio);
    if (tool) useSvgStudioStore.getState().setTool(tool.id);
  }, [params, opens]);
  return <SvgStudio workspaceRoot={root} />;
}

export function MlLabWindow() {
  const root = useToolWindowRoot();
  // The network diagram used to open as a main-window tab. From its own
  // window it opens over the Lab instead, where "back" is one click.
  const [networkDir, setNetworkDir] = useState<string | null>(null);
  return (
    <div className="relative h-full min-h-0">
      <div className="h-full min-h-0 px-3 pt-2 pb-2" inert={networkDir !== null}>
        <MlPanel workspaceRoot={root} onOpenNetworkTab={({ projectDir }) => setNetworkDir(projectDir)} />
      </div>
      {networkDir !== null ? (
        <div className="nexis-scene-enter absolute inset-0 flex min-h-0 flex-col bg-background">
          <NetworkGraph key={networkDir} projectDir={networkDir} variant="tab" onCollapse={() => setNetworkDir(null)} />
        </div>
      ) : null}
    </div>
  );
}

const WEB_PANELS = [...portsCapability.panels, ...webToolsCapability.panels];

export function WebWindow() {
  const root = useToolWindowRoot();
  const { params, opens } = useToolWindowLaunch("web");
  useEffect(() => {
    if (isWebTool(params.web)) useWebWorkbenchStore.getState().setTool(params.web);
  }, [params, opens]);
  return (
    <IntegrationCapabilityHostProvider
      value={{
        workspaceRoot: root,
        openPreview: (url) => requestToolHostAction({ kind: "preview", url }),
        openSshSession: (command, label) => requestToolHostAction({ kind: "ssh", command, label }),
        // Nothing in the Web tools opens a network diagram.
        openMlNetwork: () => {},
      }}
    >
      <WebWorkbench panels={WEB_PANELS} />
    </IntegrationCapabilityHostProvider>
  );
}

export function DocumentsWindow() {
  const root = useToolWindowRoot();
  return (
    <DocumentsWorkbench
      workspaceRoot={root}
      onEditRaw={(path) => requestToolHostAction({ kind: "file", path })}
    />
  );
}
