// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * The Documents pack's home: every markdown and Word file in the workspace,
 * plus New and Open. Rows open the rich editor directly. The explorer keeps
 * its own routing (markdown to the preview, .docx to the editor), so this
 * panel is the one place a markdown file opens straight into rich editing.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { PanelEmptyGlyph, PanelEmptyState } from "@/components/ui/PanelEmptyState";
import { basename, displayDirname } from "@/lib/path";
import { cn } from "@/lib/utils";
import { filesystem } from "@/platform/filesystem";
import { openFiles } from "@/platform/dialogs";
import type { DocumentFormat } from "@/modules/tabs";
import { jsonToDocx } from "./lib/docxFormat";
import { documentFormatFor, newDocumentPath } from "./lib/paths";

type Props = {
  workspaceRoot: string | null;
  onOpenDocument: (path: string, format: DocumentFormat) => void;
};

type Row = { path: string; rel: string; format: DocumentFormat };

const LIST_CAP = 500;
const exists = (p: string) => filesystem.stat(p).then(() => true, () => false);

export function DocumentsPanel({ workspaceRoot, onOpenDocument }: Props) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!workspaceRoot) return;
    let cancelled = false;
    filesystem
      .glob({ pattern: "**/*.{md,markdown,docx}", root: workspaceRoot, maxResults: LIST_CAP })
      .then((res) => {
        if (cancelled) return;
        const next: Row[] = [];
        for (const hit of res.hits) {
          const format = documentFormatFor(hit.path);
          // Office writes `~$name.docx` lock files beside an open document.
          if (format && !basename(hit.path).startsWith("~$")) next.push({ ...hit, format });
        }
        next.sort((a, b) => a.rel.localeCompare(b.rel));
        setRows(next);
        setTruncated(res.truncated);
        setError(null);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceRoot, reloadKey]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? (rows ?? []).filter((r) => r.rel.toLowerCase().includes(q)) : (rows ?? []);
  }, [rows, query]);

  const create = useCallback(
    async (format: DocumentFormat) => {
      if (!workspaceRoot) return;
      try {
        const path = await newDocumentPath(workspaceRoot, format, exists);
        if (format === "docx") {
          await filesystem.writeFileBytes(path, await jsonToDocx({ type: "doc", content: [] }));
        } else {
          await filesystem.writeFile(path, "", "documents");
        }
        setReloadKey((k) => k + 1);
        onOpenDocument(path, format);
      } catch (e) {
        toast.error("Could not create the document", {
          description: e instanceof Error ? e.message : String(e),
        });
      }
    },
    [workspaceRoot, onOpenDocument],
  );

  const openExisting = useCallback(async () => {
    const picked = await openFiles({
      multiple: false,
      filters: [{ name: "Documents", extensions: ["md", "markdown", "docx"] }],
    });
    const path = Array.isArray(picked) ? picked[0] : picked;
    const format = path ? documentFormatFor(path) : null;
    if (path && format) onOpenDocument(path, format);
  }, [onOpenDocument]);

  return (
    <div className="flex h-full flex-col overflow-hidden text-[12px]">
      <div className="flex shrink-0 items-center justify-between border-b border-border/50 bg-gradient-to-r from-primary/[0.04] to-transparent px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          Documents
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Refresh"
          title="Refresh"
          onClick={() => setReloadKey((k) => k + 1)}
        >
          <Icon name="refresh" size="xs" />
        </Button>
      </div>

      <div className="grid shrink-0 grid-cols-3 gap-1 border-b border-border/40 p-2">
        <Button variant="outline" size="xs" disabled={!workspaceRoot} onClick={() => void create("markdown")}>
          <Icon name="file-add" size="xs" />
          Markdown
        </Button>
        <Button variant="outline" size="xs" disabled={!workspaceRoot} onClick={() => void create("docx")}>
          <Icon name="file-add" size="xs" />
          Word
        </Button>
        <Button variant="outline" size="xs" onClick={() => void openExisting()}>
          <Icon name="folder-open" size="xs" />
          Open
        </Button>
      </div>

      {rows && rows.length > 0 ? (
        <div className="shrink-0 border-b border-border/40 px-2 py-1.5">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Filter documents"
            placeholder="Filter documents"
            spellCheck={false}
            className="w-full rounded-md border border-transparent bg-muted/40 px-2 py-1 text-[11px] outline-none placeholder:text-muted-foreground/40 focus:border-border/60 focus:ring-1 focus:ring-primary/40"
          />
        </div>
      ) : null}

      {!workspaceRoot ? (
        <PanelEmptyState
          art={<PanelEmptyGlyph icon="document" />}
          title="No workspace open"
          description="Open a folder to list its documents, or use Open to pick a file."
        />
      ) : error ? (
        <PanelEmptyState art={<PanelEmptyGlyph icon="alert" />} title="Could not list documents" description={error} />
      ) : rows === null ? (
        <PanelEmptyState title="Looking for documents..." />
      ) : visible.length === 0 ? (
        <PanelEmptyState
          art={<PanelEmptyGlyph icon={query ? "search" : "document"} />}
          title={query ? "No matching documents" : "No documents yet"}
          description={query ? undefined : "Markdown and Word files in this workspace show up here."}
        />
      ) : (
        <div className="nexis-scrollbar flex-1 overflow-y-auto py-1">
          {visible.map((row) => {
            const dir = displayDirname(row.rel);
            return (
              <button
                key={row.path}
                type="button"
                onClick={() => onOpenDocument(row.path, row.format)}
                className={cn("flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-muted/50")}
              >
                <Icon
                  name={row.format === "docx" ? "document" : "file-edit"}
                  className="shrink-0 text-muted-foreground/60"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-foreground">{basename(row.path)}</span>
                  {dir ? (
                    <span className="block truncate text-[10.5px] text-muted-foreground/60">{dir}</span>
                  ) : null}
                </span>
              </button>
            );
          })}
          {truncated ? (
            <p className="px-3 py-2 text-[10.5px] text-muted-foreground">
              Showing the first {LIST_CAP}. Filter to narrow the list.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
