export type ActivationContext = {
  activePanelId: string | null;
  inputFocused: boolean;
};
export type CommandScope = "global" | { panelId: string; allowInInput?: boolean };
export type PanelLifecycle = "unmount" | "retain";

export function assertContributionId(id: string): void {
  if (!/^[a-z][a-z0-9-]*[.:][a-zA-Z][a-zA-Z0-9.:-]*$/.test(id)) {
    throw new Error(`Contribution id must be namespaced: ${id}`);
  }
}

export function commandEnabled(
  command: { scope?: CommandScope; enabled?: (context: ActivationContext) => boolean },
  context: ActivationContext,
): boolean {
  const scope = command.scope ?? "global";
  if (scope !== "global" && (scope.panelId !== context.activePanelId || (context.inputFocused && !scope.allowInInput))) return false;
  return command.enabled?.(context) ?? true;
}
