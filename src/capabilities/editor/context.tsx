import { createContext, useContext, type ReactNode, type RefObject } from "react";
import type { FileExplorerHandle, FileExplorerProps } from "@/modules/explorer";

export type ExplorerCapabilityHost = FileExplorerProps & {
  explorerRef: RefObject<FileExplorerHandle | null>;
};

const Context = createContext<ExplorerCapabilityHost | null>(null);

export function ExplorerCapabilityHostProvider({
  value,
  children,
}: {
  value: ExplorerCapabilityHost;
  children: ReactNode;
}) {
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useExplorerCapabilityHost(): ExplorerCapabilityHost {
  const value = useContext(Context);
  if (!value) throw new Error("Explorer capability requires a workbench host");
  return value;
}
