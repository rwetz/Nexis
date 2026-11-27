// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Browse more backgrounds: the welcome-background library
 * (rwetz/nexis-backgrounds) as a gallery grouped by collection. Each card
 * downloads, updates or removes one background; a download is verified
 * against the index's size and SHA-256 before it is kept (see
 * backgroundLibrary.ts). Installing one also selects it, since that is
 * nearly always why it was downloaded.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { SkeletonCard } from "@/components/ui/skeleton";
import { formatBytes } from "@/lib/format";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setWelcomeBackgroundId } from "@/modules/settings/store";
import {
  compareVersions,
  fetchIndex,
  install,
  type InstalledSummary,
  LIBRARY_PAGE,
  type LibraryEntry,
  libraryPrefId,
  listInstalled,
  posterUrl,
  uninstall,
} from "@/modules/welcome/backgroundLibrary";
import { openHostUrl } from "@/platform/opener";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The installed list changed; the picker re-reads it. */
  onChanged: () => void;
};

export function BackgroundLibraryDialog({ open, onOpenChange, onChanged }: Props) {
  const [index, setIndex] = useState<LibraryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [installed, setInstalled] = useState<InstalledSummary[]>([]);
  const [busy, setBusy] = useState<Record<string, number>>({});
  const [itemError, setItemError] = useState<Record<string, string>>({});
  const selected = usePreferencesStore((s) => s.welcomeBackgroundId);

  const load = useCallback(() => {
    setError(null);
    setIndex(null);
    fetchIndex()
      .then(setIndex)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    listInstalled()
      .then(setInstalled)
      .catch(() => setInstalled([]));
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const groups = useMemo(() => {
    const out = new Map<string, LibraryEntry[]>();
    for (const e of index ?? []) {
      const key = e.collection || "More";
      out.set(key, [...(out.get(key) ?? []), e]);
    }
    return [...out.entries()];
  }, [index]);

  const download = async (entry: LibraryEntry) => {
    setItemError(({ [entry.id]: _drop, ...rest }) => rest);
    setBusy((b) => ({ ...b, [entry.id]: 0 }));
    try {
      await install(entry, (f) => setBusy((b) => ({ ...b, [entry.id]: Math.min(1, f) })));
      setInstalled(await listInstalled());
      onChanged();
      await setWelcomeBackgroundId(libraryPrefId(entry.id));
    } catch (e) {
      setItemError((x) => ({ ...x, [entry.id]: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy(({ [entry.id]: _drop, ...rest }) => rest);
    }
  };

  const remove = async (entry: LibraryEntry) => {
    await uninstall(entry.id);
    setInstalled(await listInstalled());
    onChanged();
    if (selected === libraryPrefId(entry.id)) await setWelcomeBackgroundId("ward");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Welcome backgrounds</DialogTitle>
          <DialogDescription>
            Looping ASCII dioramas from the Nexis background library. Each is a short video
            (about 10 MB) kept on this computer once downloaded.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <div className="flex flex-col items-start gap-3 rounded-lg border border-border p-4">
            <span className="text-ui text-destructive">{error}</span>
            <Button size="sm" variant="outline" onClick={load}>
              <Icon name="refresh" size="sm" />
              Try again
            </Button>
          </div>
        ) : index === null ? (
          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: 6 }, (_, i) => (
              // react-doctor-disable-next-line react-doctor/no-array-index-as-key -- static placeholders
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : index.length === 0 ? (
          <span className="text-ui text-muted-foreground">The library is empty right now.</span>
        ) : (
          <div className="flex flex-col gap-5">
            {groups.map(([collection, entries]) => (
              <section key={collection} className="flex flex-col gap-2">
                <h3 className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">
                  {collection}
                </h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {entries.map((e) => {
                    const have = installed.find((x) => x.id === e.id);
                    const update = !!have && compareVersions(e.version, have.version) > 0;
                    const progress = busy[e.id];
                    const isSelected = selected === libraryPrefId(e.id);
                    return (
                      <div
                        key={e.id}
                        className="flex flex-col overflow-hidden rounded-xl border border-border bg-card"
                      >
                        <img
                          src={posterUrl(e)}
                          alt=""
                          loading="lazy"
                          draggable={false}
                          className="aspect-[16/10] w-full bg-muted object-cover"
                        />
                        <div className="flex flex-1 flex-col gap-1 p-2.5">
                          <span className="text-ui font-medium">{e.name}</span>
                          <span className="line-clamp-2 text-caption leading-snug text-muted-foreground">
                            {e.description}
                          </span>
                          {itemError[e.id] ? (
                            <span className="text-caption text-destructive">{itemError[e.id]}</span>
                          ) : null}
                          <div className="mt-auto flex items-center gap-1.5 pt-1.5">
                            {progress !== undefined ? (
                              <Progress value={progress * 100} className="h-1.5 flex-1" />
                            ) : !have || update ? (
                              <Button size="xs" variant={update ? "outline" : "default"} onClick={() => void download(e)}>
                                <Icon name={update ? "refresh" : "download"} size="xs" />
                                {update ? "Update" : "Download"}
                                <span className="tabular-nums text-muted-foreground">{formatBytes(e.bytes)}</span>
                              </Button>
                            ) : (
                              <>
                                <Button
                                  size="xs"
                                  variant={isSelected ? "secondary" : "outline"}
                                  disabled={isSelected}
                                  onClick={() => void setWelcomeBackgroundId(libraryPrefId(e.id))}
                                >
                                  <Icon name="check" size="xs" />
                                  {isSelected ? "In use" : "Use"}
                                </Button>
                                <Button
                                  size="icon-xs"
                                  variant="ghost"
                                  aria-label={`Remove ${e.name}`}
                                  onClick={() => void remove(e)}
                                >
                                  <Icon name="delete" size="xs" />
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between text-caption text-muted-foreground">
          <span>Backgrounds are videos only: nothing downloaded runs as code.</span>
          <Button size="xs" variant="ghost" onClick={() => void openHostUrl(LIBRARY_PAGE)}>
            View the library on GitHub
            <Icon name="external" size="xs" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
