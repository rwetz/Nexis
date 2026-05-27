import { native } from "@/modules/ai/lib/native";
import { cn } from "@/lib/utils";
import {
  Cancel01Icon,
  CheckmarkCircle01Icon,
  Alert02Icon,
  PlayIcon,
  Time01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { FRAMEWORKS, type TestFramework, type TestResult, type TestStatus } from "./testFramework";

type Props = {
  workspaceRoot: string | null;
};

function detectFramework(fileNames: string[]): TestFramework | null {
  for (const fw of FRAMEWORKS) {
    if (fw.detectFiles.some((f) => fileNames.includes(f))) {
      return fw;
    }
  }
  return null;
}

function statusIcon(status: TestStatus) {
  switch (status) {
    case "passed": return CheckmarkCircle01Icon;
    case "failed": return Alert02Icon;
    case "error": return Alert02Icon;
    case "running": return Time01Icon;
    default: return PlayIcon;
  }
}

function statusColor(status: TestStatus): string {
  switch (status) {
    case "passed": return "text-green-500";
    case "failed": return "text-red-500";
    case "error": return "text-red-400";
    case "running": return "text-yellow-500";
    default: return "text-muted-foreground";
  }
}

function parseTestSummary(output: string, status: TestStatus): string {
  if (status === "running") return "Running…";
  if (status === "idle") return "Not started";

  // Vitest / Jest style
  const vitestMatch = output.match(/Tests\s+(\d+)\s+passed.*?(\d+)\s+failed/i) ??
    output.match(/(\d+)\s+passed/i);
  if (vitestMatch) return vitestMatch[0].trim();

  // Cargo test style
  const cargoMatch = output.match(/test result:.*?(\d+ passed.*)/i);
  if (cargoMatch) return cargoMatch[1].trim();

  // pytest style
  const pytestMatch = output.match(/=+ .+ =+$/m);
  if (pytestMatch) return pytestMatch[0].replace(/=+/g, "").trim();

  if (status === "passed") return "All tests passed";
  if (status === "failed") return "Tests failed";
  return "";
}

export function TestRunnerPanel({ workspaceRoot }: Props) {
  const [framework, setFramework] = useState<TestFramework | null>(null);
  const [customCommand, setCustomCommand] = useState<string>("");
  const [result, setResult] = useState<TestResult | null>(null);
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
      const fw = detectFramework(names);
      setFramework(fw);
      if (fw) setCustomCommand(fw.command);
      setDetecting(false);
    }).catch(() => {
      setDetecting(false);
    });
  }, [workspaceRoot]);

  const runTests = useCallback(async () => {
    if (!workspaceRoot) return;
    stopPolling();
    if (handleRef.current !== null) {
      await native.shellBgKill(handleRef.current).catch(() => {});
      handleRef.current = null;
    }

    const command = customCommand.trim() || (framework?.command ?? "");
    if (!command) return;

    setResult({
      framework: framework ?? { id: "custom", name: "Custom", command, detectFiles: [] },
      status: "running",
      output: "",
      exitCode: null,
      startedAt: Date.now(),
      finishedAt: null,
    });

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
            status: logs.exited
              ? (logs.exit_code === 0 ? "passed" : "failed")
              : "running",
            exitCode: logs.exit_code,
            finishedAt: logs.exited ? Date.now() : null,
          } : prev);

          if (outputRef.current) {
            outputRef.current.scrollTop = outputRef.current.scrollHeight;
          }

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
      setResult((prev) => prev ? {
        ...prev,
        status: "error",
        output: String(err),
        finishedAt: Date.now(),
      } : prev);
    }
  }, [workspaceRoot, customCommand, framework, stopPolling]);

  const stopTests = useCallback(async () => {
    stopPolling();
    if (handleRef.current !== null) {
      await native.shellBgKill(handleRef.current).catch(() => {});
      handleRef.current = null;
    }
    setResult((prev) => prev ? { ...prev, status: "idle", finishedAt: Date.now() } : prev);
  }, [stopPolling]);

  const isRunning = result?.status === "running";
  const summary = result ? parseTestSummary(result.output, result.status) : null;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b border-border/50 px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Test Runner
        </span>
        {detecting && (
          <span className="text-[10px] text-muted-foreground/60">Detecting…</span>
        )}
      </div>

      <div className="flex flex-col gap-2 border-b border-border/30 p-3">
        {framework && (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground/80">{framework.name}</span>
            <span className="text-muted-foreground/50">detected</span>
          </div>
        )}
        <div className="flex gap-2">
          <input
            value={customCommand}
            onChange={(e) => setCustomCommand(e.target.value)}
            placeholder="Test command (e.g. pnpm vitest run)"
            className="flex-1 rounded border border-border/60 bg-muted/30 px-2 py-1 font-mono text-[11.5px] text-foreground outline-none focus:border-primary/60"
            onKeyDown={(e) => { if (e.key === "Enter" && !isRunning) void runTests(); }}
          />
          {isRunning ? (
            <button
              type="button"
              onClick={() => void stopTests()}
              className="flex shrink-0 items-center gap-1.5 rounded bg-red-500/10 px-2.5 py-1 text-[11.5px] font-medium text-red-500 transition-colors hover:bg-red-500/20"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={1.75} />
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void runTests()}
              disabled={!customCommand.trim() && !framework}
              className="flex shrink-0 items-center gap-1.5 rounded bg-primary/90 px-2.5 py-1 text-[11.5px] font-medium text-primary-foreground transition-colors hover:bg-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              <HugeiconsIcon icon={PlayIcon} size={12} strokeWidth={1.75} />
              Run
            </button>
          )}
        </div>

        {result && (
          <div className={cn("flex items-center gap-1.5 text-[11px]", statusColor(result.status))}>
            <HugeiconsIcon icon={statusIcon(result.status)} size={12} strokeWidth={1.75} />
            <span>{summary}</span>
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
                ? framework
                  ? `Press Run to start ${framework.name}`
                  : "Enter a test command above"
                : "No workspace open"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
