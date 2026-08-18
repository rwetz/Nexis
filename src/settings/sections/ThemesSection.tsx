// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  setBackgroundAnimatedId,
  setBackgroundBlur,
  setBackgroundImageId,
  setBackgroundKind,
  setBackgroundOpacity,
} from "@/modules/settings/store";
import type { AnimatedBgId } from "@/modules/settings/store";
import { useTheme } from "@/modules/theme";
import {
  deleteBgImage,
  importBgImageFromFile,
} from "@/modules/theme/bgImageStore";
import { deleteCustomTheme, saveCustomTheme } from "@/modules/theme/customThemes";
import { deleteThemeFile, emitThemeEdit } from "@/modules/theme/themeFiles";
import {
  getBuiltinTheme,
  listCommunityThemes,
  listNexisThemes,
} from "@/modules/theme/themes";
import { validateTheme } from "@/modules/theme/validateTheme";
import { DEFAULT_THEME_ID } from "@/modules/theme/types";
import type { Theme } from "@/modules/theme/types";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useRef, useState } from "react";
import { SectionHeader } from "../components/SectionHeader";

// ─── Animated background option metadata ─────────────────────────────────────

const ANIMATED_BG_DEFS: { id: AnimatedBgId; label: string; description: string }[] = [
  { id: "aurora",    label: "Aurora",    description: "Northern lights" },
  { id: "particles", label: "Particles", description: "Floating orbs"   },
  { id: "threads",   label: "Threads",   description: "Flowing lines"   },
];

function lightenHex(hex: string, amount: number): string {
  const h = hex.replace(/^#/, "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  if (isNaN(n)) return hex;
  const bump = Math.round(amount * 255);
  const clamp = (v: number) => Math.min(255, Math.max(0, v + bump));
  const r = clamp(n >> 16 & 255);
  const g = clamp(n >> 8 & 255);
  const b = clamp(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

function getThemePrimary(
  themeId: string,
  resolvedMode: "dark" | "light",
  customThemes: Theme[],
): string {
  if (themeId === DEFAULT_THEME_ID)
    return resolvedMode === "dark" ? "#5227FF" : "#4318D6";
  const theme = customThemes.find((t) => t.id === themeId) ?? getBuiltinTheme(themeId);
  const variant = theme?.variants[resolvedMode] ?? theme?.variants.dark ?? theme?.variants.light;
  return variant?.colors?.primary ?? (resolvedMode === "dark" ? "#5227FF" : "#4318D6");
}

function animBgPreview(id: AnimatedBgId, primary: string): string {
  const mid = lightenHex(primary, 0.28);
  if (id === "aurora")
    return `linear-gradient(135deg, ${primary} 0%, ${mid} 50%, ${primary} 100%)`;
  if (id === "particles")
    return `radial-gradient(ellipse at 40% 40%, ${mid} 0%, ${primary} 60%, #0a0a1a 100%)`;
  // threads
  return `linear-gradient(to bottom, #0a0a1a 0%, ${primary} 50%, #0a0a1a 100%)`;
}

export function ThemesSection() {
  const { themeId, setThemeId, resolvedMode, customThemes } = useTheme();
  const nexisThemes = listNexisThemes();
  const communityThemes = listCommunityThemes();

  const [importError, setImportError] = useState<string | null>(null);
  const [bgError, setBgError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bgInputRef = useRef<HTMLInputElement | null>(null);

  const onCreateTheme = () => {
    void emitThemeEdit({ action: "create" });
    void getCurrentWindow().hide();
  };

  const onEditTheme = (id: string) => {
    void emitThemeEdit({ action: "edit", id });
    void getCurrentWindow().hide();
  };

  const backgroundKind = usePreferencesStore((s) => s.backgroundKind);
  const backgroundImageId = usePreferencesStore((s) => s.backgroundImageId);
  const backgroundAnimatedId = usePreferencesStore((s) => s.backgroundAnimatedId);
  const backgroundOpacity = usePreferencesStore((s) => s.backgroundOpacity);
  const backgroundBlur = usePreferencesStore((s) => s.backgroundBlur);

  const handleThemeFiles = async (files: FileList | null) => {
    setImportError(null);
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const result = validateTheme(parsed);
        if (!result.ok) {
          setImportError(`${file.name}: ${result.error}`);
          return;
        }
        await saveCustomTheme(result.theme);
        setThemeId(result.theme.id);
      } catch (e) {
        setImportError(
          `${file.name}: ${e instanceof Error ? e.message : "failed to read"}`,
        );
        return;
      }
    }
  };

  const onPickThemeFile = () => fileInputRef.current?.click();

  const onRemoveCustomTheme = async (id: string) => {
    if (themeId === id) setThemeId(DEFAULT_THEME_ID);
    await deleteCustomTheme(id);
    void deleteThemeFile(id);
  };

  const onPickBgFile = () => bgInputRef.current?.click();

  const handleBgFiles = async (files: FileList | null) => {
    setBgError(null);
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.type.startsWith("image/")) {
      setBgError(`${file.name}: not an image`);
      return;
    }
    try {
      const prev = backgroundImageId;
      const { id } = await importBgImageFromFile(file);
      await setBackgroundImageId(id);
      await setBackgroundKind("image");
      if (prev && prev !== id) await deleteBgImage(prev).catch(() => undefined);
    } catch (e) {
      setBgError(e instanceof Error ? e.message : "failed to import image");
    }
  };

  const onRemoveBackground = async () => {
    setBgError(null);
    const prev = backgroundImageId;
    await setBackgroundKind("none");
    await setBackgroundImageId(null);
    if (prev) await deleteBgImage(prev).catch(() => undefined);
  };

  const onSetNone = async () => {
    setBgError(null);
    if (backgroundKind === "image" && backgroundImageId) {
      // Also delete the stored file to free space
      const prev = backgroundImageId;
      await setBackgroundKind("none");
      await setBackgroundImageId(null);
      await deleteBgImage(prev).catch(() => undefined);
    } else {
      await setBackgroundKind("none");
    }
  };

  const onActivateImage = async () => {
    setBgError(null);
    await setBackgroundKind("image");
  };

  const onActivateAnimated = async () => {
    await setBackgroundKind("animated");
    if (!backgroundAnimatedId) {
      await setBackgroundAnimatedId("aurora");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Themes"
        description="Theme, background image, and customization."
      />

      <div
        className="flex flex-col gap-2"
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDrop={(e) => {
          e.preventDefault();
          void handleThemeFiles(e.dataTransfer.files);
        }}
      >
        <div className="flex items-center justify-between">
          <Label>Theme</Label>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 px-2 text-[11px]"
              onClick={onCreateTheme}
            >
              <Icon name="add" size="xs" />
              Create
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-[11px]"
              onClick={onPickThemeFile}
            >
              Import .nexis-theme
            </Button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".nexis-theme,.json,application/json"
            className="hidden"
            onChange={(e) => {
              void handleThemeFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
        {importError ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-[11.5px] text-destructive">
            {importError}
          </div>
        ) : null}
        <ThemeGroup
          label="Nexis"
          hint="Designed as a set — one contrast ramp across six hue families."
          themes={nexisThemes}
          themeId={themeId}
          resolvedMode={resolvedMode}
          onSelect={setThemeId}
        />

        <ThemeGroup
          label="Community themes"
          hint="Palettes by their original authors, kept as they designed them."
          themes={communityThemes}
          themeId={themeId}
          resolvedMode={resolvedMode}
          onSelect={setThemeId}
        />

        {customThemes.length > 0 ? (
          <ThemeGroup
            label="Your themes"
            themes={customThemes}
            themeId={themeId}
            resolvedMode={resolvedMode}
            onSelect={setThemeId}
            onEdit={onEditTheme}
            onRemove={(id) => void onRemoveCustomTheme(id)}
          />
        ) : null}
      </div>

      <div
        className="flex flex-col gap-2"
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDrop={(e) => {
          e.preventDefault();
          void handleBgFiles(e.dataTransfer.files);
        }}
      >
        <Label>Background</Label>

        {/* Mode selector */}
        <div className="flex gap-0.5 rounded-md border border-border/60 bg-muted/30 p-0.5">
          {(["none", "image", "animated"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              className={cn(
                "flex-1 cursor-pointer rounded-sm py-1 text-[11px] font-medium capitalize transition-all",
                backgroundKind === mode
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
              onClick={() => {
                if (mode === "none") void onSetNone();
                else if (mode === "image") void onActivateImage();
                else void onActivateAnimated();
              }}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>

        {bgError ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-[11.5px] text-destructive">
            {bgError}
          </div>
        ) : null}

        {/* Image mode */}
        {backgroundKind === "image" && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-[11px]"
                onClick={onPickBgFile}
              >
                {backgroundImageId ? "Change image" : "Choose image"}
              </Button>
              {backgroundImageId ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-[11px] text-muted-foreground hover:text-destructive"
                  onClick={() => void onRemoveBackground()}
                >
                  Remove
                </Button>
              ) : null}
              <input
                ref={bgInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  void handleBgFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>
            {backgroundImageId ? (
              <div className="flex flex-col gap-3 rounded-lg border border-border/60 p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11.5px] text-muted-foreground">
                    Opacity
                  </span>
                  <span className="tabular-nums text-[11px] text-muted-foreground">
                    {Math.round(backgroundOpacity * 100)}%
                  </span>
                </div>
                <Slider
                  value={[backgroundOpacity]}
                  min={0}
                  max={1}
                  step={0.01}
                  onValueChange={(v) => void setBackgroundOpacity(v[0] ?? 0)}
                />
                <div className="flex items-center justify-between gap-3 pt-1">
                  <span className="text-[11.5px] text-muted-foreground">
                    Blur
                  </span>
                  <span className="tabular-nums text-[11px] text-muted-foreground">
                    {backgroundBlur}px
                  </span>
                </div>
                <Slider
                  value={[backgroundBlur]}
                  min={0}
                  max={64}
                  step={1}
                  onValueChange={(v) => void setBackgroundBlur(v[0] ?? 0)}
                />
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Drop an image here or pick one. Stored locally; doesn't affect
                the default look until set.
              </p>
            )}
          </div>
        )}

        {/* Animated mode */}
        {backgroundKind === "animated" && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-3 gap-2">
              {ANIMATED_BG_DEFS.map((opt) => {
                const primary = getThemePrimary(themeId, resolvedMode, customThemes);
                const preview = animBgPreview(opt.id, primary);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => void setBackgroundAnimatedId(opt.id)}
                    className={cn(
                      "flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border p-2.5 text-left transition-all",
                      backgroundAnimatedId === opt.id
                        ? "border-foreground/60 ring-1 ring-foreground/20"
                        : "border-border/60 hover:border-border hover:bg-muted/30",
                    )}
                  >
                    <div
                      className="h-9 w-full rounded-md"
                      style={{ background: preview }}
                    />
                    <span className="w-full text-center text-[11.5px] font-medium">
                      {opt.label}
                    </span>
                    <span className="w-full text-center text-[10.5px] leading-tight text-muted-foreground">
                      {opt.description}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="flex flex-col gap-3 rounded-lg border border-border/60 p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11.5px] text-muted-foreground">
                  Opacity
                </span>
                <span className="tabular-nums text-[11px] text-muted-foreground">
                  {Math.round(backgroundOpacity * 100)}%
                </span>
              </div>
              <Slider
                value={[backgroundOpacity]}
                min={0}
                max={1}
                step={0.01}
                onValueChange={(v) => void setBackgroundOpacity(v[0] ?? 0)}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ThemeGroup({
  label,
  hint,
  themes,
  themeId,
  resolvedMode,
  onSelect,
  onEdit,
  onRemove,
}: {
  label: string;
  hint?: string;
  themes: Theme[];
  themeId: string;
  resolvedMode: "dark" | "light";
  onSelect: (id: string) => void;
  onEdit?: (id: string) => void;
  onRemove?: (id: string) => void;
}) {
  if (themes.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5 pt-1">
      <div className="flex items-baseline gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        {hint ? (
          <span className="truncate text-[10.5px] text-muted-foreground/70">
            {hint}
          </span>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {themes.map((t) => {
          const v =
            t.variants[resolvedMode] ?? t.variants.dark ?? t.variants.light;
          const c = v?.colors;
          const swatchBg = c?.background ?? "var(--background)";
          const swatchFg = c?.foreground ?? "var(--foreground)";
          const swatchAccent = c?.primary ?? c?.accent ?? "var(--accent)";
          const swatchMuted = c?.muted ?? "var(--muted)";
          const selected = themeId === t.id;
          const subtitle = t.author
            ? `by ${t.author}`
            : (t.description ?? null);
          return (
            // The card is a plain container, not a button: it holds Edit and
            // Remove, and a control nested inside a button loses its own
            // semantics (and is invalid HTML). The select action is its own
            // button filling the row instead.
            <div
              key={t.id}
              className={cn(
                "group flex items-center gap-3 rounded-lg border p-2.5 transition-all",
                selected
                  ? "border-foreground/60 ring-1 ring-foreground/20"
                  : "border-border/60 hover:border-border",
              )}
            >
              <button
                type="button"
                onClick={() => onSelect(t.id)}
                title={t.description}
                aria-pressed={selected}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <div
                  className="flex h-10 w-14 shrink-0 items-center justify-center gap-1 rounded-md border border-border/40"
                  style={{ background: swatchBg }}
                >
                  <span
                    className="h-5 w-2 rounded-sm"
                    style={{ background: swatchAccent }}
                  />
                  <span
                    className="h-5 w-2 rounded-sm"
                    style={{ background: swatchFg, opacity: 0.7 }}
                  />
                  <span
                    className="h-5 w-2 rounded-sm"
                    style={{ background: swatchMuted }}
                  />
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[12.5px] font-medium">
                    {t.name}
                  </span>
                  {subtitle ? (
                    <span className="truncate text-[11px] text-muted-foreground">
                      {subtitle}
                    </span>
                  ) : null}
                </div>
              </button>
              {onEdit && onRemove ? (
                <span className="ml-1 flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                  <button
                    type="button"
                    aria-label={`Edit ${t.name}`}
                    className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={() => onEdit(t.id)}
                  >
                    <Icon name="edit" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${t.name}`}
                    className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive"
                    onClick={() => onRemove(t.id)}
                  >
                    ×
                  </button>
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs font-semibold text-foreground/70">
      {children}
    </span>
  );
}
