// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";

function Spinner({ className, ...props }: Omit<React.ComponentProps<"svg">, "name">) {
  return (
    <Icon
      name="loading"
      size="sm"
      role="status"
      aria-label="Loading"
      className={cn("size-4 nexis-spin", className)}
      {...props}
    />
  );
}

export { Spinner };
