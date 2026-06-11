# Security

Nexis runs real shells, reads and writes files, and talks to AI providers. Security issues matter here — please report them privately before going public.

## How to report

Email **rwetz00@gmail.com** — subject `[Nexis security]`.

Tell me:
- What the vulnerability is and what an attacker could do with it
- How to reproduce it (even a rough PoC helps a lot)
- Your version, OS, and architecture

I'll acknowledge within a few days. Once fixed, I'll credit you in the release notes unless you'd prefer to stay anonymous.

**Please don't open a public GitHub issue for security reports.**

## Supported versions

Only the latest release is actively patched. That's currently `1.18.x`.

## In scope

- Rust backend (`src-tauri/`) — PTY, FS access, IPC, plugins
- Frontend (`src/`) — anywhere untrusted data lands: terminal output, file content, AI tool results, credentials
- Release binaries published to GitHub
- The auto-updater pipeline

## Out of scope

- Vulnerabilities in upstream dependencies (Tauri, xterm.js, CodeMirror, AI SDKs) — report those to the respective projects; I'll ship the fix once it lands upstream
- Issues that require an already-compromised machine or existing shell access
- Versions older than `0.7`

## How Nexis handles security

- **API keys** are stored in the OS keychain via the `keyring` crate. They never touch disk, localStorage, or logs.
- **No telemetry.** Network calls only happen when you initiate them — AI requests, update checks, and web preview. Nothing else.
- **Tool approval.** The AI agent can't write files or run shell commands without you explicitly approving each action.
- **IPC sandboxing.** The frontend can only call allow-listed Tauri commands — no direct OS access from the webview.
- **Verified updates.** Release artifacts are signed; the updater checks signatures before applying anything.

## Honest limitations

- Nexis runs whatever you or the agent tell it to run, with your user permissions. That's the whole point of a terminal.
- AI providers receive the content of your messages. Check their data retention policies.
- Local model endpoints (LM Studio, OpenAI-compatible) are trusted at the network level — only connect to servers you own or control.
