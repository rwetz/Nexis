// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * One SVG in, the whole app-icon set out.
 *
 * The sizes are not a guess. Each entry below exists because something
 * specific asks for it, and the note says what — a favicon set assembled from
 * folklore ends up with a 64px PNG nothing loads and no 180px one, which is
 * the only file iOS actually reads.
 *
 * Nearly free to build because everything underneath already existed: the
 * raster path renders it, `fs_write_file_bytes` writes it. This module is the
 * list and the manifest.
 */

export type FaviconTarget = {
  /** File name, relative to the chosen output directory. */
  name: string;
  size: number;
  /** Why this one is in the set. Shown in the panel. */
  why: string;
  /** Included in `site.webmanifest`'s icons array. */
  manifest: boolean;
};

export const FAVICON_TARGETS: readonly FaviconTarget[] = [
  {
    name: "favicon-16x16.png",
    size: 16,
    why: "Browser tab, unscaled displays",
    manifest: false,
  },
  {
    name: "favicon-32x32.png",
    size: 32,
    why: "Browser tab, the size most browsers actually pick",
    manifest: false,
  },
  {
    name: "favicon-48x48.png",
    size: 48,
    why: "Windows taskbar and desktop shortcuts",
    manifest: false,
  },
  {
    name: "apple-touch-icon.png",
    size: 180,
    why: "iOS home screen. The only size iOS reads, and it must be opaque",
    manifest: false,
  },
  {
    name: "icon-192.png",
    size: 192,
    why: "Android home screen, via the web manifest",
    manifest: true,
  },
  {
    name: "icon-512.png",
    size: 512,
    why: "Splash screens and store listings, via the web manifest",
    manifest: true,
  },
];

/**
 * iOS composites nothing behind a home-screen icon: a transparent PNG lands on
 * whatever wallpaper is there, and a dark monochrome mark disappears entirely
 * against a dark one. So this one target is always rendered on an opaque
 * background, and the panel says so rather than leaving the user to discover it
 * on a phone.
 */
export function needsOpaqueBackground(target: FaviconTarget): boolean {
  return target.name === "apple-touch-icon.png";
}

export type ManifestOptions = {
  name: string;
  shortName: string;
  themeColor: string;
  backgroundColor: string;
};

/**
 * A `site.webmanifest` naming only the icons this set actually writes.
 *
 * A manifest that lists a file which was never generated is worse than no
 * manifest: the browser fetches it, 404s, and falls back silently — so the
 * icons array is derived from `FAVICON_TARGETS` rather than written by hand.
 */
export function buildManifest(options: ManifestOptions): string {
  return `${JSON.stringify(
    {
      name: options.name,
      short_name: options.shortName,
      icons: FAVICON_TARGETS.filter((t) => t.manifest).map((t) => ({
        src: `/${t.name}`,
        sizes: `${t.size}x${t.size}`,
        type: "image/png",
        purpose: "any maskable",
      })),
      theme_color: options.themeColor,
      background_color: options.backgroundColor,
      display: "standalone",
    },
    null,
    2,
  )}\n`;
}

/**
 * The `<head>` markup that actually points at these files.
 *
 * Included because generating the icons is the easy half — the half people get
 * wrong is the link tags, and a set of PNGs nothing references is a set of
 * PNGs nobody sees.
 */
export function buildHeadSnippet(): string {
  return [
    '<link rel="icon" href="/favicon.svg" type="image/svg+xml">',
    '<link rel="icon" href="/favicon-32x32.png" sizes="32x32" type="image/png">',
    '<link rel="icon" href="/favicon-16x16.png" sizes="16x16" type="image/png">',
    '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
    '<link rel="manifest" href="/site.webmanifest">',
  ].join("\n");
}

/** Every file this set writes, for the panel's plan and its confirmation. */
export function plannedFiles(): string[] {
  return [
    "favicon.svg",
    ...FAVICON_TARGETS.map((t) => t.name),
    "site.webmanifest",
  ];
}
