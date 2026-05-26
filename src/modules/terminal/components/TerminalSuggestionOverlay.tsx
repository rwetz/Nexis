import { usePreferencesStore } from "@/modules/settings/preferences";

type Props = {
  text: string;
  x: number;
  y: number;
};

export function TerminalSuggestionOverlay({ text, x, y }: Props) {
  const fontFamily = usePreferencesStore((s) => s.terminalFontFamily);
  const fontSize = usePreferencesStore((s) => s.terminalFontSize * s.zoomLevel);
  const letterSpacing = usePreferencesStore((s) => s.terminalLetterSpacing);

  return (
    <div
      className="pointer-events-none absolute z-20"
      style={{ left: x, top: y }}
    >
      <span
        style={{
          fontFamily: fontFamily || "monospace",
          fontSize,
          letterSpacing: letterSpacing ? `${letterSpacing}px` : undefined,
          lineHeight: 1.5,
          opacity: 0.45,
          fontStyle: "italic",
          color: "var(--terminal-foreground, currentColor)",
          whiteSpace: "pre",
          userSelect: "none",
        }}
      >
        {text}
      </span>
    </div>
  );
}
