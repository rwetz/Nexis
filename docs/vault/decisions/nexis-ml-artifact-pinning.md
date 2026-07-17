---
type: decision
description: nexis-ml engine artifacts stay on GitHub Releases; Nexis compiles in an exact release tag + per-platform SHA-256 and verifies before first execution
---

# nexis-ml artifacts: GitHub Releases + compiled-in SHA-256 pin

**Date:** 2026-07
**Status:** active — implemented 2026-07 (packs plan V3; see [[expansion-packs]])

## Context

The ML Lab's standalone engine is the only true download in Nexis. The original flow fetched the GitHub *latest* release over HTTPS with no integrity check — the only "verification" was executing the unverified binary with `--version`. The frontend also supplied the download URL over IPC, making `ml_download` an arbitrary-binary installer for anything that could reach the IPC layer. Packs plan V3 was blocked on choosing the hosting + signing story.

## Decision

1. **Hosting stays on GitHub Releases** (`rwetz/nexis-ml-rs`). Free, CDN-backed, tags map cleanly to pins, checksums can be produced by the same release workflow. No new infra.
2. **Integrity = compiled-in pin, not signatures.** Each Nexis release pins an exact engine release tag plus per-platform asset name, size, and SHA-256 (`ENGINE_TAG` / `ENGINE_VERSION` / `engine_asset()` in `src-tauri/src/modules/ml.rs`). The URL is derived from the pin — never frontend-supplied. Bytes are hashed **before** being written to the managed dir or executed; post-install, `--version` must report exactly the pinned version. "latest" is never fetched.
3. **Offline path shares the gate.** `ml_install_local` installs from a file on disk with the same hash check — air-gapped machines download the asset elsewhere and carry it over. Self-built engines fail the pin by design; they remain usable through PATH/venv *detection*, which stays unverified as before. Invariant: **the managed engine dir only ever holds pin-verified bytes.**
4. **Uninstall + footprint.** `ml_uninstall` deletes the managed binary (returns freed bytes); `ml_engine_status` reports installed/size for the panel readout. Engines in venvs/PATH are not Nexis's to remove.
5. **Consent before download.** The panel shows version, source, size, and the full pinned SHA-256, and states that verification happens before the binary can run.

## Alternatives rejected

- **Minisign/ed25519 signatures with an embedded public key** — lets the engine update independently of Nexis ("latest" stays valid), but requires a signing key in nexis-ml-rs CI secrets (a real supply-chain surface), a verify crate against the <10 MB budget, and a `.minisig` sidecar for the offline path. Overkill while app and engine are released by the same maintainer, usually together. Revisit if engine releases decouple from app releases.
- **Checksums fetched from a manifest next to the asset** — same channel as the asset, so it adds nothing against a compromised host; HTTPS already covers transit.
- **Self-hosting on nexisdev.org** — infra burden and a single point of failure for zero integrity gain over the pin.

## Consequences

- **Shipping a new engine requires a Nexis release**: bump `ENGINE_TAG`/`ENGINE_VERSION`, download the assets, paste `sha256sum` output into `engine_asset()`. The `engine_pin_is_well_formed` unit test catches malformed pins.
- The nexis-ml-rs release workflow should publish a `checksums.txt` asset so the pin can be cross-checked against CI output instead of trusting a local download (tracked in ROADMAP).
- The v0.8.0 pin's hashes were computed from the published release assets at implementation time (trust-on-first-use) — cross-check them against the original build outputs when convenient.
- macOS still has no prebuilt asset: `engine_asset()` returns None, the panel offers the Python engine instead. Adding a mac build means adding a pin entry, not new flow.
