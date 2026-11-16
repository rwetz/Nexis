import { Skeleton } from "@/components/ui/skeleton";
import {
  dirtyCount,
  formatBytes,
  formatCount,
  relativeTime,
  type RepoCity,
} from "@/modules/atlas/repos/types";
import { formatSoloTime, projectStats } from "./projectStats";

/**
 * A city's facts at a glance: one number, a few rows, one honest aside.
 *
 * It used to be a card of cards: a headline box, four estimate tiles (typing
 * time, a solo-build guess, coffee) and a paragraph excusing them. The
 * languages already have the canvas legend, so this keeps to what the walk
 * actually measured plus the git state, and lets the single estimate say
 * what it assumes in the same sentence.
 */
export function ProjectIntelligence({ city }: { city: RepoCity }) {
  const stats = projectStats(city.root);
  const { summary } = city;
  const changed = dirtyCount(summary);

  return (
    <section aria-label="Project at a glance" className="flex flex-col gap-3">
      <div>
        <div className="text-2xl font-semibold tracking-tight tabular-nums">
          {formatCount(stats.lines)}
          <span className="ml-1.5 font-sans text-caption font-normal text-muted-foreground">
            lines
          </span>
        </div>
        <div className="mt-0.5 text-caption text-muted-foreground">
          {formatCount(stats.codeFiles)} source files · {formatBytes(stats.codeBytes)}
        </div>
      </div>

      <dl className="flex flex-col gap-1.5 text-caption">
        <Row label="Branch" value={summary.detached ? "detached" : summary.branch} />
        {stats.codeFiles > 0 && (
          <Row label="Average file" value={`${formatCount(Math.round(stats.averageLines))} lines`} />
        )}
        <Row label="Last commit" value={relativeTime(summary.last_commit?.time ?? null)} />
        <Row
          label="Working tree"
          value={changed === 0 ? "clean" : `${formatCount(changed)} changed`}
          tone={changed === 0 ? undefined : "text-brand"}
        />
      </dl>

      {stats.lines > 0 ? (
        <p className="text-micro leading-relaxed text-muted-foreground">
          At 80 finished lines a day, one person would need {formatSoloTime(stats.soloDays).replace("~", "about ")}.
        </p>
      ) : (
        <p className="text-micro leading-relaxed text-muted-foreground">
          No readable source was counted. This may be assets, binaries or generated files.
        </p>
      )}
    </section>
  );
}

/** The same layout while a repo is still being read. */
export function ProjectIntelligenceSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-3">
      <div>
        <Skeleton className="h-7 w-32 rounded-md" />
        <Skeleton className="mt-1.5 h-3 w-40 rounded-md" />
      </div>
      <div className="flex flex-col gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex justify-between">
            <Skeleton className="h-3 w-20 rounded-md" />
            <Skeleton className="h-3 w-14 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={tone ?? "truncate text-foreground/90"} title={value}>
        {value}
      </dd>
    </div>
  );
}
