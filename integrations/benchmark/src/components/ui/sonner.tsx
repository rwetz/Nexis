import { Toaster as Sonner } from "sonner";
import { useTheme } from "@/modules/theme/ThemeProvider";

export function Toaster() {
  const { resolvedMode } = useTheme();
  return (
    <Sonner
      theme={resolvedMode}
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast:
            "group-[.toaster]:bg-popover/90 group-[.toaster]:border-border group-[.toaster]:backdrop-blur-md group-[.toaster]:text-popover-foreground group-[.toaster]:rounded-xl",
        },
      }}
    />
  );
}
