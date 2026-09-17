import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC_ROOT = fileURLToPath(new URL("..", import.meta.url));

type SourceFile = {
  path: string;
  source: string;
};

function productionSourceFiles(): SourceFile[] {
  const files: SourceFile[] = [];
  const walk = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(absolute);
      } else if (
        /\.(ts|tsx)$/.test(entry.name) &&
        !/\.(test|spec)\.(ts|tsx)$/.test(entry.name) &&
        !entry.name.endsWith(".d.ts")
      ) {
        files.push({
          path: path.relative(SRC_ROOT, absolute).replace(/\\/g, "/"),
          source: fs.readFileSync(absolute, "utf8"),
        });
      }
    }
  };
  walk(SRC_ROOT);
  return files;
}

function moduleSpecifiers(source: string): string[] {
  const specifiers = new Set<string>();
  const fromOrDynamicImport = /(?:\bfrom\s*|\bimport\s*\(\s*)["']([^"']+)["']/g;
  const sideEffectImport = /\bimport\s*["']([^"']+)["']/g;
  for (const pattern of [fromOrDynamicImport, sideEffectImport]) {
    for (const match of source.matchAll(pattern)) specifiers.add(match[1]);
  }
  return [...specifiers];
}

function projectTarget(importer: string, specifier: string): string | null {
  if (specifier.startsWith("@/")) return specifier.slice(2);
  if (!specifier.startsWith(".")) return null;
  return path.posix.normalize(path.posix.join(path.posix.dirname(importer), specifier));
}

function importsIn(files: SourceFile[]): Array<{ importer: string; specifier: string; target: string | null }> {
  return files.flatMap((file) =>
    moduleSpecifiers(file.source).map((specifier) => ({
      importer: file.path,
      specifier,
      target: projectTarget(file.path, specifier),
    })),
  );
}

const files = productionSourceFiles();
const imports = importsIn(files);

describe("architecture dependency boundaries", () => {
  it("keeps platform independent from workbench and capability implementations", () => {
    const offenders = imports
      .filter(({ importer }) => importer.startsWith("platform/"))
      .filter(({ target }) =>
        target !== null &&
        (target.startsWith("workbench/") ||
          target.startsWith("capabilities/") ||
          target.startsWith("modules/")),
      )
      .map(({ importer, specifier }) => `${importer} -> ${specifier}`);

    expect(
      offenders,
      `platform is the bottom frontend layer and cannot depend on workbench or ` +
        `feature implementations. Move shared types to domain/lib, or invert the ` +
        `call through a typed platform contract:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("keeps Tauri implementation details out of workbench", () => {
    const offenders = imports
      .filter(({ importer }) => importer.startsWith("workbench/"))
      .filter(
        ({ specifier, target }) =>
          specifier.startsWith("@tauri-apps/") || target === "platform/tauri",
      )
      .map(({ importer, specifier }) => `${importer} -> ${specifier}`);

    expect(
      offenders,
      `workbench owns composition, not native transport. Add or use a typed ` +
        `platform service instead of importing Tauri or platform/tauri here:\n` +
        offenders.join("\n"),
    ).toEqual([]);
  });

  it("confines direct Tauri imports to platform and sanctioned native-object owners", () => {
    // These APIs expose native objects whose lifetime is owned by the caller.
    // Keep this list exact: a directory or package wildcard would turn the
    // ratchet into documentation instead of enforcement.
    const sanctioned = new Map<string, ReadonlySet<string>>([
      [
        "modules/benchmark/lib/useFileDrop.ts",
        new Set(["@tauri-apps/api/webview"]),
      ],
      [
        "modules/terminal/lib/pty-bridge.ts",
        new Set(["@tauri-apps/api/core"]),
      ],
      [
        "modules/window/useQuickTerminal.ts",
        new Set([
          "@tauri-apps/api/webviewWindow",
          "@tauri-apps/plugin-global-shortcut",
        ]),
      ],
      [
        "modules/window/quickTerminal.ts",
        new Set([
          "@tauri-apps/api/dpi",
          "@tauri-apps/api/webviewWindow",
          "@tauri-apps/api/window",
        ]),
      ],
    ]);

    const offenders = imports
      .filter(({ specifier }) => specifier.startsWith("@tauri-apps/"))
      .filter(({ importer, specifier }) => {
        if (importer.startsWith("platform/")) return false;
        return !sanctioned.get(importer)?.has(specifier);
      })
      .map(({ importer, specifier }) => `${importer} -> ${specifier}`);

    expect(
      offenders,
      `raw Tauri access bypasses typed scope, authorization, and lifetime policy. ` +
        `Route the operation through src/platform. If a native object truly must ` +
        `remain caller-owned, document that ownership and add only the exact ` +
        `file/package pair to the sanctioned list:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("keeps raw invoke inside the platform transport", () => {
    const offenders = files
      .filter(({ path }) => !path.startsWith("platform/"))
      .filter(({ source }) => /(^|[^\w.])invoke\s*\(/m.test(source))
      .map(({ path }) => path);

    expect(
      offenders,
      `capabilities must describe typed commands and call a platform IPC ` +
        `service. Raw invoke bypasses command scope and workspace injection; ` +
        `keep it in src/platform/tauri.ts:\n` +
        offenders.join("\n"),
    ).toEqual([]);
  });

  it("keeps preference persistence and propagation under one owner", () => {
    const ownershipMarkers = ["nexis-settings.json", "nexis://prefs-changed"];
    const offenders = files
      .filter(({ path }) => path !== "modules/settings/store.ts")
      .flatMap((file) =>
        ownershipMarkers
          .filter((marker) => file.source.includes(marker))
          .map((marker) => `${file.path} -> ${marker}`),
      );

    expect(
      offenders,
      `the preference schema, durable store, and cross-window propagation event ` +
        `are owned together by modules/settings/store.ts. Extend that owner ` +
        `instead of creating another preference implementation:\n` +
        offenders.join("\n"),
    ).toEqual([]);
  });

  it("keeps workspace environment state and native discovery under one owner", () => {
    const canonical = "platform/workspace-state.ts";
    const declarations = [
      /export\s+type\s+WorkspaceEnv\s*=/,
      /useWorkspaceEnvStore\s*=\s*create\s*</,
      /export\s+function\s+workspaceEnvForPath\s*\(/,
      /export\s+function\s+workspaceScopeKey\s*\(/,
    ];
    const offenders = files
      .filter(({ path }) => path !== canonical)
      .filter(({ source }) => declarations.some((declaration) => declaration.test(source)))
      .map(({ path }) => path);

    const hostCommandOwners = new Map<string, ReadonlySet<string>>([
      ["wsl_list_distros", new Set([canonical])],
      ["wsl_home", new Set([canonical])],
      ["workspace_current_dir", new Set([canonical])],
      [
        "workspace_authorize",
        new Set([canonical, "modules/terminal/lib/pty-bridge.ts"]),
      ],
    ]);
    for (const file of files) {
      for (const [command, owners] of hostCommandOwners) {
        if (file.source.includes(`"${command}"`) && !owners.has(file.path)) {
          offenders.push(`${file.path} -> ${command}`);
        }
      }
    }

    expect(
      offenders,
      `workspace environment state, scope identity, discovery, and authorization ` +
        `must use src/platform/workspace-state.ts. The PTY bridge owns only its ` +
        `captured-environment authorization descriptor; do not grow a second ` +
        `workspace implementation:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
