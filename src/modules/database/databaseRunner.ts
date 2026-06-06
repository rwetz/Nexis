// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { native } from "@/modules/ai/lib/native";
import type { DbConnection, DbType } from "./databaseStore";

export type QueryResult =
  | { kind: "rows"; columns: string[]; rows: string[][] }
  | { kind: "message"; text: string }
  | { kind: "error"; message: string };

function buildCommand(conn: DbConnection, query: string): string {
  const q = query.replace(/'/g, "'\\''");
  switch (conn.type) {
    case "sqlite":
      return `sqlite3 -csv -header '${conn.connectionString}' '${q}'`;
    case "postgresql":
      return `psql '${conn.connectionString}' -c '${q}'`;
    case "mysql":
      return `mysql '${conn.connectionString}' -e '${q}'`;
    default:
      return "";
  }
}

function parseCSV(text: string): { columns: string[]; rows: string[][] } {
  const lines = text.trim().split("\n").filter(Boolean);
  if (lines.length === 0) return { columns: [], rows: [] };
  const parse = (line: string): string[] =>
    line.split(",").map((c) => c.replace(/^"|"$/g, "").replace(/""/g, '"'));
  const columns = parse(lines[0] ?? "");
  const rows = lines.slice(1).map((l) => parse(l));
  return { columns, rows };
}

function parsePsql(text: string): { columns: string[]; rows: string[][] } {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return { columns: [], rows: [] };
  const columns = (lines[0] ?? "").split("|").map((c) => c.trim());
  const rows: string[][] = [];
  for (let i = 2; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (line.startsWith("(")) break;
    rows.push(line.split("|").map((c) => c.trim()));
  }
  return { columns, rows };
}

export async function runQuery(conn: DbConnection, query: string): Promise<QueryResult> {
  const command = buildCommand(conn, query.trim());
  if (!command) return { kind: "error", message: "Unsupported database type" };

  try {
    const result = await native.runCommand(command, null, 30);
    if (result.exit_code !== 0) {
      return { kind: "error", message: result.stderr || result.stdout || "Query failed" };
    }
    const output = result.stdout.trim();
    if (!output) return { kind: "message", text: "Query executed (no output)" };

    if (conn.type === "sqlite") {
      const { columns, rows } = parseCSV(output);
      return { kind: "rows", columns, rows };
    } else if (conn.type === "postgresql") {
      const { columns, rows } = parsePsql(output);
      return { kind: "rows", columns, rows };
    }
    return { kind: "message", text: output };
  } catch (err) {
    return { kind: "error", message: String(err) };
  }
}

export async function listTables(conn: DbConnection): Promise<string[]> {
  const queries: Record<DbType, string> = {
    sqlite: "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;",
    postgresql: "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;",
    mysql: "SHOW TABLES;",
  };
  const query = queries[conn.type];
  const result = await runQuery(conn, query);
  if (result.kind !== "rows") return [];
  return result.rows.map((r) => r[0] ?? "").filter(Boolean);
}
