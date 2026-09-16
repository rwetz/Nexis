import { atlasCapability } from "./atlas";
import { benchmarkCapability } from "./benchmark";
import { gitCapability } from "./git";
import { editorCapability } from "./editor";
import { aiCapability } from "./ai";
import { terminalCapability } from "./terminal";
import { webToolsCapability } from "./web-tools";
import type { CapabilityDefinition } from "@/workbench/capability";

/** Composition only. Each capability owns its panel and command declarations. */
export const CAPABILITIES: readonly CapabilityDefinition[] = [webToolsCapability, atlasCapability, benchmarkCapability, gitCapability, editorCapability, aiCapability, terminalCapability];
export const CAPABILITY_VIEWS = CAPABILITIES.flatMap((capability) => capability.panels.flatMap((panel) => panel.legacyView ? [panel.legacyView] : []));
export const CAPABILITY_TOOL_WINDOWS = CAPABILITIES.flatMap((capability) => capability.toolWindows ?? []);
