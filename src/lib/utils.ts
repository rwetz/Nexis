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
