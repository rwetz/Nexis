// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import * as ResizablePrimitive from "react-resizable-panels"
import { useRef } from "react"

import { cn } from "@/lib/utils"

function ResizablePanelGroup({
  className,
  ...props
}: ResizablePrimitive.GroupProps) {
  return (
    <ResizablePrimitive.Group
      data-slot="resizable-panel-group"
      // While a handle is hovered/dragged the library injects a global
      // `*, *:hover { cursor: <resize> !important }` stylesheet. WebKitGTK is
      // slow to re-evaluate the cursor when that rule toggles (and a dropped
      // pointer event leaves it applied outright), so the resize cursor bled
      // over neighboring UI — e.g. the file explorer next to the sidebar
      // handle. Disable it; the handle carries its own cursor via CSS on
      // [data-slot="resizable-handle"] in globals.css.
      disableCursor
      className={cn(
        "flex h-full w-full aria-[orientation=vertical]:flex-col",
        className
      )}
      {...props}
    />
  )
}

function ResizablePanel({ ...props }: ResizablePrimitive.PanelProps) {
  return <ResizablePrimitive.Panel data-slot="resizable-panel" {...props} />
}

function ResizableHandle({
  withHandle,
  className,
  onPointerDown,
  onPointerUp,
  ...props
}: ResizablePrimitive.SeparatorProps & {
  withHandle?: boolean
}) {
  // The separator is a focusable element (it has to be — arrow keys resize),
  // and the library focuses it on pointerdown. Nothing gives that focus back
  // afterwards, so a mouse drag left the handle as document.activeElement
  // indefinitely: `data-separator="focus"` stuck on, and any :focus styling
  // stuck on with it. The handle read as highlighted until you clicked
  // something else, which is not what a drag should leave behind.
  //
  // Blurring only after a *pointer* interaction keeps the keyboard path
  // intact: tabbing to the handle and resizing with the arrows still focuses
  // it and still shows the ring.
  const draggedWithPointer = useRef(false)

  return (
    <ResizablePrimitive.Separator
      data-slot="resizable-handle"
      onPointerDown={(e) => {
        draggedWithPointer.current = true
        onPointerDown?.(e)
      }}
      onPointerUp={(e) => {
        onPointerUp?.(e)
        if (draggedWithPointer.current) {
          draggedWithPointer.current = false
          e.currentTarget.blur()
        }
      }}
      className={cn(
        "relative flex w-px items-center justify-center bg-border ring-offset-background after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-hidden aria-[orientation=horizontal]:h-px aria-[orientation=horizontal]:w-full aria-[orientation=horizontal]:after:left-0 aria-[orientation=horizontal]:after:h-1 aria-[orientation=horizontal]:after:w-full aria-[orientation=horizontal]:after:translate-x-0 aria-[orientation=horizontal]:after:-translate-y-1/2 [&[aria-orientation=horizontal]>div]:rotate-90",
        className
      )}
      {...props}
    >
      {withHandle && (
        <div className="z-10 flex h-6 w-1 shrink-0 rounded-lg bg-border" />
      )}
    </ResizablePrimitive.Separator>
  )
}

export { ResizableHandle, ResizablePanel, ResizablePanelGroup }
