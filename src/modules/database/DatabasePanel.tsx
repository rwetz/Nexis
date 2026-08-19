// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useRef, useState } from "react";
import { listTables, runQuery, type QueryResult } from "./databaseRunner";
import { useDatabaseStore, type DbConnection, type DbType } from "./databaseStore";

const DB_TYPES: { id: DbType; label: string }[] = [
  { id: "sqlite", label: "SQLite" },
  { id: "postgresql", label: "PostgreSQL" },
  { id: "mysql", label: "MySQL" },
];


/** Connection-string examples per driver. Constant, so it is built once. */
const placeholder: Record<DbType, string> = {
  sqlite: "/path/to/database.db",
  postgresql: "postgresql://user:pass@localhost/dbname",
  mysql: "mysql://user:pass@localhost/dbname",
};

export function DatabasePanel() {
  const { connections, activeId, add, remove, setActive } = useDatabaseStore();
  const active = connections.find((c) => c.id === activeId) ?? null;
  const [showAdd, setShowAdd] = useState(false);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b border-border/50 bg-gradient-to-r from-primary/[0.04] to-transparent px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Database
        </span>
        <button
          type="button"
          onClick={() => setShowAdd((v) => !v)}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Icon name="add" />
          Connect
        </button>
      </div>

      {showAdd && (
        <AddConnectionForm
          onAdd={(conn) => { add(conn); setShowAdd(false); }}
          onCancel={() => setShowAdd(false)}
        />
      )}

      {connections.length === 0 && !showAdd ? (
        <div className="flex h-full items-center justify-center">
          <div className="flex flex-col items-center gap-2 text-center">
            <Icon name="database" size="xl" className="text-muted-foreground/30" />
            <p className="text-[11px] text-muted-foreground/60">No connections</p>
            <p className="text-[10px] text-muted-foreground/40">Click Connect to add one</p>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {connections.length > 0 && (
            <div className="shrink-0 border-b border-border/30 bg-muted/20">
              {connections.map((c) => (
                <ConnectionItem
                  key={c.id}
                  conn={c}
                  isActive={c.id === activeId}
                  onSelect={() => setActive(c.id)}
                  onRemove={() => remove(c.id)}
                />
              ))}
            </div>
          )}

          {active ? (
            <QueryEditor connection={active} />
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-[11px] text-muted-foreground/60">Select a connection</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ConnectionItem({ conn, isActive, onSelect, onRemove }: {
  conn: DbConnection;
  isActive: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  return (
    // Plain container: the row carries a Remove control, so making the row
    // itself a button (or an ARIA `option`, whose children are presentational)
    // would put a control inside a control and hide Remove from screen readers.
    <div
      className={cn(
        "group flex items-center gap-2 border-b border-border/20 px-3 py-1.5 last:border-none",
        isActive ? "bg-primary/[0.06]" : "hover:bg-muted/30",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-current={isActive || undefined}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
      >
        <Icon
          name="database"
          className={isActive ? "text-primary" : "text-muted-foreground/60"}
        />
        <span className={cn("flex-1 text-[11px] truncate", isActive ? "text-foreground font-medium" : "text-foreground/80")}>
          {conn.name}
        </span>
        <span className="text-[9px] text-muted-foreground/50">{conn.type}</span>
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove connection ${conn.name}`}
        className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100 focus-visible:opacity-100"
      >
        <Icon name="delete" size="xs" />
      </button>
    </div>
  );
}

function AddConnectionForm({ onAdd, onCancel }: {
  onAdd: (conn: Omit<DbConnection, "id">) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<DbType>("sqlite");
  const [connStr, setConnStr] = useState("");

  return (
    <div className="border-b border-border/40 bg-muted/20 p-3 flex flex-col gap-2">
      <input
        // This form is only rendered after the user clicks "Connect" to add a
        // connection; landing on its first field is the expected result of
        // that action, not focus being stolen from elsewhere.
        // react-doctor-disable-next-line react-doctor/no-autofocus
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label="Connection name"
        placeholder="Connection name"
        className="rounded border border-border/60 bg-muted/30 px-2 py-1 text-[12px] text-foreground outline-none focus:border-primary/60"
      />
      <select
        value={type}
        onChange={(e) => setType(e.target.value as DbType)}
        aria-label="Database type"
        className="rounded border border-border/60 bg-muted/30 px-2 py-1 text-[12px] text-foreground outline-none"
      >
        {DB_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
      </select>
      <input
        value={connStr}
        onChange={(e) => setConnStr(e.target.value)}
        placeholder={placeholder[type]}
        className="rounded border border-border/60 bg-muted/30 px-2 py-1 font-mono text-[11px] text-foreground outline-none focus:border-primary/60"
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!name.trim() || !connStr.trim()}
          onClick={() => onAdd({ name: name.trim(), type, connectionString: connStr.trim() })}
          className="flex-1 rounded bg-primary/90 px-2 py-1 text-[11.5px] font-medium text-primary-foreground hover:bg-primary disabled:opacity-50"
        >
          Connect
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-border/60 px-2 py-1 text-[11.5px] text-muted-foreground hover:bg-muted"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function QueryEditor({ connection }: { connection: DbConnection }) {
  const [query, setQuery] = useState("SELECT * FROM sqlite_master LIMIT 10;");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [running, setRunning] = useState(false);
  const [tables, setTables] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    void listTables(connection).then(setTables).catch(() => setTables([]));
    setResult(null);
    const defaultQueries: Record<DbType, string> = {
      sqlite: "SELECT name FROM sqlite_master WHERE type='table';",
      postgresql: "SELECT tablename FROM pg_tables WHERE schemaname='public';",
      mysql: "SHOW TABLES;",
    };
    setQuery(defaultQueries[connection.type]);
  }, [connection]);

  const run = useCallback(async () => {
    if (!query.trim()) return;
    setRunning(true);
    const r = await runQuery(connection, query);
    setResult(r);
    setRunning(false);
  }, [connection, query]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {tables.length > 0 && (
        <div className="shrink-0 border-b border-border/20 bg-muted/10 px-3 py-1.5">
          <div className="flex flex-wrap gap-1">
            {tables.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setQuery(`SELECT * FROM "${t}" LIMIT 100;`)}
                className="rounded bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-foreground/70 hover:bg-muted hover:text-foreground"
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="relative shrink-0 border-b border-border/30">
        <textarea
          ref={textareaRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="SQL query"
          rows={4}
          className="w-full resize-none bg-transparent p-3 font-mono text-[12px] text-foreground outline-none"
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
              e.preventDefault();
              void run();
            }
          }}
        />
        <button
          type="button"
          onClick={() => void run()}
          disabled={running || !query.trim()}
          title="Run (Ctrl+Enter)"
          className="absolute right-2 bottom-2 flex items-center gap-1 rounded bg-primary/90 px-2 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary disabled:opacity-50"
        >
          <Icon name="play" size="xs" />
          {running ? "Running…" : "Run"}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {result === null ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-[11px] text-muted-foreground/60">Press Run or Ctrl+Enter to execute</p>
          </div>
        ) : result.kind === "error" ? (
          <div className="p-3">
            <p className="font-mono text-[11px] text-destructive">{result.message}</p>
          </div>
        ) : result.kind === "message" ? (
          <div className="p-3">
            <p className="text-[11px] text-muted-foreground">{result.text}</p>
          </div>
        ) : (
          <ResultTable columns={result.columns} rows={result.rows} />
        )}
      </div>
    </div>
  );
}

function ResultTable({ columns, rows }: { columns: string[]; rows: string[][] }) {
  if (columns.length === 0) {
    return <div className="p-3 text-[11px] text-muted-foreground">No results</div>;
  }
  return (
    <table className="w-full border-collapse text-[11px]">
      <thead className="sticky top-0 bg-card/80 backdrop-blur">
        <tr>
          {columns.map((col) => (
            <th key={col} className="border-b border-border/40 px-3 py-1.5 text-left font-semibold text-muted-foreground/80">
              {col}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, ri) => (
          <tr key={ri} className="border-b border-border/20 hover:bg-muted/20">
            {row.map((cell, ci) => (
              <td key={ci} className="max-w-[200px] truncate px-3 py-1 font-mono text-foreground/80">
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
