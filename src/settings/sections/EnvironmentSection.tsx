// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setTerminalEnvVars } from "@/modules/settings/store";
import {
  Add01Icon,
  Delete02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { SectionHeader } from "../components/SectionHeader";

type Entry = { key: string; value: string };

export function EnvironmentSection() {
  const saved = usePreferencesStore((s) => s.terminalEnvVars);

  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [keyError, setKeyError] = useState("");

  const entries: Entry[] = Object.entries(saved).map(([key, value]) => ({
    key,
    value,
  }));

  const save = async (updated: Record<string, string>) => {
    await setTerminalEnvVars(updated);
  };

  const handleAdd = async () => {
    const k = newKey.trim();
    if (!k) {
      setKeyError("Name is required.");
      return;
    }
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) {
      setKeyError("Name must be a valid identifier (letters, numbers, _).");
      return;
    }
    setKeyError("");
    const updated = { ...saved, [k]: newValue };
    await save(updated);
    setNewKey("");
    setNewValue("");
  };

  const handleDelete = async (key: string) => {
    const updated = { ...saved };
    delete updated[key];
    await save(updated);
  };

  const handleValueChange = async (key: string, value: string) => {
    const updated = { ...saved, [key]: value };
    await save(updated);
  };

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Environment variables"
        description="Injected into every new terminal session. Changes take effect when a new tab is opened."
      />

      <div className="flex flex-col gap-2">
        {entries.length === 0 && (
          <p className="text-[11.5px] text-muted-foreground">
            No environment variables set.
          </p>
        )}
        {entries.map(({ key, value }) => (
          <div
            key={key}
            className="flex items-center gap-2 rounded-lg border border-border/60 bg-card/60 px-3 py-2"
          >
            <span className="w-40 shrink-0 truncate font-mono text-[12px] font-medium">
              {key}
            </span>
            <span className="text-[11px] text-muted-foreground">=</span>
            <Input
              className="h-7 min-w-0 flex-1 font-mono text-[12px]"
              value={value}
              onChange={(e) => void handleValueChange(key, e.target.value)}
              onBlur={(e) => void handleValueChange(key, e.target.value)}
            />
            <button
              type="button"
              onClick={() => void handleDelete(key)}
              className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
              aria-label={`Remove ${key}`}
            >
              <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={1.75} />
            </button>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-[11.5px] font-medium text-muted-foreground">Add variable</p>
        <div className="flex items-start gap-2">
          <div className="flex flex-col gap-1">
            <Input
              className="h-8 w-40 font-mono text-[12px]"
              placeholder="NAME"
              value={newKey}
              onChange={(e) => {
                setNewKey(e.target.value);
                setKeyError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleAdd();
              }}
            />
            {keyError && (
              <span className="text-[10.5px] text-destructive">{keyError}</span>
            )}
          </div>
          <span className="mt-2 text-[11px] text-muted-foreground">=</span>
          <Input
            className="h-8 min-w-0 flex-1 font-mono text-[12px]"
            placeholder="value"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleAdd();
            }}
          />
          <Button
            size="sm"
            variant="outline"
            className="h-8 shrink-0"
            onClick={() => void handleAdd()}
          >
            <HugeiconsIcon icon={Add01Icon} size={13} strokeWidth={1.75} />
            Add
          </Button>
        </div>
      </div>
    </div>
  );
}
