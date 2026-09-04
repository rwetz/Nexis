// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icon";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { basename } from "@/lib/path";
import { formatBytes } from "@/lib/format";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  setCommandLedgerEnabled,
  setCommandLedgerMaxAgeDays,
  setCommandLedgerMaxOutputMb,
  setCommandLedgerMaxRecords,
} from "@/modules/settings/store";
import {
  currentLedgerWorkspaceRoot,
  forgetLedgerSince,
  forgetLedgerWorkspace,
  ledgerStats,
  type LedgerStats,
} from "@/modules/terminal/lib/ledger";
import {
  formatMaxAgeDays,
  formatMaxOutputMb,
  formatMaxRecords,
  LEDGER_MAX_AGE_DAYS_PRESETS,
  LEDGER_MAX_OUTPUT_MB_PRESETS,
  LEDGER_MAX_RECORDS_PRESETS,
  coerceLedgerMaxAgeDays,
  coerceLedgerMaxOutputMb,
  coerceLedgerMaxRecords,
} from "@/modules/terminal/lib/ledgerRetention";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { SectionHeader } from "../components/SectionHeader";
import { SettingRow } from "../components/SettingRow";

/**
 * The command ledger's privacy and retention surface.
 *
 * This section is the other half of the store that `ledger.rs` writes, and it
 * exists before any panel that *reads* the ledger on purpose: recording
 * durable command lines with no way to see what is held or to delete it is a
 * defect, not an unfinished feature. §5 of
 * `docs/vault/decisions/command-ledger.md` names the four forget gestures, and
 * three of them live here — per-entry is the block gutter's, and belongs with
 * the panel that shows entries.
 *
 * The window buttons deliberately do not confirm. The whole point of "forget
 * the last N minutes" is that it is the escape hatch for a redaction miss: a
 * key just went to disk and the user wants it gone *now*. A confirmation step
 * on that gesture buys nothing — deleting your own recent history is not a
 * loss anyone regrets — and costs the seconds that make it feel like a
 * remedy. Forgetting the whole workspace does confirm, because that one is
 * months of history rather than minutes.
 */

/** The three windows offered for a time-scoped forget. */
const FORGET_WINDOWS = [
  { label: "Last 15 minutes", ms: 15 * 60 * 1000 },
  { label: "Last hour", ms: 60 * 60 * 1000 },
  { label: "Last 24 hours", ms: 24 * 60 * 60 * 1000 },
] as const;

function formatSpan(stats: LedgerStats): string {
  if (stats.records === 0) return "Nothing recorded yet";
  if (stats.oldestMs === null) return `${stats.records.toLocaleString()} commands`;
  const days = Math.max(
    0,
    Math.round((Date.now() - stats.oldestMs) / (24 * 60 * 60 * 1000)),
  );
  const age =
    days === 0 ? "today" : days === 1 ? "since yesterday" : `over ${days} days`;
  return `${stats.records.toLocaleString()} commands ${age}`;
}

export function PrivacySection() {
  const enabled = usePreferencesStore((s) => s.commandLedgerEnabled);
  const maxRecords = usePreferencesStore((s) => s.commandLedgerMaxRecords);
  const maxAgeDays = usePreferencesStore((s) => s.commandLedgerMaxAgeDays);
  const maxOutputMb = usePreferencesStore((s) => s.commandLedgerMaxOutputMb);

  // Read once on mount rather than tracked in state: the settings dialog lives
  // in the main window, and the workspace cannot change underneath an open
  // dialog without closing it.
  const [root] = useState(() => currentLedgerWorkspaceRoot());
  const [stats, setStats] = useState<LedgerStats | null>(null);
  const [confirmForgetAll, setConfirmForgetAll] = useState(false);

  const refresh = useCallback(() => {
    void ledgerStats(root).then(setStats);
  }, [root]);

  useEffect(refresh, [refresh]);

  const onForgetSince = async (label: string, windowMs: number) => {
    try {
      const count = await forgetLedgerSince(root, Date.now() - windowMs);
      // Report the count. A forget gesture that says nothing is
      // indistinguishable from one that silently failed.
      toast.success(
        count === 0
          ? `Nothing recorded in the ${label.toLowerCase()}`
          : `Forgot ${count.toLocaleString()} command${count === 1 ? "" : "s"}`,
      );
      refresh();
    } catch (e) {
      toast.error("Could not forget those commands", {
        description: String(e),
      });
    }
  };

  const onForgetWorkspace = async () => {
    try {
      await forgetLedgerWorkspace(root);
      toast.success("Forgot this workspace's command history");
      refresh();
    } catch (e) {
      toast.error("Could not forget this workspace", {
        description: String(e),
      });
    }
  };

  const workspaceLabel = root ? basename(root) || root : null;

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title="Privacy"
        description="Nexis has no accounts and sends no telemetry. The one thing it records locally is the command ledger, and this page is where you see it, cap it, and delete it."
      />

      <SettingRow
        title="Record commands"
        description="Keeps a local history of finished commands — the command line, cwd, exit code, duration and output — per workspace, under ~/.cache/nexis. Nothing leaves your machine. Private terminals are never recorded regardless of this setting, and API keys and tokens are stripped before anything is written."
      >
        <Switch
          checked={enabled}
          onCheckedChange={(v) => void setCommandLedgerEnabled(v)}
        />
      </SettingRow>

      {/* Retention. Two independent caps, because output dominates the
          footprint and is the least valuable per byte — losing old output
          while keeping timings and exit codes is the right trade, and one
          shared cap could not express it. */}
      <div className="flex flex-col gap-0.5 pt-1">
        <span className="text-[12.5px] font-medium">Retention</span>
        <span className="text-[10.5px] leading-relaxed text-muted-foreground">
          Applied when a workspace is opened. Command details and captured
          output are capped separately, and output is evicted first.
        </span>
      </div>

      <SettingRow
        title="Keep command details for"
        description="Whichever of this and the count below runs out first."
      >
        <Select
          value={String(maxAgeDays)}
          onValueChange={(v) =>
            void setCommandLedgerMaxAgeDays(coerceLedgerMaxAgeDays(Number(v)))
          }
        >
          <SelectTrigger size="sm" className="h-8 w-36 text-[12px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LEDGER_MAX_AGE_DAYS_PRESETS.map((days) => (
              <SelectItem key={days} value={String(days)} className="text-[12px]">
                {formatMaxAgeDays(days)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingRow>

      <SettingRow
        title="Maximum commands kept"
        description="Each one is roughly 200 bytes of metadata."
      >
        <Select
          value={String(maxRecords)}
          onValueChange={(v) =>
            void setCommandLedgerMaxRecords(coerceLedgerMaxRecords(Number(v)))
          }
        >
          <SelectTrigger size="sm" className="h-8 w-36 text-[12px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LEDGER_MAX_RECORDS_PRESETS.map((n) => (
              <SelectItem key={n} value={String(n)} className="text-[12px]">
                {formatMaxRecords(n)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingRow>

      <SettingRow
        title="Captured output per workspace"
        description="Terminal output is stored separately and evicted oldest-first when this is exceeded."
      >
        <Select
          value={String(maxOutputMb)}
          onValueChange={(v) =>
            void setCommandLedgerMaxOutputMb(coerceLedgerMaxOutputMb(Number(v)))
          }
        >
          <SelectTrigger size="sm" className="h-8 w-36 text-[12px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LEDGER_MAX_OUTPUT_MB_PRESETS.map((mb) => (
              <SelectItem key={mb} value={String(mb)} className="text-[12px]">
                {formatMaxOutputMb(mb)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingRow>

      {/* What is actually on disk, and the gestures that remove it. Stats come
          first: "forget everything" with no indication of what is there is a
          button nobody can evaluate before pressing. */}
      <div className="flex flex-col gap-0.5 pt-1">
        <span className="text-[12.5px] font-medium">Recorded history</span>
        <span className="text-[10.5px] leading-relaxed text-muted-foreground">
          {workspaceLabel
            ? `For the open workspace, ${workspaceLabel}. Each workspace keeps its own ledger.`
            : "No workspace is open, so there is no ledger to show. Open a folder to manage its history."}
        </span>
      </div>

      <div className="flex flex-col gap-2.5 rounded-lg border border-border/60 bg-card/60 px-3 py-2.5">
        <div className="flex items-center gap-4">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[12.5px] font-medium">
              {stats ? formatSpan(stats) : "Reading…"}
            </span>
            <span className="text-[10.5px] leading-relaxed text-muted-foreground">
              {stats
                ? `${formatBytes(stats.logBytes)} of command details, ${formatBytes(stats.blobBytes)} of captured output across ${stats.blobCount.toLocaleString()} file${stats.blobCount === 1 ? "" : "s"}.`
                : "Counting what is on disk."}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-8 shrink-0 text-[12px]"
            onClick={refresh}
            disabled={!root}
          >
            <Icon name="refresh" size="sm" />
            Refresh
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 border-t border-border/50 pt-2.5">
          <span className="mr-1 text-[11px] text-muted-foreground">Forget</span>
          {FORGET_WINDOWS.map((w) => (
            <Button
              key={w.label}
              variant="outline"
              size="sm"
              className="h-7 text-[11.5px]"
              disabled={!root || stats?.records === 0}
              onClick={() => void onForgetSince(w.label, w.ms)}
            >
              {w.label}
            </Button>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="ml-auto h-7 border-destructive/40 text-[11.5px] text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={!root || stats?.records === 0}
            onClick={() => setConfirmForgetAll(true)}
          >
            Everything for this workspace
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmForgetAll} onOpenChange={setConfirmForgetAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Forget this workspace's history?</AlertDialogTitle>
            <AlertDialogDescription>
              {stats
                ? `${formatSpan(stats)} and ${formatBytes(stats.blobBytes)} of captured output will be deleted from disk.`
                : "The recorded command history for this workspace will be deleted from disk."}{" "}
              The bytes are removed, not marked as deleted. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void onForgetWorkspace()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Forget everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
