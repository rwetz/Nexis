// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * ProfilesPanel — manage named workspace profiles.
 *
 * Each profile stores a root path, optional extra env vars, and an optional
 * startup command.  Activating a profile switches the workspace, applies env
 * vars (via the preferences store), and optionally injects the startup command
 * into the active terminal.
 */
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useProfilesStore, type WorkspaceProfile } from "./useProfilesStore";
import { workspaceBasename } from "@/modules/workspace/useRecentWorkspaces";

type ActivateResult = {
  profile: WorkspaceProfile;
  /** Startup command to run in the active terminal, or null if none. */
  startupCommand: string | null;
};

type Props = {
  currentPath: string | null;
  /** Called when the user activates a profile. Switch workspace + inject cmd. */
  onActivate: (result: ActivateResult) => void;
};

type FormState = {
  name: string;
  rootPath: string;
  envVarsRaw: string;  // "KEY=VALUE\nKEY2=VALUE2" multi-line text
  startupCommand: string;
};

const EMPTY_FORM: FormState = { name: "", rootPath: "", envVarsRaw: "", startupCommand: "" };

function parseEnvVars(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const idx = line.indexOf("=");
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim();
      if (key) result[key] = val;
    }
  }
  return result;
}

function formatEnvVars(vars: Record<string, string>): string {
  return Object.entries(vars)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
}

function toForm(p: WorkspaceProfile): FormState {
  return {
    name: p.name,
    rootPath: p.rootPath,
    envVarsRaw: formatEnvVars(p.envVars),
    startupCommand: p.startupCommand,
  };
}

export function ProfilesPanel({ currentPath, onActivate }: Props) {
  const { profiles, add, update, remove } = useProfilesStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [activatedId, setActivatedId] = useState<string | null>(null);

  function startNew() {
    setIsNew(true);
    setEditingId(null);
    setForm({
      ...EMPTY_FORM,
      rootPath: currentPath ?? "",
      name: currentPath ? workspaceBasename(currentPath) : "",
    });
  }

  function startEdit(p: WorkspaceProfile) {
    setIsNew(false);
    setEditingId(p.id);
    setForm(toForm(p));
  }

  function cancelEdit() {
    setIsNew(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function saveEdit() {
    if (!form.rootPath.trim()) return;
    const data = {
      name: form.name.trim() || workspaceBasename(form.rootPath),
      rootPath: form.rootPath.trim(),
      envVars: parseEnvVars(form.envVarsRaw),
      startupCommand: form.startupCommand.trim(),
    };
    if (isNew) {
      add(data);
    } else if (editingId) {
      update(editingId, data);
    }
    cancelEdit();
  }

  function handleActivate(p: WorkspaceProfile) {
    setActivatedId(p.id);
    setTimeout(() => setActivatedId(null), 2000);
    onActivate({
      profile: p,
      startupCommand: p.startupCommand || null,
    });
  }

  const isEditing = isNew || editingId !== null;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border/50 px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Workspace Profiles
        </span>
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={startNew} title="New profile">
          <Icon name="add" />
        </Button>
      </div>

      {/* Edit form */}
      {isEditing && (
        <div className="shrink-0 border-b border-border/50 bg-muted/20 p-3 space-y-2">
          <p className="text-[11px] font-medium text-muted-foreground">
            {isNew ? "New profile" : "Edit profile"}
          </p>
          <div className="space-y-1.5">
            <div className="space-y-1">
              <Label className="text-[10px]">Name</Label>
              <Input
                className="h-7 text-xs"
                placeholder="My Profile"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Root path *</Label>
              <Input
                className="h-7 font-mono text-xs"
                placeholder="/home/user/project"
                value={form.rootPath}
                onChange={(e) => setForm((f) => ({ ...f, rootPath: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Env vars (KEY=VALUE, one per line)</Label>
              <textarea
                className="h-16 w-full resize-none rounded border border-border/60 bg-muted/30 px-2 py-1 font-mono text-[11px] text-foreground outline-none focus:border-primary/60"
                aria-label="Env vars (KEY=VALUE, one per line)"
                placeholder={"NODE_ENV=development\nPORT=3000"}
                value={form.envVarsRaw}
                onChange={(e) => setForm((f) => ({ ...f, envVarsRaw: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Startup command (optional)</Label>
              <Input
                className="h-7 font-mono text-xs"
                placeholder="pnpm dev"
                value={form.startupCommand}
                onChange={(e) => setForm((f) => ({ ...f, startupCommand: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex justify-end gap-1.5 pt-1">
            <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={cancelEdit}>
              <Icon name="close" size="xs" className="mr-1" />
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-6 text-xs"
              onClick={saveEdit}
              disabled={!form.rootPath.trim()}
            >
              Save
            </Button>
          </div>
        </div>
      )}

      {/* Profile list */}
      <div className="flex-1 overflow-y-auto">
        {profiles.length === 0 && !isEditing ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
            <Icon name="settings" size="xl" className="text-muted-foreground/30" />
            <p className="text-xs text-muted-foreground">No profiles yet.</p>
            <p className="text-[10px] text-muted-foreground/60">
              Save a named configuration to quickly switch contexts.
            </p>
            <Button size="sm" variant="outline" className="mt-1 h-6 text-xs" onClick={startNew}>
              Create profile
            </Button>
          </div>
        ) : (
          <ul className="divide-y divide-border/30 py-1">
            {profiles.map((p) => {
              const isActive = currentPath === p.rootPath || currentPath === p.rootPath.replace(/\\/g, "/");
              const activated = activatedId === p.id;
              const envCount = Object.keys(p.envVars).length;
              return (
                <li
                  key={p.id}
                  className={cn(
                    "group flex items-start gap-2 px-3 py-2 hover:bg-muted/20",
                    isActive && "bg-primary/5",
                  )}
                >
                  <Icon
                    name="folder-open"
                    className={cn( "mt-0.5 shrink-0", isActive ? "text-primary/70" : "text-muted-foreground/60", )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className={cn("truncate text-xs font-medium", isActive && "text-primary")}>
                      {p.name}
                    </p>
                    <p className="truncate font-mono text-[10px] text-muted-foreground/70">
                      {p.rootPath}
                    </p>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {envCount > 0 && (
                        <span className="rounded bg-muted/60 px-1 py-0.5 font-mono text-[9px] text-muted-foreground">
                          {envCount} env var{envCount !== 1 ? "s" : ""}
                        </span>
                      )}
                      {p.startupCommand && (
                        <span className="rounded bg-muted/60 px-1 py-0.5 font-mono text-[9px] text-muted-foreground truncate max-w-[120px]">
                          {p.startupCommand}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-5 w-5"
                        title="Edit"
                        onClick={() => startEdit(p)}
                      >
                        <Icon name="edit" size="xs" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-5 w-5 text-destructive/70 hover:text-destructive"
                        title="Delete"
                        onClick={() => remove(p.id)}
                      >
                        <Icon name="delete" size="xs" />
                      </Button>
                    </div>
                    {activated ? (
                      <div className="flex items-center gap-1 text-[10px] text-green-500">
                        <Icon name="success" size="xs" />
                        Activated
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant={isActive ? "outline" : "default"}
                        className="h-5 text-[10px] px-2"
                        onClick={() => handleActivate(p)}
                      >
                        {isActive ? "Reopen" : "Activate"}
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
