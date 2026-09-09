import { Icon } from "@/components/icon";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { pickModels } from "@/modules/benchmark/lib/api";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/format";
import { TASK_LABELS, type ModelInfo } from "@/modules/benchmark/lib/types";
import { useBenchStore } from "@/modules/benchmark/store";
import { useFileDrop } from "@/modules/benchmark/lib/useFileDrop";

const FORMAT_STYLES: Record<string, string> = {
  gguf: "bg-llama/15 text-llama",
  onnx: "bg-onnx/15 text-onnx",
};

const formatCtx = (n: number) => (n >= 1024 ? `${Math.round(n / 1024)}K` : `${n}`);

export function ModelLibrary() {
  const models = useBenchStore((s) => s.models);
  const selected = useBenchStore((s) => s.selectedModelIds);
  const toggleModel = useBenchStore((s) => s.toggleModel);
  const removeModel = useBenchStore((s) => s.removeModel);
  const addModels = useBenchStore((s) => s.addModels);
  const { dragging } = useFileDrop();

  const onAdd = async () => {
    const picked = await pickModels();
    if (picked.length) addModels(picked);
  };

  return (
    <Card
      size="sm"
      className={cn(
        "min-h-0 rounded-2xl border border-border/70 bg-card/80 shadow-none",
        dragging && "pane-focus-ring",
      )}
    >
      <CardHeader className="pb-0">
        <div>
          <CardTitle className="text-sm">Models</CardTitle>
          <p className="mt-0.5 text-[11px] text-muted-foreground">The files to compare</p>
        </div>
        <CardAction>
          <Button variant="ghost" size="icon-xs" onClick={onAdd} aria-label="Add models">
            <Icon name="add" size="sm" />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-col gap-1.5">
        {models.length === 0 ? (
          <button
            onClick={onAdd}
            className={cn(
              "flex min-h-32 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border px-4 py-5 text-center transition-colors hover:border-primary/50 hover:bg-primary/5",
              dragging && "border-brand bg-brand/10",
            )}
          >
            <Icon name="folder-open" size="lg" className="text-primary/75" />
            <div className="text-sm font-medium">Add a model to begin</div>
            <div className="text-xs text-muted-foreground">Drop ONNX or GGUF files, or browse.</div>
          </button>
        ) : (
          <div className="-mr-1.5 flex max-h-[34vh] flex-col gap-1.5 overflow-y-auto pr-1.5 nexis-scrollbar">
            {models.map((m) => (
              <ModelRow
                key={m.id}
                model={m}
                selected={selected.includes(m.id)}
                onToggle={() => toggleModel(m.id)}
                onRemove={() => removeModel(m.id)}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ModelRow({
  model,
  selected,
  onToggle,
  onRemove,
}: {
  model: ModelInfo;
  selected: boolean;
  onToggle: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      className={cn(
        "group flex items-center gap-2.5 rounded-lg border px-2.5 py-2 transition-colors",
        selected
          ? "border-primary/40 bg-primary/5"
          : "border-transparent bg-muted/40 hover:bg-muted",
      )}
    >
      <button
        role="checkbox"
        aria-checked={selected}
        onClick={onToggle}
        className={cn(
          "grid size-4 shrink-0 place-items-center rounded-[5px] border transition-colors",
          selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background",
        )}
      >
        {selected && (
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <path
              d="M2.5 6.2 4.8 8.5 9.5 3.5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>

      <button onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
        <Icon
          name={model.format === "onnx" ? "file-code" : "database"}
          size="md"
          className="shrink-0 text-muted-foreground"
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium leading-tight">{model.name}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10.5px] text-muted-foreground">
            <span
              className={cn(
                "rounded px-1 py-px font-semibold uppercase",
                FORMAT_STYLES[model.format],
              )}
            >
              {model.format}
            </span>
            <span>{model.arch ?? TASK_LABELS[model.task]}</span>
            {model.paramsLabel && <span>· {model.paramsLabel}</span>}
            {model.contextLength ? <span>· {formatCtx(model.contextLength)} ctx</span> : null}
            <span>· {formatBytes(model.sizeBytes)}</span>
          </div>
        </div>
      </button>

      <Button
        variant="ghost"
        size="icon-xs"
        onClick={onRemove}
        aria-label="Remove model"
        className="opacity-60 transition-opacity hover:opacity-100 hover:text-destructive focus-visible:opacity-100"
      >
        <Icon name="delete" size="sm" />
      </Button>
    </div>
  );
}
