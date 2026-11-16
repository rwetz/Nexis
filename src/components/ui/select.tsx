import { Icon } from "@/components/icon";
// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import * as React from "react"
import { Select as SelectPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

// The trigger's size, so the menu's items match it (RULES R5.3): a select in
// a dense panel opens a dense menu, one in a dialog a roomy one. The trigger
// reports it; the content is portalled but still inside this provider.
type SelectSize = "sm" | "default"
const SelectSizeContext = React.createContext<{
  size: SelectSize
  setSize: (s: SelectSize) => void
  /** The trigger, and whether the menu was last driven by a pointer. */
  trigger: React.RefObject<HTMLButtonElement | null>
  byPointer: React.RefObject<boolean>
}>({ size: "default", setSize: () => {}, trigger: { current: null }, byPointer: { current: false } })

function Select({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Root>) {
  const [size, setSize] = React.useState<SelectSize>("default")
  const trigger = React.useRef<HTMLButtonElement | null>(null)
  const byPointer = React.useRef(false)
  const value = React.useMemo(() => ({ size, setSize, trigger, byPointer }), [size])
  return (
    <SelectSizeContext.Provider value={value}>
      <SelectPrimitive.Root data-slot="select" {...props} />
    </SelectSizeContext.Provider>
  )
}

function SelectGroup({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Group>) {
  return (
    <SelectPrimitive.Group
      data-slot="select-group"
      className={cn("scroll-my-1.5 p-1.5", className)}
      {...props}
    />
  )
}

function SelectValue({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />
}

function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger> & {
  size?: SelectSize
}) {
  const { setSize, trigger, byPointer } = React.useContext(SelectSizeContext)
  React.useLayoutEffect(() => setSize(size), [size, setSize])
  return (
    <SelectPrimitive.Trigger
      {...props}
      ref={trigger}
      onPointerDown={(e) => {
        byPointer.current = true
        props.onPointerDown?.(e)
      }}
      onKeyDown={(e) => {
        byPointer.current = false
        props.onKeyDown?.(e)
      }}
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "flex w-fit items-center justify-between gap-1.5 rounded-3xl border border-transparent bg-input/50 px-3 py-2 text-sm whitespace-nowrap transition-[color,box-shadow,background-color] outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-placeholder:text-muted-foreground data-[size=default]:h-9 data-[size=sm]:h-8 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <Icon
          name="unfold"
          size="sm"
          className="pointer-events-none size-4 text-muted-foreground"
        />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({
  className,
  children,
  // Below the trigger, left edges aligned, never over it (RULES R5.1).
  // "item-aligned" centred the list on the current option, so it opened up,
  // down or across the trigger depending on which option was chosen.
  position = "popper",
  align = "start",
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
  const { trigger, byPointer } = React.useContext(SelectSizeContext)
  const [viewport, setViewport] = React.useState<HTMLDivElement | null>(null)
  // The highlight's one state (RULES R14): never shown yet; appearing on an
  // item (no slide, it was hidden); gliding between items; or fading out
  // where it last was. Two booleans for this allowed "jump while hidden".
  const [glide, setGlide] = React.useState<
    | { phase: "appear" | "glide" | "fade"; top: number; height: number }
    | null
  >(null)

  // Radix owns the highlight: it writes `data-highlighted` onto whichever
  // item has roving focus, for pointer and keyboard alike. Observing that
  // attribute is what keeps the rail correct for both without duplicating
  // Radix's own notion of which item is active — there is no callback that
  // reports it.
  // Keyed on the viewport element, which only exists while the menu is
  // open: an effect that ran once on mount found nothing and never tracked
  // a highlight, so the menu had no hover at all.
  React.useEffect(() => {
    if (!viewport) return
    const sync = () => {
      const el = viewport.querySelector<HTMLElement>(
        '[data-slot="select-item"][data-highlighted]',
      )
      // offsetTop is relative to the viewport because it is the nearest
      // positioned ancestor, so this stays correct as the list scrolls.
      // With no highlight it fades where it is. Going back to the top would
      // drag it across the list, and it could be seen resting between items.
      setGlide((prev) =>
        el
          ? {
              phase: prev && prev.phase !== "fade" ? "glide" : "appear",
              top: el.offsetTop,
              height: el.offsetHeight,
            }
          : prev && { ...prev, phase: "fade" },
      )
    }
    const observer = new MutationObserver(sync)
    observer.observe(viewport, {
      attributes: true,
      subtree: true,
      attributeFilter: ["data-highlighted"],
    })
    sync()
    return () => observer.disconnect()
  }, [viewport])

  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        data-align-trigger={position === "item-aligned"}
        className={cn("relative z-50 max-h-(--radix-select-content-available-height) min-w-36 origin-(--radix-select-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-3xl bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/5 duration-100 data-[align-trigger=true]:animate-none data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 dark:ring-foreground/10 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95", position ==="popper"&&"data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1", className )}
        position={position}
        align={align}
        sideOffset={position === "popper" ? sideOffset : undefined}
        {...props}
        // Focus goes back to the trigger on close. After a pointer pick it
        // goes back without the focus ring, which otherwise outlined the
        // trigger in the accent until the next click; after a keyboard pick
        // the ring stays, where it belongs (RULES R15.3).
        onPointerMove={(e) => {
          byPointer.current = true
          props.onPointerMove?.(e)
        }}
        onKeyDown={(e) => {
          if (e.key !== "Escape") byPointer.current = false
          props.onKeyDown?.(e)
        }}
        onCloseAutoFocus={(e) => {
          props.onCloseAutoFocus?.(e)
          if (e.defaultPrevented || !byPointer.current || !trigger.current) return
          e.preventDefault()
          trigger.current.focus({ preventScroll: true, focusVisible: false } as FocusOptions)
        }}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport
          ref={setViewport}
          data-position={position}
          className={cn(
            "relative p-1 data-[position=popper]:h-(--radix-select-trigger-height) data-[position=popper]:w-full data-[position=popper]:min-w-(--radix-select-trigger-width)",
            position === "popper" && ""
          )}
        >
          {/* The glide rail. One element for the whole list, moved between
            * items, rather than each item painting its own background — that
            * is the entire difference between a highlight that jumps and one
            * that travels. Hidden until the first highlight so it does not
            * slide in from the top edge on open. */}
          <div
            aria-hidden
            data-slot="select-glide"
            className={cn(
              "pointer-events-none absolute inset-x-1 top-0 z-0 rounded-2xl bg-muted",
              glide && glide.phase !== "fade" ? "opacity-100" : "opacity-0",
            )}
            style={{
              height: glide?.height ?? 0,
              translate: `0 ${glide?.top ?? 0}px`,
              transitionProperty: glide?.phase === "glide" ? "translate, height, opacity" : "opacity",
              transitionDuration: "var(--dur-panel)",
              transitionTimingFunction: "var(--ease-enter)",
            }}
          />
          {children}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

function SelectLabel({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      data-slot="select-label"
      className={cn("px-3 py-2.5 text-ui text-muted-foreground", className)}
      {...props}
    />
  )
}

function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  const { size } = React.useContext(SelectSizeContext)
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      data-size={size}
      className={cn(
        "relative z-10 flex w-full cursor-default items-center gap-2 rounded-2xl pr-8 pl-3 outline-hidden select-none data-[size=default]:min-h-9 data-[size=default]:text-sm data-[size=sm]:min-h-8 data-[size=sm]:text-ui data-[state=checked]:font-medium focus:text-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        className
      )}
      {...props}
    >
      <span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Icon name="check" size="sm" className="pointer-events-none" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}

function SelectSeparator({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn(
        "pointer-events-none -mx-1.5 my-1.5 h-px bg-border",
        className
      )}
      {...props}
    />
  )
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpButton>) {
  return (
    <SelectPrimitive.ScrollUpButton
      data-slot="select-scroll-up-button"
      className={cn(
        "z-10 flex cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <Icon name="chevron-up" size="sm" />
    </SelectPrimitive.ScrollUpButton>
  )
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownButton>) {
  return (
    <SelectPrimitive.ScrollDownButton
      data-slot="select-scroll-down-button"
      className={cn(
        "z-10 flex cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <Icon name="chevron-down" size="sm" />
    </SelectPrimitive.ScrollDownButton>
  )
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
