import {
  gutter,
  GutterMarker,
} from "@codemirror/view";
import type { EditorView } from "@codemirror/view";
import {
  StateField,
  StateEffect,
  RangeSet,
  RangeSetBuilder,
} from "@codemirror/state";
import type { Extension, Transaction } from "@codemirror/state";

// ── Effects ───────────────────────────────────────────────────────────────────

export const setBreakpointEffect = StateEffect.define<{
  line: number; // 1-based
  on: boolean;
}>();

export const setCurrentLineEffect = StateEffect.define<number | null>();

// ── Markers ───────────────────────────────────────────────────────────────────

class BreakpointMarker extends GutterMarker {
  constructor(readonly verified: boolean) {
    super();
  }
  override toDOM() {
    const el = document.createElement("div");
    el.className = `cm-breakpoint ${this.verified ? "cm-breakpoint-verified" : "cm-breakpoint-unverified"}`;
    el.title = this.verified ? "Breakpoint" : "Breakpoint (unverified)";
    return el;
  }
}

class CurrentLineMarker extends GutterMarker {
  override toDOM() {
    const el = document.createElement("div");
    el.className = "cm-current-line-arrow";
    el.title = "Current execution point";
    return el;
  }
}

// ── State fields ──────────────────────────────────────────────────────────────

export const breakpointField = StateField.define<RangeSet<BreakpointMarker>>({
  create() {
    return RangeSet.empty;
  },
  update(markers, tr: Transaction) {
    markers = markers.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setBreakpointEffect)) {
        const line = tr.state.doc.line(e.value.line);
        if (e.value.on) {
          markers = markers.update({
            add: [new BreakpointMarker(false).range(line.from)],
            filter: (from) => from !== line.from,
          });
        } else {
          markers = markers.update({
            filter: (from) => from !== line.from,
          });
        }
      }
    }
    return markers;
  },
});

export const currentLineField = StateField.define<number | null>({
  create() {
    return null;
  },
  update(val, tr: Transaction) {
    for (const e of tr.effects) {
      if (e.is(setCurrentLineEffect)) return e.value;
    }
    return val;
  },
});

// ── Gutter ────────────────────────────────────────────────────────────────────

/**
 * Build the breakpoint + current-line gutter extension.
 * `onToggle` is called with 1-based line number when the user clicks.
 */
export function breakpointGutter(
  onToggle: (path: string, line: number) => void,
  getPath: () => string,
): Extension {
  return [
    breakpointField,
    currentLineField,
    gutter({
      class: "cm-breakpoint-gutter",
      markers(view) {
        const set = view.state.field(breakpointField);
        const currentLine = view.state.field(currentLineField);
        if (currentLine == null) return set;

        // Merge current-line arrow marker
        try {
          const line = view.state.doc.line(currentLine);
          const builder = new RangeSetBuilder<GutterMarker>();
          let added = false;
          set.between(0, view.state.doc.length, (from, _to, marker) => {
            if (!added && from >= line.from) {
              builder.add(line.from, line.from, new CurrentLineMarker());
              added = true;
            }
            builder.add(from, from, marker);
          });
          if (!added) builder.add(line.from, line.from, new CurrentLineMarker());
          return builder.finish();
        } catch {
          return set;
        }
      },
      domEventHandlers: {
        mousedown(view: EditorView, line, event) {
          if ((event as MouseEvent).button !== 0) return false;
          const lineNo = view.state.doc.lineAt(line.from).number;
          onToggle(getPath(), lineNo);
          return true;
        },
      },
      initialSpacer: () => new BreakpointMarker(false),
    }),
  ];
}

/** Sync breakpoint state field with the breakpoint store. */
export function syncBreakpointsToView(
  view: EditorView,
  _path: string,
  lines: number[],
): void {
  const lineSet = new Set(lines);
  const effects: StateEffect<unknown>[] = [];

  // Clear all existing breakpoints for this view
  const existing = view.state.field(breakpointField);
  existing.between(0, view.state.doc.length, (from) => {
    const lineNo = view.state.doc.lineAt(from).number;
    effects.push(setBreakpointEffect.of({ line: lineNo, on: false }));
  });

  // Add current ones
  for (const line of lineSet) {
    effects.push(setBreakpointEffect.of({ line, on: true }));
  }

  if (effects.length) {
    view.dispatch({ effects });
  }
}

/** Update the current execution line in the view (null to clear). */
export function setCurrentLine(
  view: EditorView,
  line: number | null,
): void {
  view.dispatch({ effects: setCurrentLineEffect.of(line) });
}
