// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// The type scale's steps (--text-* in globals.css). Without this,
// tailwind-merge reads `text-caption` as a colour and drops it whenever a
// later `text-muted-foreground` lands in the same cn() call.
const twMerge = extendTailwindMerge({
  extend: { theme: { text: ["micro", "caption", "ui", "body"] } },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Open focus lands on the surface itself, not its first control (nexis-design
 * RULES R5.4): focusing the first control popped its tooltip over the surface
 * the moment it opened. Keyboard users are one Tab from the first control, and
 * a caller's own handler still runs first and can take over.
 */
export function focusSurfaceOnOpen(handler?: (e: Event) => void) {
  return (e: Event) => {
    handler?.(e)
    if (e.defaultPrevented) return
    e.preventDefault()
    ;(e.currentTarget as HTMLElement | null)?.focus({ preventScroll: true })
  }
}
