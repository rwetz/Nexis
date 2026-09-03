// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Bespoke Nexis art that sits in the icon REGISTRY beside the vendor glyphs.
 *
 * Why this exists: the first-run preset cards are the one surface where a
 * generic glyph actively fails. A preset is not an action — it is a claim
 * about what the user is building, shown once, at card scale, next to five
 * alternatives. Reaching into a general-purpose icon set for that gives six
 * marks that were drawn to read at 16px in a toolbar and that say nothing
 * about the choice; it is exactly the "assembled, not designed" failure
 * pitfall #18 is about.
 *
 * These are drawn for this job instead, as one family: a 24-unit box, the same
 * geometry and stroke rhythm as the Phosphor set they sit beside, `currentColor`
 * throughout so they theme like everything else, and `weight` honoured so the
 * resting→active pair still works.
 *
 * This module deliberately does NOT import the icon vendor — it is art, not a
 * mapping — so it stays clear of the pitfall #18 guard, which reserves that
 * import for `icon.tsx`. Everything here is reached the same way as any other
 * icon: `<Icon name="preset-web-dev" />`.
 */

/**
 * Structurally identical to the vendor's own weight union, restated rather
 * than imported: importing it here would name the vendor outside `icon.tsx`
 * and trip the pitfall #18 guard, for a type that has been stable for years.
 */
export type IconWeight =
  | "thin"
  | "light"
  | "regular"
  | "bold"
  | "fill"
  | "duotone";

export type ArtProps = {
  size?: number;
  weight?: IconWeight;
} & Omit<React.SVGProps<SVGSVGElement>, "ref">;

/**
 * Phosphor's regular weight is a 16-unit stroke on a 256 box (1.5 at 24), and
 * its bolder weights step up from there. Matching that keeps a custom mark
 * from reading lighter or heavier than the glyph next to it.
 */
function strokeFor(weight: IconWeight | undefined): number {
  switch (weight) {
    case "thin":
      return 0.75;
    case "light":
      return 1.125;
    case "bold":
      return 2.25;
    case "fill":
    case "duotone":
      return 2;
    default:
      return 1.5;
  }
}

/** Shared frame so every mark lands on the same grid and optical weight. */
function Art({
  size = 16,
  weight,
  children,
  ...rest
}: ArtProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeFor(weight)}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      {children}
    </svg>
  );
}

/** Bare-Bones: an empty frame and a prompt. Nothing else is switched on. */
export function PresetBareBones(props: ArtProps) {
  return (
    <Art {...props}>
      <rect x="2.5" y="4" width="19" height="16" rx="3" />
      <path d="M7 11.5 L9.5 14 L7 16.5" />
      <path d="M12.5 16.5 H17" />
    </Art>
  );
}

/** Standard: the frame plus a rail and a divided working area. */
export function PresetStandard(props: ArtProps) {
  return (
    <Art {...props}>
      <rect x="2.5" y="4" width="19" height="16" rx="3" />
      <path d="M8.5 4 V20" />
      <path d="M5 8.5 H6" />
      <path d="M5 12 H6" />
      <path d="M5 15.5 H6" />
      <path d="M8.5 14 H21.5" />
    </Art>
  );
}

/** Web Dev: one source, three viewports — the multi-viewport preview idea. */
export function PresetWebDev(props: ArtProps) {
  return (
    <Art {...props}>
      <rect x="2" y="5" width="11" height="14" rx="2.5" />
      <path d="M2 8.5 H13" />
      <rect x="16" y="5" width="6" height="6" rx="1.5" />
      <rect x="16" y="13" width="6" height="6" rx="1.5" />
    </Art>
  );
}

/** Mobile: a device and the log stream coming back off it. */
export function PresetMobile(props: ArtProps) {
  return (
    <Art {...props}>
      <rect x="6" y="2.5" width="12" height="19" rx="3" />
      <path d="M10.5 5.5 H13.5" />
      <path d="M9.5 18.5 H14.5" />
      <path d="M2.5 10 H4.5" />
      <path d="M2.5 13.5 H4" />
      <path d="M19.5 10 H21.5" />
      <path d="M20 13.5 H21.5" />
    </Art>
  );
}

/** Art: a bezier with its control handles — authoring a curve, not viewing one. */
export function PresetArt(props: ArtProps) {
  return (
    <Art {...props}>
      <path d="M3.5 18.5 C3.5 9.5 20.5 14.5 20.5 5.5" />
      <circle cx="3.5" cy="18.5" r="2" />
      <circle cx="20.5" cy="5.5" r="2" />
      <path d="M8.5 6.5 H15.5" strokeDasharray="1 3" />
      <circle cx="8.5" cy="6.5" r="1.25" />
    </Art>
  );
}

/** Everything: the full grid, every cell claimed. */
export function PresetEverything(props: ArtProps) {
  return (
    <Art {...props}>
      <rect x="3" y="3" width="7.5" height="7.5" rx="2" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="2" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="2" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" />
      <path d="M16 17.25 H18.5" />
      <path d="M17.25 16 V18.5" />
    </Art>
  );
}
