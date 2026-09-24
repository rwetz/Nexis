// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { memo, type ReactElement } from "react";
import type { GraphEdge, GraphRow } from "./lib/graph";

export const LANE_WIDTH = 16;
export const RAIL_PADDING_X = 8;
export const MAX_VISIBLE_LANES = 6;

const STRAIGHT_WIDTH = 1.8;
const CURVE_WIDTH = 1.8;

/** Gutter reserved for the `+N` overflow badge, when one is shown. */
const BADGE_GUTTER = 16;
/** Last lane that gets its own column; everything beyond folds onto it. */
const LAST_LANE = MAX_VISIBLE_LANES - 1;

/**
 * Horizontal centre of a lane.
 *
 * Clamped, which is the whole point. `railWidth` only ever reserves
 * MAX_VISIBLE_LANES columns, but nothing previously stopped an edge on lane
 * 11 from being drawn at its true offset — so on a history with a dozen
 * concurrent branches (a run of Dependabot merges will do it) the lanes
 * marched straight out of the rail and across the SHA column. Folding
 * everything past the last column onto that column keeps the drawing inside
 * the box it was measured for, and the `+N` badge is what tells the reader
 * the fold happened.
 */
function laneX(lane: number): number {
  return RAIL_PADDING_X + Math.min(lane, LAST_LANE) * LANE_WIDTH;
}

export function railWidth(maxLane: number): number {
  const visible = Math.min(maxLane, MAX_VISIBLE_LANES);
  // The badge sits in its own gutter rather than on top of the last lane —
  // overlaid, it collided with both the lane it sat on and the SHA beside it.
  const gutter = maxLane > MAX_VISIBLE_LANES ? BADGE_GUTTER : 0;
  return RAIL_PADDING_X * 2 + Math.max(0, visible - 1) * LANE_WIDTH + 6 + gutter;
}

type Props = {
  row: GraphRow;
  rowHeight: number;
  maxLaneCount: number;
  active?: boolean;
};

function renderTopEdge(edge: GraphEdge, midY: number): ReactElement | null {
  if (edge.kind === "straight") {
    const x = laneX(edge.lane);
    return (
      <line
        key={`t-s-${edge.lane}`}
        x1={x}
        y1={0}
        x2={x}
        y2={midY}
        stroke={edge.color}
        strokeWidth={STRAIGHT_WIDTH}
        strokeLinecap="round"
      />
    );
  }
  if (edge.kind === "merge") {
    const xFrom = laneX(edge.fromLane);
    const xTo = laneX(edge.toLane);
    const c1y = midY * 0.55;
    return (
      <path
        key={`t-m-${edge.fromLane}-${edge.toLane}`}
        d={`M ${xFrom} 0 C ${xFrom} ${c1y}, ${xTo} ${c1y}, ${xTo} ${midY}`}
        fill="none"
        stroke={edge.color}
        strokeWidth={CURVE_WIDTH}
        strokeLinecap="round"
      />
    );
  }
  return null;
}

function renderBottomEdge(
  edge: GraphEdge,
  midY: number,
  bottomY: number,
): ReactElement | null {
  if (edge.kind === "straight") {
    const x = laneX(edge.lane);
    return (
      <line
        key={`b-s-${edge.lane}`}
        x1={x}
        y1={midY}
        x2={x}
        y2={bottomY}
        stroke={edge.color}
        strokeWidth={STRAIGHT_WIDTH}
        strokeLinecap="round"
      />
    );
  }
  if (edge.kind === "branch") {
    const xFrom = laneX(edge.fromLane);
    const xTo = laneX(edge.toLane);
    const c1y = midY + (bottomY - midY) * 0.45;
    return (
      <path
        key={`b-b-${edge.fromLane}-${edge.toLane}`}
        d={`M ${xFrom} ${midY} C ${xFrom} ${c1y}, ${xTo} ${c1y}, ${xTo} ${bottomY}`}
        fill="none"
        stroke={edge.color}
        strokeWidth={CURVE_WIDTH}
        strokeLinecap="round"
      />
    );
  }
  return null;
}

export const GraphRail = memo(function GraphRail({
  row,
  rowHeight,
  maxLaneCount,
  active,
}: Props) {
  const width = railWidth(maxLaneCount);
  const midY = Math.round(rowHeight / 2);
  const nodeX = laneX(row.lane);

  const visible = Math.min(maxLaneCount, MAX_VISIBLE_LANES);
  const overflow = row.laneCount > visible;

  return (
    <svg
      width={width}
      height={rowHeight}
      viewBox={`0 0 ${width} ${rowHeight}`}
      aria-hidden
      // Clipped, not `overflow-visible`. Visible overflow is what let the
      // lanes and the badge paint over the SHA column; the padding and the
      // badge gutter above are sized so nothing that belongs to the rail
      // needs to escape it.
      className="shrink-0"
    >
      {row.topEdges.map((e) => renderTopEdge(e, midY))}
      {row.bottomEdges.map((e) => renderBottomEdge(e, midY, rowHeight))}
      {/* Commit node */}
      <circle
        cx={nodeX}
        cy={midY}
        r={active ? 5 : 4}
        fill={row.nodeColor}
        stroke="var(--background)"
        strokeWidth={1.8}
      />
      {active ? (
        <circle
          cx={nodeX}
          cy={midY}
          r={7}
          fill="none"
          stroke={row.nodeColor}
          strokeOpacity={0.3}
          strokeWidth={1.6}
        />
      ) : null}
      {overflow ? (
        <text
          x={width - 3}
          y={midY + 3}
          textAnchor="end"
          className="fill-muted-foreground"
          style={{ fontSize: 8 }}
        >
          +{row.laneCount - visible}
        </text>
      ) : null}
    </svg>
  );
});
