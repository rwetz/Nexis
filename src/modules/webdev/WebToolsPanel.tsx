// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * The conversions you would otherwise open a browser tab for.
 *
 * All of it is local and none of it is a network call — which is most of the
 * point. Pasting a bearer token into a web JWT decoder is a routine and
 * genuinely bad habit; doing it in a panel that cannot reach the network is
 * the same gesture without the disclosure.
 *
 * The logic lives in `lib/scratchpad.ts` as pure total functions, so this file
 * is only layout and state. Every tool runs on each keystroke against text
 * that is half-typed by definition, which is why nothing here needs try/catch.
 */

import { Icon, type IconName } from "@/components/icon";
import { cn } from "@/lib/utils";
import { useMemo, useState } from "react";
import {
  decodeBase64,
  decodeJwt,
  decodeUrlComponent,
  encodeBase64,
  encodeUrlComponent,
  formatJson,
  minifyJson,
  queryJsonPath,
  runRegex,
  type ToolResult,
} from "./lib/scratchpad";

type ToolId = "json" | "jwt" | "codec" | "regex";

const TOOLS: { id: ToolId; label: string; icon: IconName }[] = [
  { id: "json", label: "JSON", icon: "code-box" },
  { id: "jwt", label: "JWT", icon: "key" },
  { id: "codec", label: "Encode", icon: "replace" },
  { id: "regex", label: "Regex", icon: "search-code" },
];

/** Shared input styling — a plain textarea, not CodeMirror: these are short
 *  pastes, and a full editor per tool would cost more than it gives. */
const FIELD =
  "w-full resize-none rounded-md border border-border/60 bg-card/60 px-2 py-1.5 " +
  "font-mono text-[11px] leading-relaxed outline-none " +
  "focus-visible:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/20";

function Output({ result }: { result: ToolResult }) {
  if (!result.ok) {
    return (
      <p className="flex items-start gap-1.5 rounded-md bg-destructive/10 px-2 py-1.5 text-[10.5px] leading-relaxed text-destructive">
        <Icon name="alert-circle" size="xs" className="mt-px shrink-0" />
        <span className="min-w-0 break-words">{result.error}</span>
      </p>
    );
  }
  if (!result.value) return null;
  return (
    <pre className="max-h-56 overflow-auto rounded-md bg-muted/40 p-2 font-mono text-[10.5px] leading-relaxed whitespace-pre-wrap break-all">
      {result.value}
    </pre>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  if (!text) return null;
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1400);
        });
      }}
      className="flex items-center gap-1 rounded-md border border-border/60 bg-card px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:border-border hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <Icon name={copied ? "check" : "copy"} size="xs" />
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export function WebToolsPanel() {
  const [tool, setTool] = useState<ToolId>("json");

  const [json, setJson] = useState("");
  const [jsonPath, setJsonPath] = useState("");
  const [jwt, setJwt] = useState("");
  const [codecInput, setCodecInput] = useState("");
  const [pattern, setPattern] = useState("");
  const [flags, setFlags] = useState("g");
  const [subject, setSubject] = useState("");

  const jsonOut = useMemo(
    () => (jsonPath.trim() ? queryJsonPath(json, jsonPath) : formatJson(json)),
    [json, jsonPath],
  );
  const jwtOut = useMemo(() => decodeJwt(jwt), [jwt]);
  const regexOut = useMemo(
    () => runRegex(pattern, flags, subject),
    [pattern, flags, subject],
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-2 border-b border-border/50 px-3 py-2">
        <Icon name="tools" className="text-muted-foreground" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Web Tools
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-1 border-b border-border/50 px-2 py-1.5">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={tool === t.id}
            onClick={() => setTool(t.id)}
            className={cn(
              "flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
              tool === t.id
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon name={t.icon} size="xs" active={tool === t.id} />
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2.5">
        {tool === "json" && (
          <>
            <textarea
              className={cn(FIELD, "h-28")}
              placeholder="Paste JSON"
              spellCheck={false}
              value={json}
              onChange={(e) => setJson(e.target.value)}
            />
            <input
              className={cn(FIELD, "h-7")}
              placeholder="$.path.to[0].value  (optional)"
              spellCheck={false}
              value={jsonPath}
              onChange={(e) => setJsonPath(e.target.value)}
            />
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  const r = formatJson(json);
                  if (r.ok) setJson(r.value);
                }}
                className="rounded-md border border-border/60 bg-card px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:border-border hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                Format
              </button>
              <button
                type="button"
                onClick={() => {
                  const r = minifyJson(json);
                  if (r.ok) setJson(r.value);
                }}
                className="rounded-md border border-border/60 bg-card px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:border-border hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                Minify
              </button>
              <span className="ml-auto">
                <CopyButton text={jsonOut.ok ? jsonOut.value : ""} />
              </span>
            </div>
            <Output result={jsonOut} />
          </>
        )}

        {tool === "jwt" && (
          <>
            <textarea
              className={cn(FIELD, "h-20")}
              placeholder="Paste a JWT"
              spellCheck={false}
              value={jwt}
              onChange={(e) => setJwt(e.target.value)}
            />
            {/* Stated plainly and permanently. A decoder that looks like a
                verifier is how `alg: none` bugs reach production. */}
            <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-muted-foreground/70">
              <Icon name="info" size="xs" className="mt-px shrink-0" />
              Decoded, not verified — the signature is displayed but never
              checked. Nothing here leaves your machine.
            </p>
            {jwt.trim() &&
              (jwtOut.ok ? (
                <>
                  {jwtOut.value.expiry && (
                    <p
                      className={cn(
                        "flex items-center gap-1.5 rounded-md px-2 py-1 text-[10.5px]",
                        jwtOut.value.expiry.expired
                          ? "bg-destructive/10 text-destructive"
                          : "bg-primary/10 text-primary",
                      )}
                    >
                      <Icon
                        name={jwtOut.value.expiry.expired ? "alert" : "clock"}
                        size="xs"
                      />
                      {jwtOut.value.expiry.expired ? "Expired" : "Expires"}{" "}
                      {jwtOut.value.expiry.at}
                    </p>
                  )}
                  {jwtOut.value.issuedAt && (
                    <p className="text-[10px] text-muted-foreground/70">
                      Issued {jwtOut.value.issuedAt}
                    </p>
                  )}
                  <span className="text-[9.5px] font-medium uppercase tracking-wide text-muted-foreground/60">
                    Header
                  </span>
                  <Output result={{ ok: true, value: jwtOut.value.header }} />
                  <span className="text-[9.5px] font-medium uppercase tracking-wide text-muted-foreground/60">
                    Payload
                  </span>
                  <Output result={{ ok: true, value: jwtOut.value.payload }} />
                </>
              ) : (
                <Output result={{ ok: false, error: jwtOut.error }} />
              ))}
          </>
        )}

        {tool === "codec" && (
          <>
            <textarea
              className={cn(FIELD, "h-24")}
              placeholder="Text to encode or decode"
              spellCheck={false}
              value={codecInput}
              onChange={(e) => setCodecInput(e.target.value)}
            />
            {(
              [
                ["Base64 encode", encodeBase64],
                ["Base64 decode", decodeBase64],
                ["URL encode", encodeUrlComponent],
                ["URL decode", decodeUrlComponent],
              ] as const
            ).map(([label, fn]) => {
              const result = fn(codecInput);
              if (result.ok && !result.value) return null;
              return (
                <div key={label} className="flex flex-col gap-1">
                  <span className="flex items-center gap-2 text-[9.5px] font-medium uppercase tracking-wide text-muted-foreground/60">
                    {label}
                    <span className="ml-auto">
                      <CopyButton text={result.ok ? result.value : ""} />
                    </span>
                  </span>
                  <Output result={result} />
                </div>
              );
            })}
          </>
        )}

        {tool === "regex" && (
          <>
            <div className="flex items-center gap-1.5">
              <input
                className={cn(FIELD, "h-7 flex-1")}
                placeholder="pattern"
                spellCheck={false}
                value={pattern}
                onChange={(e) => setPattern(e.target.value)}
              />
              <input
                className={cn(FIELD, "h-7 w-16")}
                placeholder="flags"
                spellCheck={false}
                value={flags}
                onChange={(e) => setFlags(e.target.value)}
              />
            </div>
            <textarea
              className={cn(FIELD, "h-24")}
              placeholder="Test string"
              spellCheck={false}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
            {regexOut.ok ? (
              <>
                <span className="text-[10px] text-muted-foreground/70">
                  {regexOut.matches.length}{" "}
                  {regexOut.matches.length === 1 ? "match" : "matches"}
                </span>
                <ul className="flex flex-col gap-1">
                  {regexOut.matches.map((m, i) => (
                    <li
                      key={i}
                      className="rounded-md bg-muted/40 px-2 py-1 font-mono text-[10.5px]"
                    >
                      <span className="text-muted-foreground/60">
                        @{m.index}
                      </span>{" "}
                      <span className="break-all">{m.text || "(empty)"}</span>
                      {m.groups.length > 0 && (
                        <span className="block text-[9.5px] text-muted-foreground/70">
                          {m.groups.map((g, gi) => `$${gi + 1}=${g}`).join("  ")}
                        </span>
                      )}
                      {Object.keys(m.named).length > 0 && (
                        <span className="block text-[9.5px] text-muted-foreground/70">
                          {Object.entries(m.named)
                            .map(([k, v]) => `${k}=${v}`)
                            .join("  ")}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <Output result={{ ok: false, error: regexOut.error }} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
