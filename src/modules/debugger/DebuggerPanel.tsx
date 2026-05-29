import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useDebugStore } from "./debugSession";
import type { DapStackFrame, DapScope, DapVariable } from "./dapProtocol";

type PanelTab = "variables" | "callstack" | "console";

export function DebuggerPanel() {
  const [tab, setTab] = useState<PanelTab>("variables");
  const status = useDebugStore((s) => s.status);

  if (status === "idle") return null;

  return (
    <div className="flex h-full flex-col border-t border-border/40 bg-card text-[11px]">
      {/* Tab bar */}
      <div className="flex shrink-0 items-center gap-px border-b border-border/40 px-2 pt-1">
        {(["variables", "callstack", "console"] as PanelTab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "rounded-t px-2.5 py-1 text-[10.5px] capitalize font-medium transition-colors",
              tab === t
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t === "callstack" ? "Call Stack" : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {tab === "variables" && <VariablesPanel />}
        {tab === "callstack" && <CallStackPanel />}
        {tab === "console" && <ConsolePanel />}
      </div>
    </div>
  );
}

// ── Variables panel ───────────────────────────────────────────────────────────

function VariablesPanel() {
  const scopes = useDebugStore((s) => s.scopes);
  const variables = useDebugStore((s) => s.variables);
  const expandVariables = useDebugStore((s) => s.expandVariables);

  if (!scopes.length) {
    return (
      <div className="px-3 py-2 text-muted-foreground">No variables</div>
    );
  }

  return (
    <div className="py-1">
      {scopes.map((scope) => (
        <ScopeSection
          key={scope.variablesReference}
          scope={scope}
          variables={variables}
          onExpand={expandVariables}
        />
      ))}
    </div>
  );
}

function ScopeSection({
  scope,
  variables,
  onExpand,
}: {
  scope: DapScope;
  variables: Map<number, DapVariable[]>;
  onExpand: (ref: number) => Promise<void>;
}) {
  const [open, setOpen] = useState(!scope.expensive);
  const vars = variables.get(scope.variablesReference);

  const toggle = () => {
    if (!open && !vars) void onExpand(scope.variablesReference);
    setOpen((v) => !v);
  };

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-1 px-2 py-0.5 text-left font-medium text-foreground/80 hover:bg-muted/30"
      >
        <span className="text-[9px]">{open ? "▼" : "▶"}</span>
        {scope.name}
      </button>
      {open && vars && (
        <div className="pl-3">
          {vars.map((v) => (
            <VariableRow
              key={v.name}
              variable={v}
              variables={variables}
              onExpand={onExpand}
              depth={0}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function VariableRow({
  variable,
  variables,
  onExpand,
  depth,
}: {
  variable: DapVariable;
  variables: Map<number, DapVariable[]>;
  onExpand: (ref: number) => Promise<void>;
  depth: number;
}) {
  const [open, setOpen] = useState(false);
  const hasChildren = variable.variablesReference > 0;
  const children = variables.get(variable.variablesReference);

  const toggle = () => {
    if (!open && !children && hasChildren) {
      void onExpand(variable.variablesReference);
    }
    if (hasChildren) setOpen((v) => !v);
  };

  return (
    <div style={{ paddingLeft: depth * 12 }}>
      <div
        className={cn(
          "flex items-start gap-1 py-0.5 px-1.5 font-mono",
          hasChildren && "cursor-pointer hover:bg-muted/20",
        )}
        onClick={toggle}
      >
        {hasChildren && (
          <span className="shrink-0 text-[8px] text-muted-foreground pt-0.5">
            {open ? "▼" : "▶"}
          </span>
        )}
        {!hasChildren && <span className="w-2 shrink-0" />}
        <span className="text-blue-400 truncate min-w-0">{variable.name}</span>
        <span className="text-muted-foreground mx-1">:</span>
        <span className="text-foreground/80 truncate min-w-0">{variable.value}</span>
        {variable.type && (
          <span className="ml-auto shrink-0 text-[9px] text-muted-foreground/60">
            {variable.type}
          </span>
        )}
      </div>
      {open && children && (
        <div>
          {children.map((child) => (
            <VariableRow
              key={child.name}
              variable={child}
              variables={variables}
              onExpand={onExpand}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Call stack panel ──────────────────────────────────────────────────────────

function CallStackPanel() {
  const stackFrames = useDebugStore((s) => s.stackFrames);
  const activeFrameId = useDebugStore((s) => s.activeFrameId);
  const selectFrame = useDebugStore((s) => s.selectFrame);

  if (!stackFrames.length) {
    return (
      <div className="px-3 py-2 text-muted-foreground">No stack frames</div>
    );
  }

  return (
    <div className="py-1 font-mono">
      {stackFrames.map((frame) => (
        <StackFrameRow
          key={frame.id}
          frame={frame}
          active={frame.id === activeFrameId}
          onClick={() => void selectFrame(frame.id)}
        />
      ))}
    </div>
  );
}

function StackFrameRow({
  frame,
  active,
  onClick,
}: {
  frame: DapStackFrame;
  active: boolean;
  onClick: () => void;
}) {
  const fileName = frame.source?.path?.split(/[/\\]/).pop() ?? frame.source?.name;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 px-2.5 py-0.5 text-left hover:bg-muted/30",
        active && "bg-muted/50",
      )}
    >
      <span
        className={cn(
          "font-sans text-[10.5px] font-medium truncate",
          active ? "text-foreground" : "text-foreground/70",
        )}
      >
        {frame.name}
      </span>
      {fileName && (
        <span className="ml-auto shrink-0 text-[9.5px] text-muted-foreground">
          {fileName}:{frame.line}
        </span>
      )}
    </button>
  );
}

// ── Console panel ─────────────────────────────────────────────────────────────

function ConsolePanel() {
  const output = useDebugStore((s) => s.output);
  const evaluate = useDebugStore((s) => s.evaluate);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const bottomRef = useRef<HTMLDivElement>(null);
  const addOutput = useDebugStore((s) => s.addOutput);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "auto" });
  }, [output]);

  const submit = async () => {
    const expr = input.trim();
    if (!expr) return;
    addOutput("console", `> ${expr}\n`);
    setHistory((h) => [expr, ...h.slice(0, 99)]);
    setHistIdx(-1);
    setInput("");
    const result = await evaluate(expr);
    addOutput("console", `${result}\n`);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-auto p-2 font-mono text-[10.5px]">
        {output.map((o) => (
          <div
            key={o.id}
            className={cn(
              "whitespace-pre-wrap break-all",
              o.category === "stderr" && "text-destructive",
              o.category === "stdout" && "text-foreground/90",
              o.category === "console" && "text-foreground/70",
            )}
          >
            {o.text}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="flex shrink-0 items-center gap-1 border-t border-border/30 px-2 py-1">
        <span className="text-muted-foreground text-[10px]">&gt;</span>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            } else if (e.key === "ArrowUp") {
              const idx = Math.min(histIdx + 1, history.length - 1);
              setHistIdx(idx);
              setInput(history[idx] ?? "");
            } else if (e.key === "ArrowDown") {
              const idx = Math.max(histIdx - 1, -1);
              setHistIdx(idx);
              setInput(history[idx] ?? "");
            }
          }}
          placeholder="Evaluate expression…"
          spellCheck={false}
          className="flex-1 bg-transparent font-mono text-[10.5px] text-foreground outline-none placeholder:text-muted-foreground/40"
        />
      </div>
    </div>
  );
}
