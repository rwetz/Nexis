import { atlasCapability } from "./atlas";
import { benchmarkCapability } from "./benchmark";
import { gitCapability } from "./git";
import { editorCapability } from "./editor";
import { aiCapability } from "./ai";
import { terminalCapability } from "./terminal";
import { lspCapability } from "./lsp";
import { debuggerCapability } from "./debugger";
import { pythonCapability } from "./python";
import { mlCapability } from "./ml";
import { shareCapability } from "./share";
import { webToolsCapability } from "./web-tools";
import { databaseCapability } from "./database";
import { portsCapability } from "./ports";
import { sshCapability } from "./ssh";
import type { CapabilityDefinition } from "@/workbench/capability";

/** Composition only. Each capability owns its panel and command declarations. */
export const CAPABILITIES: readonly CapabilityDefinition[] = [webToolsCapability, atlasCapability, benchmarkCapability, gitCapability, editorCapability, aiCapability, terminalCapability, lspCapability, debuggerCapability, databaseCapability, portsCapability, sshCapability, pythonCapability, mlCapability, shareCapability];
export const CAPABILITY_VIEWS = CAPABILITIES.flatMap((capability) => capability.panels.flatMap((panel) => panel.legacyView ? [panel.legacyView] : []));
export const CAPABILITY_TOOL_WINDOWS = CAPABILITIES.flatMap((capability) => capability.toolWindows ?? []);
