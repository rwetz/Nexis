// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { cn } from "@/lib/utils";

type Props = {
  path: string;
  root: string | null;
  onNavigate?: (folderPath: string) => void;
};

function normSep(p: string) {
  return p.replace(/\\/g, "/");
}

export function EditorBreadcrumb({ path, root, onNavigate }: Props) {
  const normPath = normSep(path);
  const normRoot = root ? normSep(root) : null;

  const rel = normRoot && normPath.startsWith(normRoot)
    ? normPath.slice(normRoot.length).replace(/^\//, "")
    : normPath;

  const parts = rel.split("/").filter(Boolean);

  const buildPathUpTo = (idx: number): string => {
    const seg = parts.slice(0, idx + 1).join("/");
    return normRoot ? `${normRoot}/${seg}` : seg;
  };

  return (
    <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden font-mono text-[11px] text-muted-foreground">
      {parts.map((seg, i) => {
        const isLast = i === parts.length - 1;
        const folderPath = buildPathUpTo(i);
        return (
          // The path up to this segment, not the index: a path like a/b/a
          // repeats segment text, and the accumulated path never does.
          <span key={folderPath} className="flex items-center gap-0.5">
            {i > 0 && (
              <span className="shrink-0 select-none opacity-40">/</span>
            )}
            <button
              type="button"
              title={folderPath}
              onClick={() => {
                if (!isLast && onNavigate) onNavigate(folderPath);
              }}
              className={cn(
                "max-w-36 truncate rounded px-0.5 transition-colors",
                isLast
                  ? "cursor-default text-foreground/90"
                  : "cursor-pointer hover:bg-muted hover:text-foreground",
              )}
            >
              {seg}
            </button>
          </span>
        );
      })}
    </div>
  );
}
