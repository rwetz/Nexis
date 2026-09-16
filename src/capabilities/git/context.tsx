import { createContext, useContext, type ReactNode } from "react";
import type { SourceControlPanelProps } from "@/modules/source-control/SourceControlPanel";

export type GitCapabilityHost = Omit<SourceControlPanelProps, "open">;

const Context = createContext<GitCapabilityHost | null>(null);

export function GitCapabilityHostProvider({
  value,
  children,
}: {
  value: GitCapabilityHost;
  children: ReactNode;
}) {
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useGitCapabilityHost(): GitCapabilityHost {
  const value = useContext(Context);
  if (!value) throw new Error("Git capability requires a workbench host");
  return value;
}
