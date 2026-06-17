// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Shared motion vocabulary. A handful of spring/tween presets so every
 * animation in the app speaks the same language instead of each component
 * inventing its own stiffness/damping. Pair with `<MotionConfig
 * reducedMotion="user">` at the app root (App.tsx) so all of these are
 * automatically disabled for users who prefer reduced motion.
 */
import { useReducedMotion } from "motion/react";
import type { Transition } from "motion/react";

/** Springs — the default vocabulary for layout/position animations. */
export const spring = {
  /** Crisp UI feedback: active indicators, toggles, small moves. */
  snappy: { type: "spring", stiffness: 480, damping: 36 } as const,
  /** General-purpose panel/list motion. */
  smooth: { type: "spring", stiffness: 220, damping: 30 } as const,
  /** Large, soft entrances (panels docking, sheets). */
  gentle: { type: "spring", stiffness: 140, damping: 24 } as const,
} satisfies Record<string, Transition>;

/** Tweens — for opacity/colour fades where a spring would feel wobbly. */
export const tween = {
  fast: { duration: 0.12, ease: "easeOut" } as const,
  base: { duration: 0.2, ease: "easeOut" } as const,
  slow: { duration: 0.34, ease: [0.22, 1, 0.36, 1] } as const,
} satisfies Record<string, Transition>;

export { useReducedMotion };
