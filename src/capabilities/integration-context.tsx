import { createContext, useContext, type ReactNode } from "react";

export type IntegrationCapabilityHost = {
  workspaceRoot: string | null;
  openPreview(url: string): void;
  openSshSession(command: string, label: string): void;
  openMlNetwork(input: { projectDir: string }): void;
};

const Context = createContext<IntegrationCapabilityHost | null>(null);

export function IntegrationCapabilityHostProvider({
  value,
  children,
}: {
  value: IntegrationCapabilityHost;
  children: ReactNode;
}) {
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useIntegrationCapabilityHost(): IntegrationCapabilityHost {
  const value = useContext(Context);
  if (!value) throw new Error("Integration capability requires a workbench host");
  return value;
}
