// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Extract the folder icons from @iconify-json/vscode-icons into a slim JSON
 * the explorer can lazy-load as a fallback set (the full icons.json is
 * ~3.6 MB; folders alone are a fraction of that).
 *
 * Run after bumping the @iconify-json/vscode-icons dependency:
 *   pnpm icons:folders
 *
 * Output: src/modules/explorer/lib/vscodeFolderIcons.json (committed).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = JSON.parse(
  readFileSync(
    join(root, "node_modules/@iconify-json/vscode-icons/icons.json"),
    "utf8",
  ),
);

const keep = (name) =>
  // Skip the light-theme variants (Nexis explorer themes are dark) and the
  // "-opened" variants — the fallback reuses the closed art for expanded
  // folders, which halves the chunk this JSON becomes.
  (name.startsWith("folder-type-") &&
    !name.startsWith("folder-type-light-") &&
    !name.endsWith("-opened")) ||
  name === "default-folder";

const icons = {};
for (const [name, icon] of Object.entries(source.icons)) {
  if (keep(name)) icons[name] = { body: icon.body };
}

const out = {
  width: source.width ?? 32,
  height: source.height ?? 32,
  icons,
};

const target = join(root, "src/modules/explorer/lib/vscodeFolderIcons.json");
writeFileSync(target, JSON.stringify(out));
console.log(
  `wrote ${Object.keys(icons).length} folder icons to ${target} (${(JSON.stringify(out).length / 1024).toFixed(0)} KB)`,
);
