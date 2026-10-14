// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { TOOL_NAMES } from "@/lib/toolNames";
import { openInEpoch, openNexisTool, synapseProjectOfModel } from "@/modules/window/toolLinks";
import type { ModelInfo } from "../lib/types";

/**
 * For a model Synapse exported (a project's `model.onnx`): jump back to the
 * project in Synapse, or explore it in Epoch. Other models have no project,
 * so they get no links.
 */
export function ModelLinks({ model }: { model: ModelInfo }) {
  const project = synapseProjectOfModel(model.path);
  if (!project) return null;
  return (
    <>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={() => openNexisTool("ml-lab", { project })}
        aria-label={`Open this model's project in ${TOOL_NAMES.mlLab}`}
        title={`Open the project in ${TOOL_NAMES.mlLab}`}
        className="opacity-60 transition-opacity hover:opacity-100 focus-visible:opacity-100"
      >
        <Icon name="brain" size="sm" />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={() => void openInEpoch({ project })}
        aria-label={`Explore this model's project in ${TOOL_NAMES.epoch}`}
        title={`Explore the project in ${TOOL_NAMES.epoch}`}
        className="opacity-60 transition-opacity hover:opacity-100 focus-visible:opacity-100"
      >
        <Icon name="clock" size="sm" />
      </Button>
    </>
  );
}
