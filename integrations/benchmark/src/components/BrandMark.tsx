/** Nexis Benchmark logomark — three rising bars inside a rounded square,
 *  echoing a benchmark chart. Uses the brand token so it tints with the theme. */
export function BrandMark({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className="shrink-0"
    >
      <rect
        x="1.5"
        y="1.5"
        width="21"
        height="21"
        rx="6"
        className="fill-brand/12 stroke-brand/40"
        strokeWidth="1.2"
      />
      <rect x="6" y="13" width="3" height="5" rx="1" className="fill-brand/60" />
      <rect x="10.5" y="9" width="3" height="9" rx="1" className="fill-brand/80" />
      <rect x="15" y="6" width="3" height="12" rx="1" className="fill-brand" />
    </svg>
  );
}
