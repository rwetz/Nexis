// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * The single choke point for every UI icon in Nexis.
 *
 * Call sites name an icon *semantically* (`"close"`, `"refresh"`) rather than
 * naming a vendor's export (`Cancel01Icon`, `X`). Two things fall out of that,
 * and both are the reason this module exists:
 *
 * 1. **The icon vendor is an implementation detail.** Swapping Phosphor for
 *    something else is an edit to `REGISTRY` below, not a sweep over 100+
 *    files. The previous direct-import arrangement made the vendor part of the
 *    plugin API's public contract — `PanelContribution.icon` was typed as a
 *    Hugeicons object, so a plugin could not contribute a panel without
 *    depending on the same icon package Nexis happened to use that week.
 *
 * 2. **One concept renders as one glyph.** The direct-import era accumulated
 *    three different "refresh" icons, three "checkmark", four "edit", four
 *    "terminal", and two each for delete/copy/globe/database/layers/clock —
 *    160 imports expressing 136 ideas. A semantic key makes that collision
 *    impossible to reintroduce: there is one `"refresh"`, and it is one glyph.
 *
 * Enforced by `pitfall 18` in `src/lib/pitfall-guards.test.ts`, which fails the
 * build if any module outside this file imports the icon vendor directly.
 *
 * ## Size
 * Use the named scale. Before it existed, call sites picked from **13**
 * different pixel sizes (9–28) and **12** different stroke weights, which is
 * what made the UI read as assembled rather than designed. A raw number is
 * still accepted for the rare genuinely-bespoke case, but reach for `size`
 * first — if a new size is truly needed, add it to the scale.
 *
 * ## Weight
 * Phosphor ships six weights from one package, and Nexis uses that as a state
 * axis rather than decoration: `regular` is the resting state and `fill` marks
 * active/selected. Prefer `active` over passing `weight` by hand — it keeps the
 * idle→active pair consistent everywhere.
 */

import type { Icon as PhosphorIcon, IconWeight } from "@phosphor-icons/react";
import {
  AppleLogoIcon,
  ArchiveIcon,
  ArrowBendRightUpIcon,
  ArrowLineDownRightIcon,
  ArrowLineUpRightIcon,
  ArrowSquareOutIcon,
  ArrowUUpLeftIcon,
  ArrowUpRightIcon,
  ArrowsClockwiseIcon,
  ArrowsInIcon,
  ArrowsLeftRightIcon,
  ArrowsOutIcon,
  BellIcon,
  BookmarkSimpleIcon,
  BookmarksIcon,
  BracketsCurlyIcon,
  BracketsSquareIcon,
  BrainIcon,
  BugIcon,
  CaretDownIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CaretUpIcon,
  CaretUpDownIcon,
  ChatCircleIcon,
  ChatCircleDotsIcon,
  ChatsCircleIcon,
  CheckIcon,
  CheckCircleIcon,
  CheckSquareIcon,
  CircleNotchIcon,
  ClockIcon,
  CloudArrowDownIcon,
  CodeIcon,
  CodeBlockIcon,
  CompassIcon,
  CopyIcon,
  CpuIcon,
  DatabaseIcon,
  DesktopIcon,
  DetectiveIcon,
  DeviceMobileIcon,
  DotsThreeIcon,
  DotsThreeCircleIcon,
  DownloadSimpleIcon,
  EyeIcon,
  EyeSlashIcon,
  FileIcon,
  FileCodeIcon,
  FileMagnifyingGlassIcon,
  FilePlusIcon,
  FolderIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  FolderSimpleDashedIcon,
  FunctionIcon,
  FunnelIcon,
  GearIcon,
  GitBranchIcon,
  GitDiffIcon,
  GitPullRequestIcon,
  GithubLogoIcon,
  GlobeIcon,
  GlobeHemisphereWestIcon,
  GridFourIcon,
  HardDrivesIcon,
  HashIcon,
  HouseIcon,
  ImageIcon,
  InfoIcon,
  KeyIcon,
  KeyboardIcon,
  LightningIcon,
  ListBulletsIcon,
  ListChecksIcon,
  ListPlusIcon,
  MagicWandIcon,
  MagnifyingGlassIcon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
  MinusIcon,
  MinusSquareIcon,
  MoonIcon,
  NetworkIcon,
  NoteIcon,
  NotePencilIcon,
  OpenAiLogoIcon,
  PaintBrushIcon,
  PaletteIcon,
  PauseIcon,
  PencilSimpleIcon,
  PlayIcon,
  PlugIcon,
  PlusIcon,
  PlusSquareIcon,
  PulseIcon,
  PushPinIcon,
  QueueIcon,
  RobotIcon,
  RocketLaunchIcon,
  ScanIcon,
  ShieldCheckIcon,
  ShippingContainerIcon,
  SidebarIcon,
  SidebarSimpleIcon,
  SparkleIcon,
  SquareIcon,
  SquareSplitHorizontalIcon,
  SquareSplitVerticalIcon,
  StackIcon,
  StopIcon,
  SunIcon,
  TagIcon,
  TerminalIcon,
  TestTubeIcon,
  TextAaIcon,
  TextAlignLeftIcon,
  ToolboxIcon,
  TrashIcon,
  TreeStructureIcon,
  UsersIcon,
  WarningIcon,
  WarningCircleIcon,
  WifiHighIcon,
  WrenchIcon,
  XIcon,
  XLogoIcon,
} from "@phosphor-icons/react";

import type { ArtProps } from "@/components/icon-art";
import {
  PresetArt,
  PresetBareBones,
  PresetEverything,
  PresetMobile,
  PresetStandard,
  PresetWebDev,
} from "@/components/icon-art";

/**
 * A registry entry is either a vendor glyph or a piece of Nexis-drawn art.
 *
 * The registry used to be `Record<string, PhosphorIcon>`, which quietly made
 * "an icon" and "a vendor export" the same thing and left no room for a mark
 * drawn for this app. The first-run preset cards are the case that needed it:
 * they are chosen once, at card scale, and a general-purpose glyph says nothing
 * about the choice. Widening here rather than dropping a one-off inline `<svg>`
 * at the call site keeps the choke point intact — art is still reached as
 * `<Icon name="..." />`, still sized from the scale, still weight-aware.
 */
type IconGlyph = PhosphorIcon | ((props: ArtProps) => React.ReactElement);

/**
 * The house size scale. `sm` is the default and covers dense chrome (tree
 * rows, status bar, inline buttons); `md` is for panel headers and toolbars;
 * `lg`/`xl` are for empty states and hero affordances.
 */
export const ICON_SIZE = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 24,
} as const;

export type IconSize = keyof typeof ICON_SIZE;

/**
 * Semantic name → glyph. Keys are stable app vocabulary; values are vendor
 * detail and may be re-pointed freely. Keep this sorted and keep one key per
 * concept — adding a second key that renders the same idea is the drift this
 * module exists to prevent.
 */
const REGISTRY = {
  "activity": PulseIcon,
  "add": PlusIcon,
  "add-box": PlusSquareIcon,
  "agent": RobotIcon,
  "ai-chat": ChatCircleDotsIcon,
  "ai-generate": MagicWandIcon,
  "ai-scan": ScanIcon,
  "alert": WarningIcon,
  "alert-circle": WarningCircleIcon,
  "architect": CompassIcon,
  "archive": ArchiveIcon,
  "bookmark-add": BookmarkSimpleIcon,
  "bookmark-remove": BookmarksIcon,
  "brain": BrainIcon,
  "brand-apple": AppleLogoIcon,
  "brand-github": GithubLogoIcon,
  "brand-openai": OpenAiLogoIcon,
  "brand-python": CodeIcon,
  "brand-xai": XLogoIcon,
  "brush": PaintBrushIcon,
  "chat": ChatCircleIcon,
  "chat-ai": ChatCircleDotsIcon,
  "check": CheckIcon,
  "check-box": CheckSquareIcon,
  "checklist": ListChecksIcon,
  "chevron-down": CaretDownIcon,
  "chevron-left": CaretLeftIcon,
  "chevron-right": CaretRightIcon,
  "chevron-up": CaretUpIcon,
  "clock": ClockIcon,
  "close": XIcon,
  "code": CodeIcon,
  "code-box": CodeBlockIcon,
  "collapse": ArrowsInIcon,
  "computer": DesktopIcon,
  "container": ShippingContainerIcon,
  "copy": CopyIcon,
  "cpu": CpuIcon,
  "database": DatabaseIcon,
  "debug": BugIcon,
  "debug-step-into": ArrowLineDownRightIcon,
  "debug-step-out": ArrowLineUpRightIcon,
  "debug-step-over": ArrowBendRightUpIcon,
  "delete": TrashIcon,
  "device-mobile": DeviceMobileIcon,
  "disk": HardDrivesIcon,
  "download": DownloadSimpleIcon,
  "edit": PencilSimpleIcon,
  "expand": ArrowsOutIcon,
  "explorer": TreeStructureIcon,
  "external": ArrowUpRightIcon,
  "file": FileIcon,
  "file-add": FilePlusIcon,
  "file-code": FileCodeIcon,
  "file-edit": NotePencilIcon,
  "filter": FunnelIcon,
  "flash": LightningIcon,
  "folder": FolderIcon,
  "folder-add": FolderPlusIcon,
  "folder-git": FolderSimpleDashedIcon,
  "folder-open": FolderOpenIcon,
  "folder-remote": CloudArrowDownIcon,
  "git-branch": GitBranchIcon,
  "git-compare": GitDiffIcon,
  "git-pr": GitPullRequestIcon,
  "globe": GlobeIcon,
  "grid": GridFourIcon,
  "hash": HashIcon,
  "hidden": EyeSlashIcon,
  "home": HouseIcon,
  "image": ImageIcon,
  "incognito": DetectiveIcon,
  "info": InfoIcon,
  "key": KeyIcon,
  "keyboard": KeyboardIcon,
  "layers": StackIcon,
  "layout-left": SidebarSimpleIcon,
  "link-external": ArrowSquareOutIcon,
  "loading": CircleNotchIcon,
  "magic": MagicWandIcon,
  "messages": ChatsCircleIcon,
  "minus": MinusIcon,
  "more": DotsThreeIcon,
  "more-circle": DotsThreeCircleIcon,
  "network": NetworkIcon,
  "network-connected": WifiHighIcon,
  "note": NoteIcon,
  "notification": BellIcon,
  "outline": ListBulletsIcon,
  "pause": PauseIcon,
  "pin": PushPinIcon,
  "play": PlayIcon,
  "plugin": PlugIcon,
  "preset-art": PresetArt,
  "preset-bare-bones": PresetBareBones,
  "preset-everything": PresetEverything,
  "preset-mobile": PresetMobile,
  "preset-standard": PresetStandard,
  "preset-web-dev": PresetWebDev,
  "queue": QueueIcon,
  "refresh": ArrowsClockwiseIcon,
  "remove-box": MinusSquareIcon,
  "replace": ArrowsLeftRightIcon,
  "revert": ArrowUUpLeftIcon,
  "rocket": RocketLaunchIcon,
  "search": MagnifyingGlassIcon,
  "search-code": FileMagnifyingGlassIcon,
  "search-global": GlobeHemisphereWestIcon,
  "security": ShieldCheckIcon,
  "server": HardDrivesIcon,
  "server-alt": StackIcon,
  "settings": GearIcon,
  "sidebar-left": SidebarIcon,
  "sidebar-right": SidebarSimpleIcon,
  "source": FileCodeIcon,
  "sparkle": SparkleIcon,
  "split-horizontal": SquareSplitVerticalIcon,
  "split-vertical": SquareSplitHorizontalIcon,
  "square": SquareIcon,
  "stop": StopIcon,
  "success": CheckCircleIcon,
  "symbol-class": BracketsCurlyIcon,
  "symbol-function": FunctionIcon,
  "symbol-type": TextAaIcon,
  "tag": TagIcon,
  "tasks": ListPlusIcon,
  "terminal": TerminalIcon,
  "test": TestTubeIcon,
  "text": TextAlignLeftIcon,
  "theme": PaletteIcon,
  "theme-dark": MoonIcon,
  "theme-light": SunIcon,
  "tools": ToolboxIcon,
  "unfold": CaretUpDownIcon,
  "users": UsersIcon,
  "variable": BracketsSquareIcon,
  "visible": EyeIcon,
  "wrench": WrenchIcon,
  "zoom-in": MagnifyingGlassPlusIcon,
  "zoom-out": MagnifyingGlassMinusIcon,
} as const satisfies Record<string, IconGlyph>;

export type IconName = keyof typeof REGISTRY;

export type IconProps = Omit<
  React.SVGProps<SVGSVGElement>,
  "ref" | "name" | "weight"
> & {
  /** Semantic icon name. See {@link REGISTRY}. */
  name: IconName;
  /** Named step from {@link ICON_SIZE}, or a raw pixel value if unavoidable. */
  size?: IconSize | number;
  /** Marks the resting→active transition. Prefer this over `weight`. */
  active?: boolean;
  /** Escape hatch for the remaining Phosphor weights. */
  weight?: IconWeight;
};

export function Icon({
  name,
  size = "sm",
  active = false,
  weight,
  ...rest
}: IconProps) {
  const Glyph = REGISTRY[name];
  const px = typeof size === "number" ? size : ICON_SIZE[size];
  // An icon is decorative unless the call site gave it a name of its own.
  // Icon-only buttons label the *button*, so announcing the glyph too would
  // read the action twice.
  const labelled =
    rest["aria-label"] !== undefined ||
    rest["aria-labelledby"] !== undefined ||
    rest.role !== undefined;
  return (
    <Glyph
      size={px}
      weight={weight ?? (active ? "fill" : "regular")}
      aria-hidden={labelled ? undefined : true}
      focusable={false}
      {...rest}
    />
  );
}
