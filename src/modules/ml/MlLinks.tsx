// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { Icon } from "@/components/icon";
import { TOOL_NAMES } from "@/lib/toolNames";
import { joinPath, openInEpoch, openNexisTool } from "@/modules/window/toolLinks";

const LINK =
  "inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 text-[10.5px] text-muted-foreground transition-colors hover:text-foreground";

/**
 * Synapse's way out to the other two ML tools, beside the export buttons:
 * time the exported model in Pulse, or study the project (and the run on
 * screen) in Epoch.
 */
export function MlLinks({
  projectDir,
  runId,
  hasOnnx,
}: {
  projectDir: string;
  runId: string | null;
  hasOnnx: boolean;
}) {
  return (
    <>
      {hasOnnx ? (
        <button
          type="button"
          className={LINK}
          title={`Time model.onnx in ${TOOL_NAMES.benchmark}`}
          onClick={() => openNexisTool("benchmark", { model: joinPath(projectDir, "model.onnx") })}
        >
          <Icon name="activity" size="xs" />
          Benchmark in {TOOL_NAMES.benchmark}
        </button>
      ) : null}
      <button
        type="button"
        className={LINK}
        title={`Explore this project's data, config and runs in ${TOOL_NAMES.epoch}`}
        onClick={() => void openInEpoch({ project: projectDir, run: runId ?? undefined })}
      >
        <Icon name="clock" size="xs" />
        {runId ? `Inspect run in ${TOOL_NAMES.epoch}` : `Open in ${TOOL_NAMES.epoch}`}
      </button>
    </>
  );
}
