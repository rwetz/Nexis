import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { TASK_LABELS, type TaskType } from "@/lib/types";
import { useBenchStore } from "@/store/useBenchStore";

const TASKS: TaskType[] = ["generation", "classification", "embedding"];

export function ConfigPanel() {
  const config = useBenchStore((s) => s.config);
  const setConfig = useBenchStore((s) => s.setConfig);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Benchmark protocol</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {/* Task segmented control */}
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted/50 p-1">
          {TASKS.map((t) => (
            <button
              key={t}
              onClick={() => setConfig({ task: t })}
              className={cn(
                "rounded-md px-1.5 py-1.5 text-[11px] font-medium transition-colors",
                config.task === t
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {TASK_LABELS[t].split(" ")[0]}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <NumberField
            label="Runs"
            hint="measured"
            value={config.runs}
            min={1}
            max={100}
            onChange={(v) => setConfig({ runs: v })}
          />
          <NumberField
            label="Warm-up"
            hint="discarded"
            value={config.warmup}
            min={0}
            max={20}
            onChange={(v) => setConfig({ warmup: v })}
          />
          {config.task === "generation" ? (
            <>
              <NumberField
                label="Prompt tok"
                value={config.promptTokens}
                min={1}
                max={8192}
                step={16}
                onChange={(v) => setConfig({ promptTokens: v })}
              />
              <NumberField
                label="Gen tok"
                value={config.maxTokens}
                min={1}
                max={8192}
                step={16}
                onChange={(v) => setConfig({ maxTokens: v })}
              />
            </>
          ) : (
            <NumberField
              label="Batch"
              value={config.batchSize}
              min={1}
              max={512}
              onChange={(v) => setConfig({ batchSize: v })}
            />
          )}
        </div>

        <PresetBar />
      </CardContent>
    </Card>
  );
}

function PresetBar() {
  const presets = useBenchStore((s) => s.presets);
  const savePreset = useBenchStore((s) => s.savePreset);
  const applyPreset = useBenchStore((s) => s.applyPreset);
  const deletePreset = useBenchStore((s) => s.deletePreset);
  const [name, setName] = useState<string | null>(null);

  const commit = () => {
    const n = (name ?? "").trim();
    if (n) savePreset(n);
    setName(null);
  };

  return (
    <div className="flex flex-col gap-1.5 border-t border-border/60 pt-3">
      <div className="flex items-center justify-between">
        <span className="text-[10.5px] font-medium text-muted-foreground">Presets</span>
        {name === null ? (
          <button onClick={() => setName("")} className="text-[10.5px] text-brand hover:underline">
            + Save current
          </button>
        ) : (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") setName(null);
            }}
            onBlur={commit}
            placeholder="preset name…"
            className="h-6 w-32 rounded-md border border-border bg-input/40 px-2 text-[11px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
          />
        )}
      </div>
      {presets.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {presets.map((p) => (
            <span
              key={p.id}
              className="group flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px]"
            >
              <button onClick={() => applyPreset(p.id)} className="hover:text-foreground" title="Apply preset">
                {p.name}
              </button>
              <button
                onClick={() => deletePreset(p.id)}
                aria-label="Delete preset"
                className="text-muted-foreground/50 hover:text-destructive"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function NumberField({
  label,
  hint,
  value,
  min = 0,
  max = 9999,
  step = 1,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-baseline justify-between text-[10.5px] font-medium text-muted-foreground">
        {label}
        {hint && <span className="text-muted-foreground/50">{hint}</span>}
      </span>
      <div className="flex items-center rounded-lg border border-border bg-input/40 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30">
        <button
          tabIndex={-1}
          onClick={() => onChange(clamp(value - step))}
          className="grid h-8 w-7 place-items-center text-muted-foreground hover:text-foreground"
        >
          −
        </button>
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(clamp(Number(e.target.value) || 0))}
          className="w-full min-w-0 bg-transparent text-center font-mono text-sm outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        />
        <button
          tabIndex={-1}
          onClick={() => onChange(clamp(value + step))}
          className="grid h-8 w-7 place-items-center text-muted-foreground hover:text-foreground"
        >
          +
        </button>
      </div>
    </label>
  );
}
