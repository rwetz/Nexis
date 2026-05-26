import { Switch } from "@/components/ui/switch";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  DEFAULT_FORMATTERS,
  FORMATTER_LANGUAGE_LABELS,
  setFormatOnSave,
  setFormatters,
  type FormatterLanguage,
} from "@/modules/settings/store";
import { SectionHeader } from "../components/SectionHeader";
import { SettingRow } from "../components/SettingRow";

export function FormattersSection() {
  const formatters = usePreferencesStore((s) => s.formatters);
  const formatOnSave = usePreferencesStore((s) => s.formatOnSave);

  const setEnabled = (lang: FormatterLanguage, enabled: boolean) => {
    void setFormatters({ ...formatters, [lang]: { ...formatters[lang], enabled } });
  };

  const setCommand = (lang: FormatterLanguage, command: string) => {
    void setFormatters({ ...formatters, [lang]: { ...formatters[lang], command } });
  };

  const resetCommand = (lang: FormatterLanguage) => {
    void setFormatters({
      ...formatters,
      [lang]: { ...formatters[lang], command: DEFAULT_FORMATTERS[lang].command },
    });
  };

  const langs = Object.keys(FORMATTER_LANGUAGE_LABELS) as FormatterLanguage[];

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Formatters"
        description="Run external tools to format your code. Use {file} as a placeholder for the filename — the command runs in the file's directory."
      />

      <div className="flex flex-col gap-2">
        <Label>On save</Label>
        <SettingRow
          title="Format on save"
          description="Automatically run the configured formatter when saving a file (Ctrl+S)."
        >
          <Switch
            checked={formatOnSave}
            onCheckedChange={(v) => void setFormatOnSave(v)}
          />
        </SettingRow>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Per-language formatters</Label>
        <div className="flex flex-col divide-y divide-border/40 rounded-lg border border-border/60 overflow-hidden">
          {langs.map((lang) => {
            const cfg = formatters[lang] ?? DEFAULT_FORMATTERS[lang];
            const isDefault = cfg.command === DEFAULT_FORMATTERS[lang].command;
            return (
              <div
                key={lang}
                className="flex items-center gap-3 bg-card/60 px-3 py-2.5"
              >
                <div className="w-36 shrink-0">
                  <span className="text-[12.5px] font-medium">
                    {FORMATTER_LANGUAGE_LABELS[lang]}
                  </span>
                </div>
                <div className="flex flex-1 items-center gap-1.5 min-w-0">
                  <input
                    type="text"
                    value={cfg.command}
                    onChange={(e) => setCommand(lang, e.target.value)}
                    spellCheck={false}
                    className="h-7 flex-1 min-w-0 rounded border border-border bg-background px-2 font-mono text-[11px] outline-none focus:border-foreground/40"
                  />
                  {!isDefault && (
                    <button
                      type="button"
                      onClick={() => resetCommand(lang)}
                      className="shrink-0 text-[10.5px] text-muted-foreground hover:text-foreground transition-colors"
                      title="Reset to default"
                    >
                      Reset
                    </button>
                  )}
                </div>
                <div className="shrink-0">
                  <Switch
                    checked={cfg.enabled}
                    onCheckedChange={(v) => setEnabled(lang, v)}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Formatter must be installed and available on your PATH.{" "}
          <span className="font-mono text-[10.5px]">{"{"}</span>
          <span className="font-mono text-[10.5px]">file</span>
          <span className="font-mono text-[10.5px]">{"}"}</span>
          {" "}is replaced with the filename.
        </p>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-medium tracking-tight text-muted-foreground">
      {children}
    </span>
  );
}
