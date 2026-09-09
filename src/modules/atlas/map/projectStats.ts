import type { TreeNode } from "@/modules/atlas/repos/types";

/**
 * Size-derived context for a project currently open in the Atlas city view.
 *
 * Line counts are real: Atlas counts readable, text-like files while it builds
 * the city. The time figures are deliberately simple, labelled estimates that
 * make a project's scale more intuitive without pretending to be a schedule.
 */
export type ProjectStats = {
  lines: number;
  codeFiles: number;
  codeBytes: number;
  averageLines: number;
  soloDays: number;
  typingMinutes: number;
  coffeeCups: number;
};

const FINISHED_LINES_PER_DAY = 80;
const WORDS_PER_MINUTE = 40;
const CHARS_PER_WORD = 5;

export function projectStats(root: TreeNode): ProjectStats {
  let codeFiles = 0;
  let codeBytes = 0;

  const visit = (node: TreeNode) => {
    if (node.is_dir) {
      node.children.forEach(visit);
      return;
    }
    // A non-zero line count is Atlas's proof that the file was readable,
    // text-like source rather than an asset or oversized generated blob.
    if (node.lines > 0) {
      codeFiles += 1;
      codeBytes += node.bytes;
    }
  };
  visit(root);

  const lines = root.lines;
  const soloDays = lines / FINISHED_LINES_PER_DAY;
  const typingMinutes = codeBytes / (WORDS_PER_MINUTE * CHARS_PER_WORD);

  return {
    lines,
    codeFiles,
    codeBytes,
    averageLines: codeFiles === 0 ? 0 : lines / codeFiles,
    soloDays,
    typingMinutes,
    coffeeCups: Math.ceil(soloDays * 2),
  };
}

export function formatSoloTime(days: number): string {
  if (days < 1) return `~${Math.max(1, Math.ceil(days * 8))}h`;
  if (days < 10) return `~${Math.ceil(days)} days`;
  return `~${Math.ceil(days / 5)} weeks`;
}

export function formatTypingTime(minutes: number): string {
  if (minutes < 60) return `~${Math.max(1, Math.ceil(minutes))} min`;
  return `~${(minutes / 60).toFixed(minutes < 600 ? 1 : 0)}h`;
}
