/** Heptagram ({7/2} star) inside a double ring — a decorative brand motif,
 *  echoing the Nexis ascii-art mark. Pure line art on `currentColor`, so it
 *  tints with the theme; set color + opacity from the parent. */
export function Heptagram({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 500 500"
      fill="none"
      stroke="currentColor"
      aria-hidden
      className={className}
    >
      <circle cx="250" cy="250" r="244" strokeWidth="4" />
      <circle cx="250" cy="250" r="231" strokeWidth="4" />
      {/* {7/2} star: vertices stepped by two around the circle, one stroke. */}
      <path
        d="M250 50 L445 294.5 L163.22 430.19 L93.63 125.3 L406.37 125.3 L336.78 430.19 L55.01 294.5 Z"
        strokeWidth="5"
        strokeLinejoin="miter"
        strokeMiterlimit="8"
      />
    </svg>
  );
}
