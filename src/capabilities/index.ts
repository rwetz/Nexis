import { atlasCapability } from "./atlas";
import { webToolsCapability } from "./web-tools";

/** Composition only. Each capability owns its panel and command declarations. */
export const CAPABILITIES = [webToolsCapability, atlasCapability] as const;
export const CAPABILITY_VIEWS = CAPABILITIES.flatMap((capability) => capability.panels.flatMap((panel) => panel.legacyView ? [panel.legacyView] : []));
