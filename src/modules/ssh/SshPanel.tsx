import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Add01Icon, Delete01Icon, PencilEdit01Icon, TerminalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";
import { buildSshCommand, newSshId, type SshConnection, useSshStore } from "./sshStore";

type Props = {
  onConnect: (command: string, label: string) => void;
};

type FormState = {
  label: string;
  host: string;
  port: string;
  user: string;
  identityFile: string;
};

const EMPTY_FORM: FormState = { label: "", host: "", port: "22", user: "", identityFile: "" };

function toForm(c: SshConnection): FormState {
  return { label: c.label, host: c.host, port: String(c.port), user: c.user, identityFile: c.identityFile ?? "" };
}

function fromForm(form: FormState, id: string): SshConnection {
  return {
    id,
    label: form.label.trim() || form.host.trim(),
    host: form.host.trim(),
    port: Math.max(1, Math.min(65535, parseInt(form.port, 10) || 22)),
    user: form.user.trim() || (typeof window !== "undefined" ? "" : ""),
    identityFile: form.identityFile.trim() || undefined,
  };
}

export function SshPanel({ onConnect }: Props) {
  const { hydrated, connections, hydrate, upsert, remove } = useSshStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [isNew, setIsNew] = useState(false);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  function startNew() {
    setIsNew(true);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function startEdit(conn: SshConnection) {
    setIsNew(false);
    setEditingId(conn.id);
    setForm(toForm(conn));
  }

  function cancelEdit() {
    setEditingId(null);
    setIsNew(false);
    setForm(EMPTY_FORM);
  }

  function saveEdit() {
    if (!form.host.trim()) return;
    const id = isNew ? newSshId() : editingId!;
    upsert(fromForm(form, id));
    cancelEdit();
  }

  const isEditing = isNew || editingId !== null;

  if (!hydrated) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b border-border/50 px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          SSH Connections
        </span>
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={startNew} title="Add connection">
          <HugeiconsIcon icon={Add01Icon} size={13} strokeWidth={2} />
        </Button>
      </div>

      {isEditing && (
        <div className="shrink-0 border-b border-border/50 bg-muted/20 px-3 py-3 space-y-2">
          <p className="text-[11px] font-medium text-muted-foreground mb-1">
            {isNew ? "New connection" : "Edit connection"}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2 space-y-1">
              <Label className="text-[10px]">Label</Label>
              <Input
                className="h-7 text-xs"
                placeholder="My Server"
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              />
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-[10px]">Host *</Label>
              <Input
                className="h-7 text-xs"
                placeholder="192.168.1.1"
                value={form.host}
                onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">User</Label>
              <Input
                className="h-7 text-xs"
                placeholder="root"
                value={form.user}
                onChange={(e) => setForm((f) => ({ ...f, user: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Port</Label>
              <Input
                className="h-7 text-xs"
                type="number"
                min={1}
                max={65535}
                value={form.port}
                onChange={(e) => setForm((f) => ({ ...f, port: e.target.value }))}
              />
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-[10px]">Identity file (optional)</Label>
              <Input
                className="h-7 text-xs"
                placeholder="~/.ssh/id_rsa"
                value={form.identityFile}
                onChange={(e) => setForm((f) => ({ ...f, identityFile: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex justify-end gap-1.5 pt-1">
            <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={cancelEdit}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-6 text-xs"
              onClick={saveEdit}
              disabled={!form.host.trim()}
            >
              Save
            </Button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {connections.length === 0 && !isEditing ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
            <HugeiconsIcon icon={TerminalIcon} size={24} strokeWidth={1.5} className="text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground">No SSH connections saved.</p>
            <Button size="sm" variant="outline" className="h-6 text-xs" onClick={startNew}>
              Add connection
            </Button>
          </div>
        ) : (
          <ul className="divide-y divide-border/30">
            {connections.map((conn) => {
              const cmd = buildSshCommand(conn);
              return (
                <li
                  key={conn.id}
                  className="group flex items-center gap-2 px-3 py-2 hover:bg-muted/30"
                >
                  <HugeiconsIcon
                    icon={TerminalIcon}
                    size={13}
                    strokeWidth={1.75}
                    className="shrink-0 text-muted-foreground/60"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{conn.label}</p>
                    <p className="truncate text-[10px] text-muted-foreground font-mono">{cmd}</p>
                  </div>
                  <div className={cn(
                    "flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100",
                  )}>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-5 w-5"
                      title="Edit"
                      onClick={() => startEdit(conn)}
                    >
                      <HugeiconsIcon icon={PencilEdit01Icon} size={11} strokeWidth={2} />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-5 w-5 text-destructive/70 hover:text-destructive"
                      title="Delete"
                      onClick={() => remove(conn.id)}
                    >
                      <HugeiconsIcon icon={Delete01Icon} size={11} strokeWidth={2} />
                    </Button>
                  </div>
                  <Button
                    size="sm"
                    className="h-6 shrink-0 text-xs"
                    onClick={() => onConnect(cmd, conn.label)}
                  >
                    Connect
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
