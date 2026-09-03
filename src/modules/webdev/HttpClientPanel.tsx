// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * The REST client — the thing people currently leave Nexis for.
 *
 * The request goes out through `http_send` in `net.rs`, not through the
 * webview's `fetch`. Three reasons, in order of importance: the webview would
 * apply CORS to a request that has nothing to do with a browser page and fail
 * most of them; `http_send` carries the SSRF guards (metadata endpoints stay
 * unreachable, DNS is pinned against rebinding, hop-by-hop headers are
 * stripped); and it can report wall-clock timing and the post-redirect URL,
 * which `fetch` will not hand back.
 *
 * Saved requests and environments are per workspace, because a `baseUrl` is a
 * property of the project you have open, not of the machine.
 */

import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useMemo, useState } from "react";
import {
  contentTypeOf,
  formatElapsed,
  formatResponseBody,
  formatSize,
  HTTP_METHODS,
  missingVars,
  normalizeUrl,
  parseHeaders,
  statusClass,
  substituteVars,
  type HttpMethod,
  type SavedRequest,
} from "./lib/httpClient";

type ClientHttpResponse = {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: number[];
  elapsedMs: number;
  finalUrl: string;
};

type Props = {
  /** Scopes saved requests and variables to the open workspace. */
  workspaceKey: string;
};

const STATUS_TONE: Record<ReturnType<typeof statusClass>, string> = {
  "success": "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  "redirect": "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  "client-error": "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  "server-error": "bg-destructive/15 text-destructive",
  "info": "bg-muted text-muted-foreground",
};

const FIELD =
  "w-full resize-none rounded-md border border-border/60 bg-card/60 px-2 py-1.5 " +
  "font-mono text-[11px] leading-relaxed outline-none " +
  "focus-visible:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/20";

function storageKey(workspaceKey: string, part: string): string {
  return `nexis:http-client:${part}:${workspaceKey}`;
}

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function HttpClientPanel({ workspaceKey }: Props) {
  const [method, setMethod] = useState<HttpMethod>("GET");
  const [url, setUrl] = useState("");
  const [headerText, setHeaderText] = useState("");
  const [body, setBody] = useState("");
  const [tab, setTab] = useState<"headers" | "body" | "vars">("headers");

  const [saved, setSaved] = useState<SavedRequest[]>(() =>
    loadJson<SavedRequest[]>(storageKey(workspaceKey, "requests"), []),
  );
  const [varsText, setVarsText] = useState<string>(() =>
    loadJson<string>(storageKey(workspaceKey, "vars"), ""),
  );

  const [response, setResponse] = useState<ClientHttpResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  // Variables reuse the header syntax rather than inventing a second one --
  // `name: value`, one per line, with # to comment a line out.
  const vars = useMemo(() => parseHeaders(varsText).headers, [varsText]);

  const resolvedUrl = normalizeUrl(substituteVars(url, vars));
  const unresolved = useMemo(
    () => missingVars(`${url}\n${headerText}\n${body}`, vars),
    [url, headerText, body, vars],
  );
  const { headers: parsedHeaders, invalid: invalidHeaderLines } = useMemo(
    () => parseHeaders(substituteVars(headerText, vars)),
    [headerText, vars],
  );

  const persist = useCallback(
    (next: SavedRequest[]) => {
      setSaved(next);
      try {
        localStorage.setItem(
          storageKey(workspaceKey, "requests"),
          JSON.stringify(next),
        );
      } catch {
        // A full or disabled store must not break sending requests.
      }
    },
    [workspaceKey],
  );

  const persistVars = useCallback(
    (next: string) => {
      setVarsText(next);
      try {
        localStorage.setItem(storageKey(workspaceKey, "vars"), JSON.stringify(next));
      } catch {
        /* ignore */
      }
    },
    [workspaceKey],
  );

  const send = useCallback(async () => {
    if (!resolvedUrl || sending) return;
    setSending(true);
    setError(null);
    setResponse(null);
    try {
      const bodyBytes =
        method === "GET" || method === "HEAD" || !body
          ? null
          : Array.from(new TextEncoder().encode(substituteVars(body, vars)));
      const res = await invoke<ClientHttpResponse>("http_send", {
        url: resolvedUrl,
        method,
        headers: parsedHeaders,
        body: bodyBytes,
        timeoutMs: 30_000,
      });
      setResponse(res);
    } catch (e) {
      setError(String(e));
    } finally {
      setSending(false);
    }
  }, [resolvedUrl, sending, method, body, vars, parsedHeaders]);

  const decoded = useMemo(() => {
    if (!response) return null;
    const text = new TextDecoder().decode(new Uint8Array(response.body));
    const type = contentTypeOf(response.headers);
    return { ...formatResponseBody(text, type), type, bytes: response.body.length };
  }, [response]);

  const saveCurrent = () => {
    const name = url.trim() || "Untitled";
    persist([
      ...saved,
      {
        id: `${Date.now()}`,
        name,
        method,
        url,
        headers: headerText,
        body,
      },
    ]);
  };

  const load = (r: SavedRequest) => {
    setMethod(r.method);
    setUrl(r.url);
    setHeaderText(r.headers);
    setBody(r.body);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-2 border-b border-border/50 px-3 py-2">
        <Icon name="network" className="text-muted-foreground" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          HTTP Client
        </span>
        <button
          type="button"
          onClick={saveCurrent}
          disabled={!url.trim()}
          title="Save this request to the workspace"
          className="ml-auto rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <Icon name="bookmark-add" size="sm" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2.5">
        {/* ── Request line ──────────────────────────────────────────────── */}
        <div className="flex items-center gap-1.5">
          <select
            aria-label="HTTP method"
            value={method}
            onChange={(e) => setMethod(e.target.value as HttpMethod)}
            className="rounded-md border border-border/60 bg-card/60 px-1.5 py-1 font-mono text-[11px] outline-none focus-visible:border-primary/40"
          >
            {HTTP_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <input
            className={cn(FIELD, "h-7 flex-1")}
            placeholder="localhost:3000/api  or  {{baseUrl}}/users"
            spellCheck={false}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void send();
            }}
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={!resolvedUrl || sending}
            className={cn(
              "flex items-center gap-1 rounded-md bg-primary/90 px-2 py-1 text-[11px] font-medium text-primary-foreground transition-colors",
              "hover:bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            <Icon name={sending ? "loading" : "play"} size="xs" className={sending ? "nexis-spin" : undefined} />
            Send
          </button>
        </div>

        {resolvedUrl && resolvedUrl !== url && (
          <p className="truncate font-mono text-[9.5px] text-muted-foreground/60">
            {resolvedUrl}
          </p>
        )}
        {unresolved.length > 0 && (
          <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-amber-600 dark:text-amber-400">
            <Icon name="alert" size="xs" className="mt-px shrink-0" />
            Undefined {unresolved.length === 1 ? "variable" : "variables"}:{" "}
            {unresolved.join(", ")} — left as written, define them under Vars.
          </p>
        )}

        {/* ── Request tabs ──────────────────────────────────────────────── */}
        <div className="flex items-center gap-1">
          {(["headers", "body", "vars"] as const).map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={tab === t}
              onClick={() => setTab(t)}
              className={cn(
                "rounded-md px-1.5 py-0.5 text-[10.5px] capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                tab === t
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "headers" && (
          <>
            <textarea
              className={cn(FIELD, "h-20")}
              placeholder={"Content-Type: application/json\n# Authorization: Bearer {{token}}"}
              spellCheck={false}
              value={headerText}
              onChange={(e) => setHeaderText(e.target.value)}
            />
            {invalidHeaderLines.length > 0 && (
              <p className="text-[10px] leading-relaxed text-amber-600 dark:text-amber-400">
                Ignored (no colon): {invalidHeaderLines.join(" · ")}
              </p>
            )}
          </>
        )}

        {tab === "body" && (
          <textarea
            className={cn(FIELD, "h-28")}
            placeholder={
              method === "GET" || method === "HEAD"
                ? `${method} sends no body`
                : '{ "name": "value" }'
            }
            spellCheck={false}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        )}

        {tab === "vars" && (
          <>
            <textarea
              className={cn(FIELD, "h-20")}
              placeholder={"baseUrl: http://localhost:3000\ntoken: dev-token"}
              spellCheck={false}
              value={varsText}
              onChange={(e) => persistVars(e.target.value)}
            />
            <p className="text-[10px] leading-relaxed text-muted-foreground/70">
              Per workspace, and referenced as <code>{"{{name}}"}</code> in the
              URL, headers or body. Stored in plain text on this machine — fine
              for a dev token, not for a production secret.
            </p>
          </>
        )}

        {/* ── Response ──────────────────────────────────────────────────── */}
        {error && (
          <p className="flex items-start gap-1.5 rounded-md bg-destructive/10 px-2 py-1.5 text-[10.5px] leading-relaxed text-destructive">
            <Icon name="alert-circle" size="xs" className="mt-px shrink-0" />
            <span className="min-w-0 break-words">{error}</span>
          </p>
        )}

        {response && decoded && (
          <div className="flex flex-col gap-1.5 border-t border-border/50 pt-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
                  STATUS_TONE[statusClass(response.status)],
                )}
              >
                {response.status} {response.statusText}
              </span>
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {formatElapsed(response.elapsedMs)} · {formatSize(decoded.bytes)}
                {decoded.type ? ` · ${decoded.type}` : ""}
              </span>
            </div>
            {response.finalUrl !== resolvedUrl && (
              <p className="truncate font-mono text-[9.5px] text-muted-foreground/60">
                redirected to {response.finalUrl}
              </p>
            )}
            <pre className="max-h-64 overflow-auto rounded-md bg-muted/40 p-2 font-mono text-[10.5px] leading-relaxed whitespace-pre-wrap break-all">
              {decoded.text || "(empty body)"}
            </pre>
            <details>
              <summary className="cursor-pointer text-[10px] text-muted-foreground/70">
                {Object.keys(response.headers).length} response headers
              </summary>
              <pre className="mt-1 max-h-40 overflow-auto rounded-md bg-muted/40 p-2 font-mono text-[10px] leading-relaxed">
                {Object.entries(response.headers)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join("\n")}
              </pre>
            </details>
          </div>
        )}

        {/* ── Saved ─────────────────────────────────────────────────────── */}
        {saved.length > 0 && (
          <div className="flex flex-col gap-1 border-t border-border/50 pt-2">
            <span className="text-[9.5px] font-medium uppercase tracking-wide text-muted-foreground/60">
              Saved in this workspace
            </span>
            {saved.map((r) => (
              <div key={r.id} className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => load(r)}
                  className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-primary/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  <span className="shrink-0 font-mono text-[9.5px] text-muted-foreground/70">
                    {r.method}
                  </span>
                  <span className="truncate font-mono text-[10.5px]">
                    {r.name}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={`Delete saved request ${r.name}`}
                  onClick={() => persist(saved.filter((x) => x.id !== r.id))}
                  className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  <Icon name="close" size="xs" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
