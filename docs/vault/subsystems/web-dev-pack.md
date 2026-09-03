---
type: subsystem
description: The Web Dev pack — multi-viewport preview, the REST client and why it has its own Rust command, and the local-only scratchpad tools.
---

# Web Dev pack

Three panels, added 2026-09-03, under the `web-dev` pack. Views: `http-client`, `web-tools`. The multi-viewport preview lives in the existing preview pane rather than in a new view.

## HTTP client (`modules/webdev/HttpClientPanel.tsx`)

Pure logic in `modules/webdev/lib/httpClient.ts`; the request goes out through **`net::http_send`**, not the webview's `fetch`.

Three reasons, in order: `fetch` would apply CORS to a request that has nothing to do with a browser page and fail most of them; `http_send` carries the SSRF guards; and it reports wall-clock timing and the post-redirect URL, which `fetch` will not hand back.

**`http_send` is deliberately separate from `ai_http_request`** even though they share every validation helper in `net.rs`. Different threat models that must be able to diverge:

| | `ai_http_request` | `http_send` |
|---|---|---|
| URL origin | model output, tool results | typed by a human |
| `allow_private_network` | off by default | always on |

Reaching `localhost:3000` is the entire point of the client, and is exactly what the AI path must not do by default. **What does not relax on either path:** cloud-metadata addresses (`169.254.169.254`, `fd00:ec2::254`, IPv6 link-local, the metadata hostnames) stay refused regardless of the flag, along with the header blocklist, userinfo rejection, scheme allow-list, and the DNS pinning that defeats rebinding between classification and connect. Two tests in `net.rs` pin both halves of that contract — **do not weaken them to make the client more convenient**, because the AI path shares the function.

Saved requests and variables are per workspace (`currentWorkspaceScopeKey()`), because a `baseUrl` belongs to the project, not the machine. Variables reuse the header box's `name: value` syntax rather than inventing a second one.

An unknown `{{variable}}` is left **verbatim** rather than emptied — emptying it yields `https:///users` or `Authorization: Bearer `, and the resulting 401 sends you looking at the server.

## Multi-viewport preview (`modules/preview/`)

`viewports.ts` holds the presets and the fit arithmetic; `PreviewPane.tsx` renders one iframe per selected viewport. An empty selection is the original single full-size frame and stays the default — N frames is N page loads against the dev server.

Three things that are easy to get wrong and are already decided:

- **Widths are CSS pixels, not physical device pixels.** An iPhone 15 panel is 1179 physical px and every media query reads it as 393.
- **One scale for all frames, never one each.** Per-frame fitting would render a 390px phone and a 1440px desktop at the same on-screen width, destroying the only thing side-by-side is for.
- **`transform: scale()`, never CSS `zoom`.** Both shrink the box; only transform keeps hit-testing correct. A `zoom` here reproduces CLAUDE.md pitfall #15 *inside the previewed page*, where it gets blamed on the user's own app. There is a test.

The iframe `sandbox` is a single shared constant (`PREVIEW_SANDBOX`) so the frames cannot drift apart. `PreviewPane.test.ts` asserts there is exactly **one** definition, that every iframe routes through it, and that no inline `sandbox="…"` literal exists — the previous version matched only the first `<iframe>` and could not have caught a second frame declaring a weaker sandbox.

## Scratchpad tools (`modules/webdev/WebToolsPanel.tsx`)

JSON format/minify + a JSONPath subset, JWT decode, base64/URL codecs, regex tester. All logic is pure and total in `lib/scratchpad.ts` — every function returns a result rather than throwing, because they run on each keystroke against text that is half-typed by definition.

Points worth not re-litigating:

- **The JWT decoder does not verify and says so permanently.** A decoder that looks like a verifier is how `alg: none` bugs ship. `exp`/`iat` are seconds, not milliseconds.
- **The JSONPath subset rejects unsupported syntax by name** rather than returning nothing. Silence reads as "the data did not match" when the truth is "the tool did not understand".
- The regex tester advances past zero-length matches; `a*` otherwise hangs the UI thread.

Related: [[expansion-packs]], [[icon-and-motion-system]], [[ipc-surface]].
