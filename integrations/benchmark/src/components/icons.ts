// All Hugeicons imports funnel through here. A non-existent icon name throws a
// SyntaxError that takes down the whole module graph (see TAURI_DESIGN_TEMPLATE
// §19), so keeping them in one file makes them trivial to grep and fix. Every
// name below is verified against @hugeicons/core-free-icons.
export {
  Alert02Icon,
  Cancel01Icon,
  Clock01Icon,
  Copy01Icon,
  Database02Icon,
  Delete02Icon,
  DocumentCodeIcon,
  Download04Icon,
  FolderOpenIcon,
  Loading03Icon,
  MinusSignIcon,
  Moon02Icon,
  PlayIcon,
  PlusSignIcon,
  SquareIcon,
  StopIcon,
  Sun01Icon,
} from "@hugeicons/core-free-icons";
export { HugeiconsIcon } from "@hugeicons/react";
