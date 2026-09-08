// Regenerate the GitHub social-preview PNG (1280×640) from assets/social-card.svg.
//   pnpm gen:social
import { Resvg } from "@resvg/resvg-js";
import { readFileSync, writeFileSync } from "node:fs";

const src = new URL("../assets/social-card.svg", import.meta.url);
const out = new URL("../assets/social-preview.png", import.meta.url);

const png = new Resvg(readFileSync(src, "utf8"), {
  fitTo: { mode: "width", value: 1280 },
  font: { loadSystemFonts: true },
}).render();

writeFileSync(out, png.asPng());
console.log(`wrote assets/social-preview.png (${png.width}x${png.height})`);
