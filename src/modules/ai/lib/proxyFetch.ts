// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { startHttpStream, type HttpStreamEvent } from "@/platform/http-stream";

type RequestHeaders = Record<string, string>;

function headerInitToRecord(
  init: HeadersInit | undefined,
): RequestHeaders | undefined {
  if (!init) return undefined;
  const out: RequestHeaders = {};
  if (init instanceof Headers) {
    init.forEach((value, key) => {
      out[key] = value;
    });
  } else if (Array.isArray(init)) {
    for (const [k, v] of init) out[k] = v;
  } else {
    for (const [k, v] of Object.entries(init)) out[k] = String(v);
  }
  return out;
}

type EncodedBody = { bytes: number[]; contentType?: string };

async function bodyToBytes(
  body: BodyInit | null | undefined,
): Promise<EncodedBody | undefined> {
  if (body == null) return undefined;
  if (typeof body === "string") {
    return { bytes: Array.from(new TextEncoder().encode(body)) };
  }
  if (body instanceof ArrayBuffer) {
    return { bytes: Array.from(new Uint8Array(body)) };
  }
  if (ArrayBuffer.isView(body)) {
    const view = body as ArrayBufferView;
    return {
      bytes: Array.from(
        new Uint8Array(view.buffer, view.byteOffset, view.byteLength),
      ),
    };
  }
  // FormData (Whisper uploads audio this way), URLSearchParams, Blob,
  // ReadableStream: let `Response` serialize it. Read raw bytes, never text,
  // or binary parts are mangled; keep the content type it chose, because
  // for FormData that carries the multipart boundary.
  const encoded = new Response(body as BodyInit);
  return {
    bytes: Array.from(new Uint8Array(await encoded.arrayBuffer())),
    contentType: encoded.headers.get("content-type") ?? undefined,
  };
}

export function createProxyFetch(
  opts: { allowPrivateNetwork?: boolean } = {},
): typeof fetch {
  const allowPrivate = opts.allowPrivateNetwork === true;
  return async (input, init) => proxyFetchImpl(input, init, allowPrivate);
}

/**
 * The fetch every cloud AI provider must use. The CSP's `connect-src` admits
 * only the updater endpoint and localhost, so a provider call made with the
 * webview's own `fetch` fails with "Failed to fetch"; this one goes through
 * the Rust proxy (`ai_http_stream`) with the SSRF default of no private
 * networks.
 */
export const cloudProxyFetch: typeof fetch = createProxyFetch();

/** Backwards-compatible default — refuses private networks unless the caller
 *  explicitly opts in via {@link createProxyFetch}. */
async function proxyFetchImpl(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  allowPrivateNetwork: boolean,
): Promise<Response> {
  const url = input instanceof URL ? input.toString() : String(input);
  const method = (init?.method ?? "GET").toUpperCase();
  const encoded = await bodyToBytes(init?.body);
  const body = encoded?.bytes;
  let headers = headerInitToRecord(init?.headers);
  if (
    encoded?.contentType &&
    !Object.keys(headers ?? {}).some((k) => k.toLowerCase() === "content-type")
  ) {
    headers = { ...headers, "content-type": encoded.contentType };
  }

  const signal = init?.signal;
  if (signal?.aborted) {
    throw makeAbortError();
  }

  return new Promise<Response>((resolve, reject) => {
    let resolved = false;
    let streamController: ReadableStreamDefaultController<Uint8Array> | null =
      null;
    let cancelled = false;

    const onAbort = () => {
      cancelled = true;
      if (!resolved) {
        reject(makeAbortError());
      } else if (streamController) {
        try {
          streamController.error(makeAbortError());
        } catch {
          /* already closed */
        }
      }
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    const receive = (event: HttpStreamEvent) => {
      if (cancelled) return;
      switch (event.kind) {
        case "headers": {
          const stream = new ReadableStream<Uint8Array>({
            start(controller) {
              streamController = controller;
            },
            cancel() {
              cancelled = true;
            },
          });
          resolved = true;
          resolve(
            new Response(stream, {
              status: event.status,
              headers: new Headers(event.headers),
            }),
          );
          break;
        }
        case "chunk": {
          streamController?.enqueue(Uint8Array.from(event.bytes));
          break;
        }
        case "end": {
          streamController?.close();
          break;
        }
        case "error": {
          if (!resolved) {
            reject(new Error(event.message));
          } else {
            streamController?.error(new Error(event.message));
          }
          break;
        }
      }
    };

    startHttpStream(
      { url, method, headers, body, allowPrivateNetwork },
      receive,
    ).catch((e) => {
      if (resolved) return; // headers already arrived; chunk-side error wins
      reject(e instanceof Error ? e : new Error(String(e)));
    });
  });
}

function makeAbortError(): DOMException {
  return new DOMException("Request aborted", "AbortError");
}
