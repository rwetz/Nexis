// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { basename } from "@/lib/path";
import { DOCX_LOSS_LABELS, type DocxLoss } from "./lib/docxInspect";

type Props = {
  open: boolean;
  path: string;
  losses: readonly DocxLoss[];
  onOpenChange: (open: boolean) => void;
  onChoose: (mode: "copy" | "overwrite") => void;
};

/**
 * Shown on the first save of an imported .docx that holds something the
 * editor cannot write back. A copy is the default and the focused action,
 * because it is the one choice that cannot lose anything: the original stays
 * exactly as it was, and the tab moves to the copy.
 */
export function SaveDocxDialog({ open, path, losses, onOpenChange, onChoose }: Props) {
  const name = basename(path);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.75">
            <Icon name="alert" size="md" />
            Saving rebuilds {name}
          </DialogTitle>
          <DialogDescription>
            Nexis writes a new file from what the editor shows. It does not edit
            the original in place, so these parts of {name} would not be kept:
          </DialogDescription>
        </DialogHeader>
        <ul className="list-disc space-y-0.5 pl-5 text-sm">
          {losses.map((loss) => (
            <li key={loss}>{DOCX_LOSS_LABELS[loss]}</li>
          ))}
        </ul>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="destructive" onClick={() => onChoose("overwrite")}>
            Overwrite and lose these
          </Button>
          <Button variant="brand" autoFocus onClick={() => onChoose("copy")}>
            <Icon name="file-add" size="sm" />
            Save as a copy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
