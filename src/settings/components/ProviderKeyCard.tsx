// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { Icon } from "@/components/icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { ProviderInfo } from "@/modules/ai/config";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useState } from "react";
import { ProviderIcon } from "./ProviderIcon";

type Props = {
  provider: ProviderInfo;
  currentKey: string | null;
  onSave: (key: string) => Promise<void>;
  onClear: () => Promise<void>;
  onRemove?: () => void;
};

function maskKey(key: string): string {
  if (key.length <= 8) return "•".repeat(key.length);
  return `${key.slice(0, 4)}${"•".repeat(8)}${key.slice(-4)}`;
}

export function ProviderKeyCard({
  provider,
  currentKey,
  onSave,
  onClear,
  onRemove,
}: Props) {
  const [editing, setEditing] = useState(!currentKey);
  const [value, setValue] = useState("");
  const [reveal, setReveal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEditing(!currentKey);
  }, [currentKey]);

  const submit = async () => {
    const trimmed = value.trim();
    if (!trimmed) {
      setError("Enter your API key.");
      return;
    }
    if (provider.keyPrefix && !trimmed.startsWith(provider.keyPrefix)) {
      setError(`${provider.label} keys start with "${provider.keyPrefix}".`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(trimmed);
      setValue("");
      setReveal(false);
    } catch (e) {
      setError(`Failed to save: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-card/60 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <ProviderIcon provider={provider.id} size={15} />
        <span className="text-[12.5px] font-medium">{provider.label}</span>
        {currentKey ? (
          <Badge
            variant="outline"
            className="ml-1 h-4 gap-1 border-border/60 bg-muted/40 px-1.5 text-[10px] font-normal text-muted-foreground"
          >
            <Icon name="success" size="xs" />
            Connected
          </Badge>
        ) : null}
        <button
          type="button"
          onClick={() => void openUrl(provider.consoleUrl)}
          className="ml-auto inline-flex items-center gap-0.5 text-[10.5px] text-muted-foreground transition-colors hover:text-foreground"
        >
          Get key
          <Icon name="external" size="xs" />
        </button>
        {onRemove ? (
          <Button
            size="icon"
            variant="ghost"
            onClick={onRemove}
            title="Remove provider"
            className="size-7 text-muted-foreground hover:text-destructive"
          >
            <Icon name="close" />
          </Button>
        ) : null}
      </div>

      {editing ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex gap-1.5">
            <div className="relative flex-1">
              <Input
                type={reveal ? "text" : "password"}
                autoComplete="off"
                spellCheck={false}
                placeholder={
                  provider.keyPrefix
                    ? `${provider.keyPrefix}…`
                    : "Paste API key"
                }
                value={value}
                disabled={saving}
                onChange={(e) => {
                  setValue(e.target.value);
                  if (error) setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void submit();
                  } else if (e.key === "Escape" && currentKey) {
                    setValue("");
                    setReveal(false);
                    setError(null);
                    setEditing(false);
                  }
                }}
                className="h-8 pr-7 font-mono text-[11.5px]"
              />
              <button
                type="button"
                onClick={() => setReveal((v) => !v)}
                tabIndex={-1}
                className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground"
                aria-label={reveal ? "Hide key" : "Show key"}
              >
                <Icon name={reveal ? "hidden" : "visible"} />
              </button>
            </div>
            <Button
              size="sm"
              onClick={() => void submit()}
              disabled={saving || !value.trim()}
              className="h-8 gap-1 px-3 text-[11px]"
            >
              {saving ? <Spinner className="size-3" /> : null}
              Save
            </Button>
          </div>
          {error ? (
            <p className="text-[10.5px] text-destructive">{error}</p>
          ) : null}
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <code
            className={cn(
              "flex-1 truncate rounded bg-muted/40 px-2 py-1 font-mono text-[11px] text-muted-foreground",
            )}
          >
            {maskKey(currentKey ?? "")}
          </code>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setEditing(true)}
            title="Replace"
            className="size-7"
          >
            <Icon name="edit" />
          </Button>
          {!onRemove ? (
            <Button
              size="icon"
              variant="ghost"
              onClick={() => void onClear()}
              title="Remove"
              className="size-7 text-muted-foreground hover:text-destructive"
            >
              <Icon name="close" />
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
