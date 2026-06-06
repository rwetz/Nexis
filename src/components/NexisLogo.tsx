// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { cn } from "@/lib/utils";

export function NexisLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("size-12", className)}
      aria-label="Nexis"
    >
      <rect width="48" height="48" rx="12" fill="currentColor" className="text-foreground" />
      {/* Terminal prompt cursor — left bar */}
      <rect x="10" y="10" width="4" height="28" rx="2" fill="white" />
      {/* Diagonal slash — N shape */}
      <path
        d="M14 10 L34 38"
        stroke="white"
        strokeWidth="4"
        strokeLinecap="round"
      />
      {/* Right bar */}
      <rect x="34" y="10" width="4" height="28" rx="2" fill="white" />
    </svg>
  );
}
