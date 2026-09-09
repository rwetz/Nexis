import { Icon } from "@/components/icon";
import { formatBytes, formatCount, relativeTime, type RepoCity } from "@/modules/atlas/repos/types";
import { formatSoloTime, formatTypingTime, projectStats } from "./projectStats";

/** Project context for a city view: facts first, then clearly-labelled fun. */
export function ProjectIntelligence({ city }: { city: RepoCity }) {
  const stats = projectStats(city.root);
  const { summary } = city;

  return (
    <section className="rounded-xl border border-primary/20 bg-primary/[0.045] p-3">
      <div className="flex items-start gap-2">
        <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <Icon name="activity" size="sm" />
        </div>
        <div className="min-w-0">
          <h2 className="text-xs font-semibold">Project intelligence</h2>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            Measured source, then a little size-based perspective.
          </p>
        </div>
      </div>

      {stats.lines > 0 ? (
        <>
          <div className="mt-3 rounded-lg border border-primary/15 bg-background/50 px-3 py-2.5">
            <div className="text-[10px] font-medium text-muted-foreground">Measured source lines</div>
            <div className="mt-0.5 font-mono text-2xl font-semibold tracking-tight text-primary tabular-nums">
              {formatCount(stats.lines)}
            </div>
            <div className="mt-1 text-[10px] text-muted-foreground">
              {formatCount(stats.codeFiles)} readable source files · {formatBytes(stats.codeBytes)} counted
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <Signal icon="file-code" label="Code density" value={`${formatCount(Math.round(stats.averageLines))} LOC/file`} />
            <Signal icon="clock" label="Typing only" value={formatTypingTime(stats.typingMinutes)} />
            <Signal icon="wrench" label="Solo build guess" value={formatSoloTime(stats.soloDays)} />
            <Signal icon="activity" label="Coffee hypothesis" value={`${formatCount(stats.coffeeCups)} cups`} />
          </div>
          <p className="mt-3 border-t border-primary/15 pt-2 text-[10px] leading-relaxed text-muted-foreground">
            Playful estimates assume 80 finished lines per focused day and 40 words per minute.
            Architecture, review, and debugging are gloriously not predictable.
          </p>
        </>
      ) : (
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          No readable source lines were counted. This project may be assets, binaries, or generated files.
        </p>
      )}

      <div className="mt-3 flex items-center gap-1.5 border-t border-primary/15 pt-2 text-[10px] text-muted-foreground">
        <Icon name="clock" size="xs" />
        Last commit {relativeTime(summary.last_commit?.time ?? null)}
      </div>
    </section>
  );
}

function Signal({
  icon,
  label,
  value,
}: {
  icon: "activity" | "clock" | "file-code" | "wrench";
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/40 px-2.5 py-2">
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <Icon name={icon} size="xs" />
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1 truncate font-mono text-xs font-medium tabular-nums" title={value}>
        {value}
      </div>
    </div>
  );
}
