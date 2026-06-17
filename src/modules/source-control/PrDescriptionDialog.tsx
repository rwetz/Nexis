// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ModelId } from "@/modules/ai/config";
import { native } from "@/modules/ai/lib/native";
import { useChatStore } from "@/modules/ai/store/chatStore";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  AiContentGenerator02Icon,
  Copy01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  repoRoot: string;
  selectedModelId: string;
};

const PR_SYSTEM_PROMPT = `You write clear, helpful GitHub pull request descriptions in Markdown.
Return exactly two parts separated by a line that is just "---":
1. A concise PR title (one line, no heading markup, under 72 chars)
2. A Markdown body with: a short "## Summary" section (2-4 bullet points), and a "## Changes" section listing the key changes grouped logically.
Use present tense. No fluff. No mention of the AI or this prompt.`;

function buildPrPrompt(commits: Array<{ subject: string; sha: string }>): string {
  const log = commits
    .slice(0, 20)
    .map((c) => `- ${c.sha.slice(0, 7)}: ${c.subject}`)
    .join("\n");
  return `Generate a pull request title and description for a branch with these commits:\n\n${log}`;
}

export function PrDescriptionDialog({ open, onClose, repoRoot, selectedModelId }: Props) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const [{ buildConfiguredLanguageModel }, { generateText }, commits] =
        await Promise.all([
          import("@/modules/ai/lib/agent"),
          import("ai"),
          native.gitLog(repoRoot, { limit: 20 }),
        ]);
      const prefs = usePreferencesStore.getState();
      const chatState = useChatStore.getState();
      const model = await buildConfiguredLanguageModel(selectedModelId as ModelId, chatState.apiKeys, {
        lmstudioBaseURL: prefs.lmstudioBaseURL,
        lmstudioModelId: prefs.lmstudioModelId,
        mlxBaseURL: prefs.mlxBaseURL,
        mlxModelId: prefs.mlxModelId,
        ollamaBaseURL: prefs.ollamaBaseURL,
        ollamaModelId: prefs.ollamaModelId,
        vllmBaseURL: prefs.vllmBaseURL,
        vllmModelId: prefs.vllmModelId,
        xllmBaseURL: prefs.xllmBaseURL,
        xllmModelId: prefs.xllmModelId,
        sglangBaseURL: prefs.sglangBaseURL,
        sglangModelId: prefs.sglangModelId,
        openaiCompatibleBaseURL: prefs.openaiCompatibleBaseURL,
        openaiCompatibleModelId: prefs.openaiCompatibleModelId,
      });
      const result = await generateText({
        model,
        system: PR_SYSTEM_PROMPT,
        prompt: buildPrPrompt(commits),
        maxOutputTokens: 1024,
        temperature: 0.3,
      });
      const parts = result.text.split(/\n---\n/);
      setTitle((parts[0] ?? "").trim());
      setBody((parts[1] ?? result.text).trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  }

  async function copyAll() {
    const text = title ? `${title}\n\n${body}` : body;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleOpenChange(open: boolean) {
    if (!open) onClose();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[80vh] max-w-2xl flex-col gap-0 p-0">
        <DialogHeader className="border-b border-border/50 px-5 py-4">
          <DialogTitle className="text-base">AI PR Description</DialogTitle>
          <DialogDescription className="text-[12px]">
            Generate a pull request title and description from recent commits.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
          {!title && !body && !generating && !error && (
            <div className="flex flex-col items-center justify-center gap-3 py-8">
              <p className="text-[12.5px] text-muted-foreground">
                Click Generate to create a PR description from recent commits.
              </p>
            </div>
          )}
          {generating && (
            <div className="flex items-center gap-2 py-8 text-[12.5px] text-muted-foreground">
              <div className="size-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              Generating…
            </div>
          )}
          {error && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
              {error}
            </div>
          )}
          {(title || body) && (
            <div className="flex flex-col gap-3">
              {title && (
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Title
                  </label>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="rounded border border-border/60 bg-muted/30 px-2.5 py-1.5 text-[13px] font-medium text-foreground outline-none focus:border-primary/60"
                  />
                </div>
              )}
              {body && (
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Body
                  </label>
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={12}
                    className="resize-none rounded border border-border/60 bg-muted/30 px-2.5 py-1.5 font-mono text-[12px] text-foreground outline-none focus:border-primary/60"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-border/50 px-5 py-3">
          <div className="flex w-full items-center gap-2">
            <Button
              variant="default"
              size="sm"
              disabled={generating}
              onClick={() => void generate()}
              className="gap-1.5"
            >
              <HugeiconsIcon icon={AiContentGenerator02Icon} size={13} strokeWidth={1.75} />
              {generating ? "Generating…" : title || body ? "Regenerate" : "Generate"}
            </Button>
            {(title || body) && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void copyAll()}
                className="gap-1.5"
              >
                <HugeiconsIcon icon={Copy01Icon} size={13} strokeWidth={1.75} />
                {copied ? "Copied!" : "Copy All"}
              </Button>
            )}
            <Button variant="ghost" size="sm" className="ml-auto" onClick={onClose}>
              Close
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
