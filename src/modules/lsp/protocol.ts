// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

// LSP 3.17 types used by the frontend client.

export type LspPosition = { line: number; character: number };
export type LspRange = { start: LspPosition; end: LspPosition };
export type LspLocation = { uri: string; range: LspRange };

export type LspTextDocumentIdentifier = { uri: string };
export type LspVersionedTextDocumentIdentifier = { uri: string; version: number };

export type LspMarkupContent = { kind: "plaintext" | "markdown"; value: string };
export type LspMarkedString = string | { language: string; value: string };
export type LspHoverContents = LspMarkupContent | LspMarkedString | LspMarkedString[];

export type LspHover = {
  contents: LspHoverContents;
  range?: LspRange;
};

export type LspCompletionItemKind = 1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17|18|19|20|21|22|23|24|25;

export const LSP_COMPLETION_KIND_NAMES: Record<LspCompletionItemKind, string> = {
  1: "Text", 2: "Method", 3: "Function", 4: "Constructor",
  5: "Field", 6: "Variable", 7: "Class", 8: "Interface",
  9: "Module", 10: "Property", 11: "Unit", 12: "Value",
  13: "Enum", 14: "Keyword", 15: "Snippet", 16: "Color",
  17: "File", 18: "Reference", 19: "Folder", 20: "EnumMember",
  21: "Constant", 22: "Struct", 23: "Event", 24: "Operator",
  25: "TypeParameter",
};

export type LspCompletionItem = {
  label: string;
  kind?: LspCompletionItemKind;
  detail?: string;
  documentation?: string | LspMarkupContent;
  sortText?: string;
  filterText?: string;
  insertText?: string;
  insertTextFormat?: 1 | 2; // 1=plain, 2=snippet
  textEdit?: { range: LspRange; newText: string };
};

export type LspCompletionList = {
  isIncomplete: boolean;
  items: LspCompletionItem[];
};

export type LspDiagnosticSeverity = 1 | 2 | 3 | 4; // Error Warning Info Hint
export type LspDiagnostic = {
  range: LspRange;
  severity?: LspDiagnosticSeverity;
  message: string;
  source?: string;
  code?: string | number;
};

export type LspTextEdit = { range: LspRange; newText: string };

export type LspWorkspaceEdit = {
  changes?: Record<string, LspTextEdit[]>;
  documentChanges?: Array<{
    textDocument: LspVersionedTextDocumentIdentifier;
    edits: LspTextEdit[];
  }>;
};

export type LspCodeAction = {
  title: string;
  kind?: string;
  edit?: LspWorkspaceEdit;
  command?: { title: string; command: string; arguments?: unknown[] };
};

export function hoverToMarkdown(contents: LspHoverContents): string {
  if (typeof contents === "string") return contents;
  if (Array.isArray(contents)) {
    return contents
      .map((c) => (typeof c === "string" ? c : `\`\`\`${c.language}\n${c.value}\n\`\`\``))
      .join("\n\n");
  }
  if ("kind" in contents) return contents.value;
  if ("language" in contents) return `\`\`\`${contents.language}\n${contents.value}\n\`\`\``;
  return String(contents);
}

export function lspSeverityToCm(
  severity?: LspDiagnosticSeverity,
): "error" | "warning" | "info" {
  if (severity === 1) return "error";
  if (severity === 2) return "warning";
  return "info";
}

export function pathToUri(path: string): string {
  const norm = path.replace(/\\/g, "/");
  // Windows drive letter: C:/foo → file:///C:/foo
  if (/^[a-zA-Z]:\//.test(norm)) {
    return `file:///${norm}`;
  }
  return `file://${norm}`;
}

export function uriToPath(uri: string): string {
  const withoutScheme = uri
    .replace(/^file:\/\/\//, "") // Windows
    .replace(/^file:\/\//, "");  // Unix
  const decoded = decodeURIComponent(withoutScheme);
  // Windows: C:/foo — leave forward slashes, Tauri handles both
  return decoded;
}
