// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * RefactorPanel — AI-powered refactoring assistant.
 *
 * Accepts code from the editor selection (via setRefactorCode) or manual
 * paste, then sends a structured prompt to the AI panel.  Operations:
 * Extract Function, Inline Variable, Add Types, Simplify, Add Error Handling.
 *
 * Alt+Shift+X captures the active editor/terminal selection and opens this
 * panel (wired in App.tsx / shortcuts.ts).
 */
import { cn } from "@/lib/utils";
import { sendMessage, useChatStore } from "@/modules/ai/store/chatStore";
import {
  AiChat02Icon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons";
import { CodeSquareIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useRef, useState } from "react";

// ── Global entry-point (like sendToRepl) ─────────────────────────────────────
let _setCodeFn: ((code: string) => void) | null = null;

/** Called from App.tsx shortcut handler to inject the current selection. */
export function setRefactorCode(code: string): boolean {
  if (_setCodeFn) {
    _setCodeFn(code);
    return true;
  }
  return false;
}

// ── Operation definitions ─────────────────────────────────────────────────────
type Operation = {
  id: string;
  label: string;
  prompt: (code: string) => string;
};

const OPERATIONS: Operation[] = [
  {
    id: "extract",
    label: "Extract Function",
    prompt: (code) =>
      `Please extract the following code into a well-named function. Provide the extracted function definition AND the updated call site:\n\n\`\`\`\n${code}\n\`\`\`\n\nRequirements:\n- Choose a clear, descriptive function name\n- Identify the function's parameters and return type (if typed language)\n- Show both the new function and how to call it`,
  },
  {
    id: "inline",
    label: "Inline Variable",
    prompt: (code) =>
      `Please inline the variable(s) in this code where appropriate:\n\n\`\`\`\n${code}\n\`\`\`\n\nShow the refactored code and explain any tradeoffs.`,
  },
  {
    id: "types",
    label: "Add Types",
    prompt: (code) =>
      `Please add TypeScript type annotations to the following code:\n\n\`\`\`\n${code}\n\`\`\`\n\nProvide the fully typed version. Infer types from usage — avoid \`any\`.`,
  },
  {
    id: "simplify",
    label: "Simplify",
    prompt: (code) =>
      `Please simplify the following code while preserving its behavior:\n\n\`\`\`\n${code}\n\`\`\`\n\nExplain each simplification you make.`,
  },
  {
    id: "errors",
    label: "Add Error Handling",
    prompt: (code) =>
      `Please add robust error handling to the following code:\n\n\`\`\`\n${code}\n\`\`\`\n\nHandle edge cases, null/undefined checks, and async errors where appropriate.`,
  },
  {
    id: "docs",
    label: "Add Docs",
    prompt: (code) =>
      `Please add JSDoc / docstring comments to the following code:\n\n\`\`\`\n${code}\n\`\`\`\n\nDocument parameters, return values, and any thrown errors.`,
  },
];

// ── Component ─────────────────────────────────────────────────────────────────
export function RefactorPanel() {
  const [code, setCode] = useState("");
  const [selectedOp, setSelectedOp] = useState(OPERATIONS[0].id);
  const [sending, setSending] = useState(false);
  const openAiPanel = useChatStore((s) => s.openPanel);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Register global setter
  useEffect(() => {
    _setCodeFn = (c) => {
      setCode(c);
      setTimeout(() => textareaRef.current?.focus(), 50);
    };
    return () => {
      if (_setCodeFn === textareaRef.current?.focus) _setCodeFn = null;
      _setCodeFn = null;
    };
  }, []);

  const op = OPERATIONS.find((o) => o.id === selectedOp) ?? OPERATIONS[0];

  const handleRefactor = useCallback(async () => {
    const c = code.trim();
    if (!c) return;
    setSending(true);
    try {
      const prompt = op.prompt(c);
      openAiPanel();
      await sendMessage(prompt);
    } finally {
      setSending(false);
    }
  }, [code, op, openAiPanel]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border/50 px-3 py-2">
        <HugeiconsIcon
          icon={CodeSquareIcon}
          size={13}
          strokeWidth={1.75}
          className="text-muted-foreground"
        />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Refactor
        </span>
        <span className="ml-auto text-[9.5px] text-muted-foreground/50">
          Alt+Shift+X to capture selection
        </span>
      </div>

      {/* Operation selector */}
      <div className="shrink-0 border-b border-border/30 px-3 py-2">
        <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Operation
        </p>
        <div className="flex flex-wrap gap-1">
          {OPERATIONS.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => setSelectedOp(o.id)}
              className={cn(
                "rounded px-2 py-0.5 text-[10.5px] font-medium transition-colors",
                selectedOp === o.id
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* Code input */}
      <div className="flex min-h-0 flex-1 flex-col p-3">
        <div className="flex shrink-0 items-center justify-between pb-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Code to refactor
          </p>
          {code && (
            <button
              type="button"
              onClick={() => setCode("")}
              className="flex items-center gap-0.5 text-[9.5px] text-muted-foreground hover:text-foreground"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={9} strokeWidth={2} />
              Clear
            </button>
          )}
        </div>

        <textarea
          ref={textareaRef}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          aria-label="Code to refactor"
          placeholder="Paste code here, or use Alt+Shift+X to capture the active editor selection…"
          className={cn(
            "min-h-0 flex-1 resize-none rounded-md border border-border/60",
            "bg-muted/20 p-2.5 font-mono text-[11px] leading-relaxed text-foreground",
            "outline-none placeholder:text-muted-foreground/40 focus:border-primary/50",
          )}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              void handleRefactor();
            }
          }}
        />

        <button
          type="button"
          disabled={!code.trim() || sending}
          onClick={() => void handleRefactor()}
          className={cn(
            "mt-3 flex w-full items-center justify-center gap-2 rounded-md py-2",
            "text-[11.5px] font-medium transition-colors",
            "bg-primary/90 text-primary-foreground hover:bg-primary",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          <HugeiconsIcon icon={AiChat02Icon} size={13} strokeWidth={1.75} />
          {sending ? "Sending to AI…" : `${op.label} with AI`}
        </button>
        <p className="mt-1.5 text-center text-[9.5px] text-muted-foreground/50">
          Ctrl+Enter to send
        </p>
      </div>
    </div>
  );
}
