// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { native } from "@/modules/ai/lib/native";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

type CellOutput =
  | { output_type: "stream"; text: string | string[] }
  | { output_type: "display_data" | "execute_result"; data: Record<string, string | string[]> }
  | { output_type: "error"; ename: string; evalue: string; traceback: string[] };

type Cell = {
  cell_type: "code" | "markdown" | "raw";
  source: string | string[];
  outputs?: CellOutput[];
  execution_count?: number | null;
};

type Notebook = {
  cells: Cell[];
  metadata?: { kernelspec?: { display_name?: string }; language_info?: { name?: string } };
};

function joinSource(src: string | string[]): string {
  return Array.isArray(src) ? src.join("") : src;
}

function OutputBlock({ output }: { output: CellOutput }) {
  if (output.output_type === "stream") {
    return (
      <pre className="mt-1 whitespace-pre-wrap break-all rounded bg-muted/40 px-2 py-1.5 font-mono text-[11px] text-muted-foreground">
        {joinSource(output.text)}
      </pre>
    );
  }
  if (output.output_type === "error") {
    return (
      <pre className="mt-1 whitespace-pre-wrap break-all rounded bg-destructive/10 px-2 py-1.5 font-mono text-[11px] text-destructive">
        {output.ename}: {output.evalue}
        {"\n"}
        {output.traceback.map((l) => l.replace(/\x1b\[[0-9;]*m/g, "")).join("\n")}
      </pre>
    );
  }
  const textPlain = output.data?.["text/plain"];
  if (textPlain) {
    return (
      <pre className="mt-1 whitespace-pre-wrap break-all rounded bg-muted/40 px-2 py-1.5 font-mono text-[11px] text-muted-foreground">
        {joinSource(textPlain)}
      </pre>
    );
  }
  return null;
}

function MarkdownCell({ source }: { source: string }) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none px-3 py-2 text-[13px]">
      <pre className="whitespace-pre-wrap font-sans text-foreground">{source}</pre>
    </div>
  );
}

function CodeCell({
  source,
  outputs,
  count,
  language,
}: {
  source: string;
  outputs: CellOutput[];
  count: number | null | undefined;
  language: string;
}) {
  return (
    <div className="group">
      <div className="flex gap-2">
        <span className="mt-1.5 shrink-0 font-mono text-[10px] text-muted-foreground/50 w-8 text-right select-none">
          {count != null ? `[${count}]` : "[ ]"}
        </span>
        <pre
          className={cn(
            "flex-1 overflow-x-auto rounded border border-border/40 bg-muted/30 px-3 py-2",
            "font-mono text-[12px] leading-relaxed whitespace-pre text-foreground",
          )}
        >
          <code>{source}</code>
        </pre>
      </div>
      {outputs.length > 0 && (
        <div className="ml-10 mt-1 space-y-1">
          {outputs.map((o, i) => (
            <OutputBlock key={i} output={o} />
          ))}
        </div>
      )}
    </div>
  );
  void language;
}

type Props = {
  path: string;
  visible: boolean;
};

export function NotebookViewer({ path, visible }: Props) {
  const [notebook, setNotebook] = useState<Notebook | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    void (async () => {
      const result = await native.readFile(path);
      if (cancelled) return;
      if (result.kind !== "text") {
        setError("Cannot read notebook file.");
        return;
      }
      try {
        const nb = JSON.parse(result.content) as Notebook;
        setNotebook(nb);
      } catch {
        setError("Invalid notebook JSON.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [path, visible]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-destructive">
        {error}
      </div>
    );
  }

  if (!notebook) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Loading…
      </div>
    );
  }

  const language =
    notebook.metadata?.language_info?.name ??
    notebook.metadata?.kernelspec?.display_name ??
    "python";
  const kernelName = notebook.metadata?.kernelspec?.display_name ?? language;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <div className="flex shrink-0 items-center gap-2 border-b border-border/50 px-4 py-2">
        <span className="text-[11px] font-medium text-muted-foreground">
          Kernel: {kernelName}
        </span>
        <span className="text-muted-foreground/40">·</span>
        <span className="text-[11px] text-muted-foreground">
          {notebook.cells.length} cells
        </span>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {notebook.cells.map((cell, i) => {
          const source = joinSource(cell.source);
          if (cell.cell_type === "code") {
            return (
              <CodeCell
                key={i}
                source={source}
                outputs={cell.outputs ?? []}
                count={cell.execution_count}
                language={language}
              />
            );
          }
          if (cell.cell_type === "markdown") {
            return <MarkdownCell key={i} source={source} />;
          }
          return (
            <pre key={i} className="rounded border border-border/30 bg-muted/20 px-3 py-2 font-mono text-[12px] text-muted-foreground">
              {source}
            </pre>
          );
        })}
      </div>
    </div>
  );
}
