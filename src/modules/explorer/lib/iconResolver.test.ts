// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { readFile } from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { fileIconArt, folderIconArt, preloadIcons } from "./iconResolver";

/** Stable identity for an art object, for equality assertions. */
function id(art: ReturnType<typeof fileIconArt>): string {
  return art ? `${art.width}x${art.height}:${art.body}` : "";
}

// The resolver loads its icon sets via fetch() of Vite `?url` asset imports.
// In the node test environment those resolve to dev-server paths ("/src/…",
// "/@fs/…") that fetch can't reach — serve them from disk instead.
function assetUrlToFsPath(u: string): string {
  const clean = u.split("?")[0];
  if (clean.startsWith("/@fs/")) return clean.slice("/@fs".length);
  return path.join(process.cwd(), clean.replace(/^\//, ""));
}

beforeAll(async () => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const bytes = await readFile(assetUrlToFsPath(String(input)));
    return new Response(bytes);
  }) as typeof fetch;
  await preloadIcons();
});

describe("folderIconArt — catppuccin primary", () => {
  it("maps a known folder name and changes art when expanded", () => {
    const closed = folderIconArt("src", false);
    const open = folderIconArt("src", true);
    expect(closed?.body).toBeTruthy();
    expect(open?.body).toBeTruthy();
    expect(id(closed)).not.toBe(id(open));
  });

  it("keeps the deliberate mobile→android approximation", () => {
    expect(id(folderIconArt("mobile", false))).toBe(
      id(folderIconArt("android", false)),
    );
  });

  it("falls back to the default folder icon for unknown names", () => {
    const unknown = folderIconArt("zzz-no-such-ecosystem", false);
    expect(id(unknown)).toBe(id(folderIconArt("", false)));
  });
});

describe("folderIconArt — vscode-icons fallback", () => {
  it("serves ecosystems catppuccin lacks from the 32x32 vscode set", () => {
    const kotlin = folderIconArt("kotlin", false);
    expect(kotlin?.body).toBeTruthy();
    expect(kotlin?.width).toBe(32);
    expect(kotlin?.height).toBe(32);
    // Not the default folder.
    expect(id(kotlin)).not.toBe(id(folderIconArt("zzz-no-such-ecosystem", false)));
  });

  it("aliases dotnet and .nuget onto the NuGet art, jvm onto Maven", () => {
    const dotnet = folderIconArt("dotnet", false);
    expect(id(dotnet)).toBe(id(folderIconArt(".nuget", false)));
    expect(dotnet?.width).toBe(32);

    const jvm = folderIconArt("jvm", false);
    expect(jvm?.width).toBe(32);
    expect(id(jvm)).not.toBe(id(dotnet));
  });

  it("reuses closed art for the expanded state (no -opened variants shipped)", () => {
    expect(id(folderIconArt("kotlin", true))).toBe(
      id(folderIconArt("kotlin", false)),
    );
  });

  it("strips leading dots before matching the vscode set", () => {
    expect(id(folderIconArt(".expo", false))).toBe(
      id(folderIconArt("expo", false)),
    );
  });
});

describe("theme retint", () => {
  it("rewrites every catppuccin hex to a theme variable", () => {
    // A sample wide enough to hit most of the 19-colour palette.
    const bodies = [
      "main.rs",
      "app.tsx",
      "styles.css",
      "readme.md",
      "data.json",
      "Dockerfile",
      "script.py",
      "index.html",
    ]
      .map((n) => fileIconArt(n)?.body ?? "")
      .join("");
    expect(bodies).toBeTruthy();
    expect(bodies).toContain("var(--terminal-ansi-");
    // No baked-in Catppuccin colour may survive — that is the whole point:
    // a hex here is a colour no Nexis theme can reach.
    expect(bodies).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });

  it("leaves the vscode-icons brand art alone", () => {
    // Recolouring a NuGet or Maven logo to fit a theme just makes it wrong.
    const kotlin = folderIconArt("kotlin", false);
    expect(kotlin?.body).toBeTruthy();
    expect(kotlin?.body).not.toContain("var(--terminal-ansi-");
  });
});

describe("fileIconArt", () => {
  it("resolves known extensions and falls back to the generic file icon", () => {
    const rust = fileIconArt("main.rs");
    const generic = fileIconArt("blob.zzz9");
    expect(rust?.body).toBeTruthy();
    expect(generic?.body).toBeTruthy();
    expect(id(rust)).not.toBe(id(generic));
  });

  it("walks compound extensions down to the last segment", () => {
    // "backup.rs" has no dedicated icon → the walk falls through to "rs".
    expect(id(fileIconArt("data.backup.rs"))).toBe(id(fileIconArt("main.rs")));
  });

  it("prefers a dedicated compound-extension icon over the plain one", () => {
    // catppuccin ships a distinct *.test.ts glyph — it must win over "ts".
    expect(id(fileIconArt("foo.test.ts"))).not.toBe(id(fileIconArt("bar.ts")));
  });
});
