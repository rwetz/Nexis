// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Settings → AI → Orb: which orb the assistant shows, with a live preview of
 * each state.
 *
 * Every tile is a real WebGL canvas, and webviews cap live contexts at about
 * sixteen, evicting the oldest past that. So only the selected tile and the
 * one under the pointer animate; the rest draw one settled frame and stop.
 */
import { useState } from "react";
import { Icon } from "@/components/icon";
import { LazyShaderOrb } from "@/components/orbs/LazyShaderOrb";
import type { AiOrbPref } from "@/components/orbs/ids";
import { ORB_STATES, type OrbState } from "@/components/orbs/types";
import { ORB_VARIANTS } from "@/components/orbs/variants";
import { cn } from "@/lib/utils";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setAiOrbId } from "@/modules/settings/store";
import { SectionHeader } from "../components/SectionHeader";

const STATE_LABELS: Record<OrbState, string> = {
  idle: "Idle",
  thinking: "Thinking",
  speaking: "Speaking",
};

export function OrbSection() {
  const selected = usePreferencesStore((s) => s.aiOrbId);
  const [hovered, setHovered] = useState<string | null>(null);
  const [previewState, setPreviewState] = useState<OrbState>("thinking");
  const current = ORB_VARIANTS.find((v) => v.key === selected);

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title="Orb"
        description="The shape the assistant takes. It rests in a new chat, and follows the agent while it thinks, waits on an approval, or answers. Colours come from your theme."
      />

      {current ? (
        <div className="flex items-center gap-4 rounded-lg border border-border/60 bg-card/60 px-4 py-3">
          <LazyShaderOrb variant={current.key} state={previewState} size={96} />
          <div className="flex min-w-0 flex-col gap-2">
            <div>
              <div className="text-[13px] font-semibold">{current.label}</div>
              <div className="text-[11px] leading-relaxed text-muted-foreground">{current.note}</div>
            </div>
            <div role="radiogroup" aria-label="Preview state" className="flex gap-1">
              {ORB_STATES.map((st) => (
                <button
                  key={st}
                  type="button"
                  role="radio"
                  aria-checked={st === previewState}
                  onClick={() => setPreviewState(st)}
                  className={cn(
                    "rounded-md border px-2 py-0.5 text-[11px] transition-colors",
                    st === previewState
                      ? "border-primary/50 bg-primary/10 text-foreground"
                      : "border-border/60 text-muted-foreground hover:bg-muted/50",
                  )}
                >
                  {STATE_LABELS[st]}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <div role="radiogroup" aria-label="Orb" className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {ORB_VARIANTS.map((v) => {
          const active = v.key === selected;
          return (
            <button
              key={v.key}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => void setAiOrbId(v.key as AiOrbPref)}
              onPointerEnter={() => setHovered(v.key)}
              onPointerLeave={() => setHovered((h) => (h === v.key ? null : h))}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-lg border px-2 pt-2.5 pb-2 transition-colors",
                "focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
                active ? "border-primary/50 bg-primary/10" : "border-border/60 bg-background/40 hover:bg-muted/50",
              )}
            >
              <LazyShaderOrb
                variant={v.key}
                size={64}
                still={!active && hovered !== v.key}
                label={`${v.label} orb`}
              />
              <span className="flex items-center gap-1 text-[11.5px] font-medium">
                {v.label}
                {active ? <Icon name="check" size="xs" className="text-primary" /> : null}
              </span>
            </button>
          );
        })}
        <button
          type="button"
          role="radio"
          aria-checked={selected === "off"}
          onClick={() => void setAiOrbId("off")}
          className={cn(
            "flex flex-col items-center justify-center gap-1.5 rounded-lg border px-2 pt-2.5 pb-2 transition-colors",
            "focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
            selected === "off"
              ? "border-primary/50 bg-primary/10"
              : "border-border/60 bg-background/40 hover:bg-muted/50",
          )}
        >
          <span className="flex size-16 items-center justify-center">
            <img src="/nexis-logo.png" alt="" className="size-8 opacity-80" />
          </span>
          <span className="flex items-center gap-1 text-[11.5px] font-medium">
            Off
            {selected === "off" ? <Icon name="check" size="xs" className="text-primary" /> : null}
          </span>
        </button>
      </div>
      <p className="text-[10.5px] leading-relaxed text-muted-foreground">
        Off keeps the Nexis mark in a new chat and the plain spinner while the agent works. With reduced motion on,
        orbs draw one still frame.
      </p>
    </div>
  );
}
