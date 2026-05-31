import { native } from "@/modules/ai/lib/native";
import { sendMessage } from "@/modules/ai/store/chatStore";
import { useChatStore } from "@/modules/ai/store/chatStore";
import { cn } from "@/lib/utils";
import {
  Cancel01Icon,
  CheckmarkCircle01Icon,
  Alert02Icon,
  AiChat02Icon,
  PlayIcon,
  Time01Icon,
  Wrench01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { BUILD_TOOLS, type BuildTool, type BuildResult, type BuildStatus } from "./buildSystem";

type Props = {
  workspaceRoot: string | null;
};

function detectBuildTool(fileNames: string[]): BuildTool | null {
  for (const tool of BUILD_TOOLS) {
    if (tool.detectFiles.some((f) => fileNames.includes(f))) {
      return tool;
    }
  }
  return null;
}

function statusIcon(status: BuildStatus) {
  switch (status) {
    case "success": return CheckmarkCircle01Icon;
    case "failed": return Alert02Icon;
    case "error": return Alert02Icon;
    case "running": return Time01Icon;
    default: return Wrench01Icon;
  }
}

function statusColor(status: BuildStatus): string {
  switch (status) {
    case "success": return "text-green-500";
    case "failed": return "text-red-500";
    case "error": return "text-red-400";
    case "running": return "text-yellow-500";
    default: return "text-muted-foreground";
  }
}

function parseSummary(output: string, status: BuildStatus): string {
  if (status === "running") return "Building…";
  if (status === "idle") return "Not started";

  // cargo
  const cargoFinished = output.match(/Finished .+ in [\d.]+s/);
  if (cargoFinished) return cargoFinished[0];
  const cargoError = output.match(/error\[E\d+\]/g);
  if (cargoError) return `${cargoError.length} error(s)`;

  // gradle/maven
  const buildSuccess = output.match(/BUILD (SUCCESSFUL|FAILED).*/);
  if (buildSuccess) return buildSuccess[0].trim();

  // webpack/vite
  const viteBuilt = output.match(/✓ built in [\d.]+/);
  if (viteBuilt) return viteBuilt[0];

  if (status === "success") return "Build succeeded";
  if (status === "failed") return "Build failed";
  return "";
}

export function BuildPanel({ workspaceRoot }: Props) {
  const [tool, setTool] = useState<BuildTool | null>(null);
  const [customCommand, setCustomCommand] = useState("");
  const [result, setResult] = useState<BuildResult | null>(null);
  const [detecting, setDetecting] = useState(false);
  const handleRef = useRef<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const outputRef = useRef<HTMLPreElement>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  useEffect(() => {
    if (!workspaceRoot) return;
    setDetecting(true);
    void native.readDir(workspaceRoot).then((entries) => {
      const names = entries.filter((e) => e.kind === "file").map((e) => e.name);
      const detected = detectBuildTool(names);
      setTool(detected);
      if (detected) setCustomCommand(detected.command);
      setDetecting(false);
    }).catch(() => setDetecting(false));
  }, [workspaceRoot]);

  const runBuild = useCallback(async () => {
    if (!workspaceRoot) return;
    stopPolling();
    if (handleRef.current !== null) {
      await native.shellBgKill(handleRef.current).catch(() => {});
      handleRef.current = null;
    }

    const command = customCommand.trim() || (tool?.command ?? "");
    if (!command) return;

    const activeTool = tool ?? { id: "custom", name: "Custom", command, detectFiles: [] };
    setResult({ tool: activeTool, status: "running", output: "", exitCode: null, startedAt: Date.now(), finishedAt: null });

    try {
      const handle = await native.shellBgSpawn(command, workspaceRoot);
      handleRef.current = handle;
      let offset = 0;
      let accumulated = "";

      pollRef.current = setInterval(async () => {
        try {
          const logs = await native.shellBgLogs(handle, offset);
          accumulated += logs.bytes;
          offset = logs.next_offset;

          setResult((prev) => prev ? {
            ...prev,
            output: accumulated,
            status: logs.exited ? (logs.exit_code === 0 ? "success" : "failed") : "running",
            exitCode: logs.exit_code,
            finishedAt: logs.exited ? Date.now() : null,
          } : prev);

          if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;

          if (logs.exited) {
            stopPolling();
            handleRef.current = null;
          }
        } catch {
          stopPolling();
          setResult((prev) => prev ? { ...prev, status: "error", finishedAt: Date.now() } : prev);
        }
      }, 500);
    } catch (err) {
      setResult((prev) => prev ? { ...prev, status: "error", output: String(err), finishedAt: Date.now() } : prev);
    }
  }, [workspaceRoot, customCommand, tool, stopPolling]);

  const stopBuild = useCallback(async () => {
    stopPolling();
    if (handleRef.current !== null) {
      await native.shellBgKill(handleRef.current).catch(() => {});
      handleRef.current = null;
    }
    setResult((prev) => prev ? { ...prev, status: "idle", finishedAt: Date.now() } : prev);
  }, [stopPolling]);

  const isRunning = result?.status === "running";
  const summary = result ? parseSummary(result.output, result.status) : null;
  const openAiPanel = useChatStore((s) => s.openPanel);

  const fixWithAi = useCallback(async () => {
    if (!result?.output) return;
    const command = customCommand.trim() || tool?.command || "build";
    const trimmed = result.output.slice(-8000); // cap to avoid token overflow
    const prompt = `Build command \`${command}\` failed. Here is the output:\n\n\`\`\`\n${trimmed}\n\`\`\`\n\nPlease diagnose the errors and suggest fixes.`;
    openAiPanel();
    await sendMessage(prompt);
  }, [result, customCommand, tool, openAiPanel]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b border-border/50 px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Build
        </span>
        {detecting && <span className="text-[10px] text-muted-foreground/60">Detecting…</span>}
      </div>

      <div className="flex flex-col gap-2 border-b border-border/30 p-3">
        {tool && (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground/80">{tool.name}</span>
            <span className="text-muted-foreground/50">detected</span>
          </div>
        )}
        <div className="flex gap-2">
          <input
            value={customCommand}
            onChange={(e) => setCustomCommand(e.target.value)}
            placeholder="Build command (e.g. cargo build --release)"
            className="flex-1 rounded border border-border/60 bg-muted/30 px-2 py-1 font-mono text-[11.5px] text-foreground outline-none focus:border-primary/60"
            onKeyDown={(e) => { if (e.key === "Enter" && !isRunning) void runBuild(); }}
          />
          {isRunning ? (
            <button
              type="button"
              onClick={() => void stopBuild()}
              className="flex shrink-0 items-center gap-1.5 rounded bg-red-500/10 px-2.5 py-1 text-[11.5px] font-medium text-red-500 transition-colors hover:bg-red-500/20"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={1.75} />
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void runBuild()}
              disabled={!customCommand.trim() && !tool}
              className="flex shrink-0 items-center gap-1.5 rounded bg-primary/90 px-2.5 py-1 text-[11.5px] font-medium text-primary-foreground transition-colors hover:bg-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              <HugeiconsIcon icon={PlayIcon} size={12} strokeWidth={1.75} />
              Build
            </button>
          )}
        </div>

        {result && (
          <div className="flex items-center gap-2">
            <div className={cn("flex flex-1 items-center gap-1.5 text-[11px]", statusColor(result.status))}>
              <HugeiconsIcon icon={statusIcon(result.status)} size={12} strokeWidth={1.75} />
              <span>{summary}</span>
            </div>
            {(result.status === "failed" || result.status === "error") && result.output && (
              <button
                type="button"
                onClick={() => void fixWithAi()}
                className="flex shrink-0 items-center gap-1 rounded border border-primary/30 bg-primary/8 px-2 py-0.5 text-[10.5px] font-medium text-primary/80 transition-colors hover:bg-primary/15 hover:text-primary"
              >
                <HugeiconsIcon icon={AiChat02Icon} size={11} strokeWidth={1.75} />
                Fix with AI
              </button>
            )}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {result ? (
          <pre
            ref={outputRef}
            className="h-full overflow-y-auto whitespace-pre-wrap break-words p-3 font-mono text-[11px] text-foreground/80"
          >
            {result.output || (isRunning ? "Starting…" : "")}
          </pre>
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-[11px] text-muted-foreground/60">
              {workspaceRoot
                ? tool
                  ? `Press Build to run ${tool.name}`
                  : "Enter a build command above"
                : "No workspace open"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
