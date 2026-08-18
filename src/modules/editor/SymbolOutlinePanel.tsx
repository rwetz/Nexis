// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";
import { native } from "@/modules/ai/lib/native";
import { useEffect, useState } from "react";

type SymbolKind = "function" | "class" | "interface" | "type" | "variable" | "enum" | "method";

type Symbol = {
  name: string;
  kind: SymbolKind;
  line: number;
};

function kindIcon(kind: SymbolKind) {
  switch (kind) {
    case "function": return "symbol-function";
    case "class": return "symbol-class";
    case "interface": return "code";
    case "type": return "symbol-type";
    case "enum": return "square";
    default: return "square";
  }
}

function kindColor(kind: SymbolKind): string {
  switch (kind) {
    case "function": return "text-blue-500/80";
    case "class":    return "text-orange-500/80";
    case "interface":return "text-purple-500/80";
    case "type":     return "text-cyan-500/80";
    case "enum":     return "text-amber-500/80";
    default:         return "text-muted-foreground/60";
  }
}

const SYMBOL_PATTERNS: { re: RegExp; kind: SymbolKind }[] = [
  { re: /^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*[(<]/, kind: "function" },
  { re: /^\s*(?:export\s+)?(?:abstract\s+)?class\s+(\w+)[\s{<(]/, kind: "class" },
  { re: /^\s*(?:export\s+)?interface\s+(\w+)[\s{<]/, kind: "interface" },
  { re: /^\s*(?:export\s+)?type\s+(\w+)\s*=/, kind: "type" },
  { re: /^\s*(?:export\s+)?enum\s+(\w+)\s*\{/, kind: "enum" },
  { re: /^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>|\w+\s*=>)/, kind: "function" },
  { re: /^\s*(?:public|private|protected|static|async)?\s+(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*\S+\s*)?\{/, kind: "method" },
  { re: /^\s*def\s+(\w+)\s*\(/, kind: "function" },
  { re: /^\s*fn\s+(\w+)\s*[<(]/, kind: "function" },
  { re: /^\s*(?:pub\s+)?(?:async\s+)?fn\s+(\w+)\s*[<(]/, kind: "function" },
  { re: /^\s*(?:pub\s+)?struct\s+(\w+)[\s{<]/, kind: "class" },
  { re: /^\s*func\s+(\w+)\s*\(/, kind: "function" },
];

function extractSymbols(content: string): Symbol[] {
  const symbols: Symbol[] = [];
  const seen = new Set<string>();
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    for (const { re, kind } of SYMBOL_PATTERNS) {
      const m = re.exec(line);
      if (m && m[1] && !m[1].startsWith("_")) {
        const key = `${kind}:${m[1]}`;
        if (!seen.has(key)) {
          seen.add(key);
          symbols.push({ name: m[1], kind, line: i + 1 });
          break;
        }
      }
    }
  }
  return symbols;
}

type Props = {
  filePath: string | null;
};

export function SymbolOutlinePanel({ filePath }: Props) {
  const [symbols, setSymbols] = useState<Symbol[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!filePath) {
      setSymbols([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void native.readFile(filePath).then((r) => {
      if (cancelled) return;
      if (r.kind === "text") setSymbols(extractSymbols(r.content));
      else setSymbols([]);
    }).catch(() => setSymbols([])).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [filePath]);

  if (!filePath) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-[11px] text-muted-foreground">No file open</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center border-b border-border/50 px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Outline
        </span>
        {loading && (
          <span className="ml-2 text-[10px] text-muted-foreground/60">Loading…</span>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        {symbols.length === 0 && !loading ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-[11px] text-muted-foreground/60">No symbols found</p>
          </div>
        ) : (
          symbols.map((s, i) => (
            <div
              key={i}
              className="flex items-center gap-2 border-b border-border/20 px-3 py-1.5 hover:bg-muted/30 last:border-none"
            >
              <Icon
                name={kindIcon(s.kind)}
                className={cn("shrink-0", kindColor(s.kind))}
              />
              <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-foreground">
                {s.name}
              </span>
              <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/50">
                {s.line}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
